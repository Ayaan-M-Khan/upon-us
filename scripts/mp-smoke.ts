/**
 * Multiplayer smoke test: boots the real game server in-process on a random port and drives several
 * socket.io clients through the lobby + match lifecycle (join, kick, ready, disconnect/rejoin in the
 * lobby and mid-match, seat expiry, malformed payloads, and a full match through to the return to lobby).
 *
 *   npm run test:mp
 */

process.env.RECONNECT_GRACE_MS = '3000';

import type { AddressInfo } from 'net';
import { io as ioClient, Socket } from 'socket.io-client';
import { EVENTS, GameStateSnapshot, LobbyData } from '../shared/events';
import { createGameServer } from '../server/index';
import { BASE_PLAYER_SPEED, KILL_DISTANCE_M, REPORT_RANGE, TASK_RANGE } from '../shared/constants';
import { findPath } from '../shared/nav';

let failures = 0;
let passes = 0;
function check(cond: unknown, label: string): void {
  if (cond) {
    passes++;
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Client {
  socket: Socket;
  lobby: LobbyData | null = null;
  snap: GameStateSnapshot | null = null;
  events: { name: string; data: any }[] = [];
  constructor(public url: string, public sessionId: string) {
    this.socket = ioClient(url, { transports: ['websocket'], reconnection: false, forceNew: true });
    this.socket.onAny((name, data) => {
      this.events.push({ name, data });
      if (name === EVENTS.LOBBY_STATE) this.lobby = data;
      if (name === EVENTS.STATE_SNAPSHOT) this.snap = data;
    });
  }
  get id() {
    return this.socket.id!;
  }
  async connected() {
    if (this.socket.connected) return;
    await new Promise<void>((r) => this.socket.once('connect', () => r()));
  }
  emit(ev: string, data?: unknown) {
    this.socket.emit(ev, data);
  }
  saw(name: string) {
    return this.events.find((e) => e.name === name);
  }
  clear() {
    this.events = [];
  }
  async waitFor(pred: () => unknown, label: string, timeoutMs = 5000): Promise<boolean> {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      if (pred()) return true;
      await sleep(25);
    }
    console.log(`  (timed out waiting for: ${label})`);
    return false;
  }
  close() {
    this.stopPlaying();
    this.socket.close();
  }

  // ---- Scripted player: plays the match over the real socket protocol (movement, tasks, kills, votes) ----
  private playTimer: NodeJS.Timeout | null = null;
  private path: { x: number; z: number }[] = [];
  private pathGoal = '';
  private pathAt = 0;
  private workingUntil = 0;
  private workingTask: string | null = null;
  private seq = 0;
  stats = { taskSteps: 0, killAttempts: 0, reports: 0, votes: 0 };

  play() {
    this.playTimer = setInterval(() => this.playTick(), 50);
  }
  stopPlaying() {
    if (this.playTimer) clearInterval(this.playTimer);
    this.playTimer = null;
  }
  private moveToward(goal: { x: number; z: number }, range: number, me: { x: number; z: number }) {
    const key = `${goal.x.toFixed(1)},${goal.z.toFixed(1)}`;
    if (key !== this.pathGoal || !this.path.length || Date.now() - this.pathAt > 1500) {
      this.path = findPath(me, goal, range);
      this.pathGoal = key;
      this.pathAt = Date.now();
    }
    while (this.path.length && Math.hypot(this.path[0].x - me.x, this.path[0].z - me.z) < 0.25) this.path.shift();
    const wp = this.path[0] ?? goal;
    const d = Math.hypot(wp.x - me.x, wp.z - me.z);
    const step = Math.min(d, BASE_PLAYER_SPEED * 0.9 * 0.05);
    const x = me.x + ((wp.x - me.x) / (d || 1)) * step;
    const z = me.z + ((wp.z - me.z) / (d || 1)) * step;
    this.emit(EVENTS.PLAYER_INPUT, { seq: ++this.seq, x, z, rotation: Math.atan2(wp.x - me.x, wp.z - me.z), isMoving: true });
  }
  private playTick() {
    const snap = this.snap;
    const me = snap?.players[this.id];
    const you = snap?.you;
    if (!snap || !me || !you) return;
    const now = Date.now();

    if (snap.state === 'MEETING') {
      this.workingTask = null;
      if (snap.meeting?.phase === 'VOTING' && me.isAlive && !snap.meeting.voted.includes(this.id)) {
        this.emit(EVENTS.CAST_VOTE, { targetId: 'skip' });
        this.stats.votes++;
      }
      return;
    }
    if (snap.state !== 'PLAYING' || me.inVent) return;

    if (you.role === 'impostor') {
      if (!me.isAlive) return;
      const mates = new Set(you.teammates.map((t) => t.id));
      const prey = Object.values(snap.players)
        .filter((p) => p.isAlive && p.id !== this.id && !mates.has(p.id) && !p.inVent)
        .sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
      if (!prey) return;
      const d = Math.hypot(prey.x - me.x, prey.z - me.z);
      if (d <= KILL_DISTANCE_M.Short && you.killCooldownMs === 0) {
        this.emit(EVENTS.KILL_ATTEMPT, { targetId: prey.id });
        this.stats.killAttempts++;
      } else {
        this.moveToward(prey, 1, me);
      }
      return;
    }

    // Crew: report any body in range, otherwise work through the task list.
    if (me.isAlive) {
      const body = (snap.bodies ?? []).find((b) => Math.hypot(b.x - me.x, b.z - me.z) <= REPORT_RANGE);
      if (body) {
        this.emit(EVENTS.REPORT_BODY, { bodyId: body.id });
        this.stats.reports++;
        return;
      }
    }
    if (this.workingTask) {
      if (now >= this.workingUntil) {
        this.emit(EVENTS.COMPLETE_TASK_STEP, { taskId: this.workingTask });
        this.stats.taskSteps++;
        this.workingTask = null;
      }
      return;
    }
    const task = you.tasks.find((t) => !t.done);
    if (!task) return;
    if (Math.hypot(task.x - me.x, task.z - me.z) <= TASK_RANGE - 0.3) {
      this.emit(EVENTS.PLAYER_INPUT, { seq: ++this.seq, x: me.x, z: me.z, rotation: me.rotation, isMoving: false });
      this.emit(EVENTS.USE_TASK, { taskId: task.taskId });
      this.workingTask = task.taskId;
      this.workingUntil = now + task.hold * 1000 + 200;
      return;
    }
    this.moveToward(task, TASK_RANGE - 0.6, me);
  }
}

async function main() {
  const { server, lobbyManager, io } = createGameServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  console.log(`server on ${url}`);

  const A = new Client(url, 'sessionAAAA');
  const B = new Client(url, 'sessionBBBB');
  const C = new Client(url, 'sessionCCCC');
  await Promise.all([A.connected(), B.connected(), C.connected()]);

  console.log('\n[lobby: create / join]');
  A.emit(EVENTS.CREATE_LOBBY, { playerName: 'Alice', sessionId: A.sessionId });
  await A.waitFor(() => A.lobby, 'A lobby');
  const code = A.lobby!.code;
  check(/^[A-Z2-9]{5}$/.test(code), `lobby code ${code}`);
  B.emit(EVENTS.JOIN_LOBBY, { code: code.toLowerCase(), playerName: 'Bob', sessionId: B.sessionId });
  C.emit(EVENTS.JOIN_LOBBY, { code, playerName: 'Carol', sessionId: C.sessionId });
  await A.waitFor(() => A.lobby?.players.length === 3, 'three players');
  check(A.lobby?.players.length === 3, 'host sees 3 players');
  check(new Set(A.lobby!.players.map((p) => p.colorId)).size === 3, 'colors are unique');

  console.log('\n[lobby: ready + kick]');
  B.emit(EVENTS.SET_READY, { ready: true });
  await A.waitFor(() => A.lobby?.players.find((p) => p.id === B.id)?.isReady, 'B ready');
  check(A.lobby?.players.find((p) => p.id === B.id)?.isReady === true, 'ready state is broadcast');
  B.emit(EVENTS.KICK_PLAYER, { targetSocketId: C.id });
  await sleep(150);
  check(A.lobby?.players.length === 3, 'non-host cannot kick');
  A.emit(EVENTS.KICK_PLAYER, { targetSocketId: C.id });
  await C.waitFor(() => C.saw(EVENTS.REMOVED_FROM_LOBBY), 'C removed');
  check(!!C.saw(EVENTS.REMOVED_FROM_LOBBY), 'kicked client is told it was removed');
  await A.waitFor(() => A.lobby?.players.length === 2, 'two players');
  check(A.lobby?.players.length === 2, 'kicked player is gone from the lobby');
  C.clear();
  C.emit(EVENTS.START_GAME);
  await sleep(150);
  check(A.lobby?.state === 'LOBBY', 'kicked client cannot act on the lobby');

  console.log('\n[robustness: malformed payloads]');
  const bad = new Client(url, 'x');
  await bad.connected();
  bad.emit(EVENTS.CREATE_LOBBY, { playerName: 12345 });
  bad.emit(EVENTS.JOIN_LOBBY, { code: { evil: true }, playerName: ['x'] });
  bad.emit(EVENTS.UPDATE_SETTINGS, null);
  bad.emit(EVENTS.LOBBY_INPUT, { x: 'NaN', z: null });
  bad.emit(EVENTS.REJOIN, { sessionId: { $ne: 1 } });
  bad.emit(EVENTS.PLAYER_INPUT, null);
  bad.emit(EVENTS.CAST_VOTE, undefined);
  await sleep(300);
  check(bad.socket.connected, 'server survives malformed payloads');
  const lobbyName = bad.lobby?.players[0]?.name;
  check(lobbyName === 'Crewmate', `non-string name is sanitised (got ${lobbyName})`);
  bad.lobby = null;
  bad.emit(EVENTS.CREATE_LOBBY, { playerName: 'Mallory', sessionId: 'sessionMMMM' });
  await bad.waitFor(() => bad.lobby, 'bad lobby');
  bad.emit(EVENTS.UPDATE_SETTINGS, {
    settings: { killDistance: 'Huge', commonTasks: 0, shortTasks: 0, longTasks: 0, impostorCount: 99 },
  });
  await bad.waitFor(() => bad.lobby?.settings.impostorCount === 3, 'settings applied');
  const badSettings = (bad.lobby as LobbyData | null)?.settings;
  check(badSettings?.killDistance === 'Short', 'invalid kill distance rejected');
  check((badSettings?.shortTasks ?? 0) >= 1, 'zero-task configuration is corrected');
  check(badSettings?.impostorCount === 3, 'impostor count clamped');
  bad.close();

  console.log('\n[lobby: disconnect + rejoin]');
  const oldB = B.id;
  B.close();
  await A.waitFor(() => A.lobby?.players.find((p) => p.id === oldB)?.disconnected, 'B shown disconnected');
  check(A.lobby?.players.find((p) => p.id === oldB)?.disconnected === true, 'dropped player is held + flagged');
  const B2 = new Client(url, B.sessionId);
  await B2.connected();
  B2.emit(EVENTS.REJOIN, { sessionId: B.sessionId });
  await B2.waitFor(() => B2.lobby, 'B2 lobby');
  const bRow = A.lobby?.players.find((p) => p.name === 'Bob');
  check(bRow?.id === B2.id && !bRow?.disconnected, 'rejoin re-binds the seat to the new socket');
  check(bRow?.isReady === true && bRow?.colorId === B2.lobby?.players.find((p) => p.id === B2.id)?.colorId, 'seat keeps its state');

  console.log('\n[lobby: duplicated tab cannot steal a live seat]');
  const dup = new Client(url, B.sessionId);
  await dup.connected();
  dup.emit(EVENTS.REJOIN, { sessionId: B.sessionId });
  await dup.waitFor(() => dup.saw(EVENTS.REJOIN_FAILED), 'dup rejected');
  check(dup.saw(EVENTS.REJOIN_FAILED)?.data?.retry === true, 'live seat refused (retryable)');
  check(A.lobby?.players.find((p) => p.name === 'Bob')?.id === B2.id, 'live seat untouched');
  dup.close();

  console.log('\n[match: start, roles, private views]');
  A.emit(EVENTS.UPDATE_SETTINGS, { settings: { killCooldown: 10, discussionTime: 0, votingTime: 15, taskBarUpdates: 'Never' } });
  await sleep(100);
  A.emit(EVENTS.START_GAME);
  await A.waitFor(() => A.saw(EVENTS.GAME_STARTED), 'game started', 6000);
  await A.waitFor(() => A.snap && B2.snap, 'snapshots');
  check(!!A.snap && !!B2.snap, 'both humans receive snapshots');
  check(Object.keys(A.snap!.players).length === 4, '2 humans + 2 bots seated');
  check(!!A.snap!.you && A.snap!.you.role !== undefined, 'private view present');
  check(!('role' in A.snap!.players[B2.id]), 'other players\' roles are not leaked in snapshots');
  check(A.snap!.taskProgress === undefined, 'Task Bar Updates: Never hides crew progress');
  const roleB = B2.snap!.you!.role;
  const tasksB = JSON.stringify(B2.snap!.you!.tasks.map((t) => t.taskId));

  console.log('\n[match: disconnect + rejoin mid-game]');
  await A.waitFor(() => A.snap?.state === 'PLAYING', 'PLAYING', 8000);
  const oldB2 = B2.id;
  B2.close();
  await A.waitFor(() => A.snap?.players[oldB2]?.disconnected, 'B offline in snapshot');
  check(A.snap?.players[oldB2]?.disconnected === true, 'others see the dropped player as offline');
  check(A.snap?.state !== 'GAME_OVER', 'match continues while the seat is held');
  const B3 = new Client(url, B.sessionId);
  await B3.connected();
  B3.emit(EVENTS.REJOIN, { sessionId: B.sessionId });
  await B3.waitFor(() => B3.snap && B3.saw(EVENTS.GAME_STARTED), 'B3 back in match');
  check(!!B3.saw(EVENTS.GAME_STARTED), 'rejoining client is told to enter the match');
  check(B3.snap?.you?.role === roleB, 'role preserved across rejoin');
  check(JSON.stringify(B3.snap?.you?.tasks.map((t) => t.taskId)) === tasksB, 'tasks preserved across rejoin');
  await A.waitFor(() => A.snap?.players[B3.id] && !A.snap.players[oldB2], 'A sees new id');
  check(!!A.snap?.players[B3.id] && !A.snap?.players[B3.id].disconnected, 'others see the player back online');

  console.log('\n[match: input validation]');
  const before = B3.snap!.players[B3.id];
  B3.emit(EVENTS.PLAYER_INPUT, { seq: 1, x: before.x + 500, z: before.z, rotation: 0, isMoving: true });
  await sleep(200);
  const after = B3.snap!.players[B3.id];
  check(Math.hypot(after.x - before.x, after.z - before.z) < 3, 'server clamps teleport attempts');

  console.log('\n[match: play through to game over and back to the lobby]');
  // Both humans now play for real over the socket protocol alongside the bots.
  A.play();
  B3.play();
  const over = await A.waitFor(() => A.saw(EVENTS.GAME_OVER), 'game over', 240000);
  check(over, 'match reaches GAME_OVER');
  const go = A.saw(EVENTS.GAME_OVER)?.data;
  if (go) console.log(`  -> ${go.winner} win: ${go.reason}`);
  console.log(`  -> A ${A.snap?.you?.role} ${JSON.stringify(A.stats)} | B ${B3.snap?.you?.role} ${JSON.stringify(B3.stats)}`);
  A.stopPlaying();
  B3.stopPlaying();
  check(go?.players?.length === 4 && go.players.every((p: any) => p.role), 'game over reveals every role');
  const meetingCount = new Set(
    A.events.filter((e) => e.name === EVENTS.STATE_SNAPSHOT && e.data.meeting).map((e) => e.data.meeting.callerName + e.data.meeting.reason + (e.data.meeting.bodyVictimName ?? ''))
  ).size;
  console.log(`  -> distinct meetings: ${meetingCount}`);
  A.clear();
  await A.waitFor(() => A.lobby?.state === 'LOBBY' && A.saw(EVENTS.LOBBY_STATE), 'back in lobby', 15000);
  check(A.lobby?.state === 'LOBBY', 'everyone returns to the lobby after the match');
  check(A.lobby?.players.length === 2 && A.lobby.players.every((p) => !p.isReady), 'seats kept, ready flags reset');

  console.log('\n[lobby: seat expires when nobody returns]');
  const lastB = B3.id;
  B3.close();
  await A.waitFor(() => A.lobby?.players.length === 1, 'B expired', 6000);
  check(A.lobby?.players.length === 1 && !A.lobby.players.some((p) => p.id === lastB), 'held seat released after grace');
  const late = new Client(url, B.sessionId);
  await late.connected();
  late.emit(EVENTS.REJOIN, { sessionId: B.sessionId });
  await late.waitFor(() => late.saw(EVENTS.REJOIN_FAILED), 'late rejoin rejected');
  check(late.saw(EVENTS.REJOIN_FAILED)?.data?.retry === false, 'expired seat cannot be reclaimed');
  late.close();

  console.log('\n[lobby: host migration]');
  const D = new Client(url, 'sessionDDDD');
  await D.connected();
  D.emit(EVENTS.JOIN_LOBBY, { code, playerName: 'Dave', sessionId: D.sessionId });
  await A.waitFor(() => A.lobby?.players.length === 2, 'D joined');
  A.emit(EVENTS.LEAVE_LOBBY);
  await D.waitFor(() => D.lobby?.hostId === D.id, 'D host');
  check(D.lobby?.hostId === D.id && D.lobby.players[0].isHost, 'host migrates when the host leaves');
  D.emit(EVENTS.LEAVE_LOBBY);
  await sleep(100);

  [A, D].forEach((c) => c.close());
  io.close();
  lobbyManager.destroy();
  server.close();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
