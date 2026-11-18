/**
 * Fast-forward bot simulation: runs whole matches with fake time (no sockets, no real waiting) and
 * reports how they end, how long they take, and whether any bot gets stuck.
 *
 *   npx tsx scripts/bot-sim.ts [games=20] [players=4] [impostors=1]
 */
import { DEFAULT_GAME_SETTINGS, GAME_STATES, PLAYER_COLORS } from '../shared/constants';
import { GameRoom } from '../server/game/GameRoom';

let fakeNow = 1_700_000_000_000;
Date.now = () => fakeNow;

const fakeIo: any = { to: () => ({ emit: () => {} }) };
const games = Number(process.argv[2] || 20);
const players = Number(process.argv[3] || 4);
const impostors = Number(process.argv[4] || 1);
const outcomes: Record<string, number> = {};
let totalMs = 0;
let timeouts = 0;
const sabotages: number[] = [];
let stuckReports = 0;
let ejectedImp = 0;
let ejectedCrew = 0;

for (let g = 0; g < games; g++) {
  const startedAt = fakeNow;
  // Seat N lobby players, then turn every seat into a bot so the match is pure AI.
  const seats = Array.from({ length: players }, (_, i) => ({
    id: `p${i}`, name: `P${i}`, colorId: PLAYER_COLORS[i].id, hatId: 'none', isHost: i === 0,
  }));
  const room = new GameRoom('SIM', fakeIo, { ...DEFAULT_GAME_SETTINGS, impostorCount: impostors, discussionTime: 5, votingTime: 20 }, seats);
  room.destroy(); // stop the real interval; we drive tick() ourselves
  const r: any = room;
  for (const p of room.players.values()) {
    if (!p.isBot) {
      p.isBot = true;
      p.brain = r.newBrain({ x: p.x, z: p.z });
    }
  }
  const roles = [...room.players.values()].map((p) => p.role[0].toUpperCase()).join('');

  const origEnd = r.endGame.bind(r);
  r.endGame = (w: string, reason: string) => {
    r.winReason = reason;
    origEnd(w, reason);
  };
  let meetings = 0;
  const origMeeting = r.startMeeting.bind(r);
  r.startMeeting = (...a: any[]) => {
    if (!r.meeting) meetings++;
    origMeeting(...a);
  };
  const origEject = r.applyEjection.bind(r);
  r.applyEjection = (m: any) => {
    const id = m.results?.ejectedId;
    if (id) {
      const role = room.players.get(id)?.role;
      if (role === 'impostor') ejectedImp++; else ejectedCrew++;
    }
    origEject(m);
  };
  let sabCount = 0;
  const origTrigger = r.triggerSabotage.bind(r);
  r.triggerSabotage = (...a: any[]) => {
    const ok = origTrigger(...a);
    if (ok) sabCount++;
    return ok;
  };
  const lastMoved = new Map<string, { x: number; z: number; at: number }>();
  const limit = fakeNow + 20 * 60 * 1000;
  let over = false;
  r.onEnd = () => (over = true);
  while (!over && fakeNow < limit) {
    fakeNow += 50;
    r.tick();
    if (room.stateMachine.currentState === GAME_STATES.PLAYING) {
      for (const p of room.players.values()) {
        if (!p.isBot || !p.isAlive || !p.brain) continue;
        const prev = lastMoved.get(p.id);
        const working = p.brain.mode === 'work' || p.brain.mode === 'idle';
        if (!prev || Math.hypot(prev.x - p.x, prev.z - p.z) > 0.3 || working) {
          lastMoved.set(p.id, { x: p.x, z: p.z, at: fakeNow });
        } else if (fakeNow - prev.at > 20000) {
          stuckReports++;
          console.log(`  game ${g}: ${p.name} (${p.role}) stuck 20s at (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) mode=${p.brain.mode} room=${p.room}`);
          lastMoved.set(p.id, { x: p.x, z: p.z, at: fakeNow });
        }
      }
    }
    if (room.stateMachine.currentState === GAME_STATES.GAME_OVER && !r.winnerLogged) {
      r.winnerLogged = true;
      const key = `${r.winner}`;
      outcomes[key] = (outcomes[key] || 0) + 1;
      totalMs += fakeNow - startedAt;
      const alive = [...room.players.values()].filter((p) => p.isAlive).length;
      console.log(`game ${g} [${roles}]: ${r.winner} (${r.winReason}) in ${((fakeNow - startedAt) / 1000).toFixed(0)}s, tasks ${(r.taskProgress() * 100).toFixed(0)}%, alive ${alive}, sabotages ${sabCount}, meetings ${meetings}`);
    }
  }
  if (!r.winnerLogged) {
    timeouts++;
    console.log(`game ${g}: NO RESULT after 20 min (tasks ${(r.taskProgress() * 100).toFixed(0)}%)`);
  }
  sabotages.push(sabCount);
}
const finished = games - timeouts;
console.log(`\noutcomes ${JSON.stringify(outcomes)}, timeouts ${timeouts}, avg length ${finished ? (totalMs / finished / 1000).toFixed(0) : '-'}s, avg sabotages ${(sabotages.reduce((a, b) => a + b, 0) / games).toFixed(1)}, stuck reports ${stuckReports}, ejected impostors ${ejectedImp}, ejected innocents ${ejectedCrew}`);
