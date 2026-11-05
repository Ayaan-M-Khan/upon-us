/**
 * Impostor Protocol - Game Room
 * Server-authoritative match simulation at 20 Hz:
 *   roles, tasks, kills, bodies, vents, emergency meetings, voting, win conditions,
 *   and AI bots that fill empty seats so a game can start with fewer than 4 humans.
 */

import { Server } from 'socket.io';
import {
  BASE_PLAYER_SPEED,
  BOT_NAMES,
  GAME_OVER_MS,
  GAME_STATES,
  GameSettings,
  INITIAL_KILL_COOLDOWN_MS,
  KILL_DISTANCE_M,
  MAX_CHAT_LENGTH,
  MEETING_EJECTION_MS,
  MEETING_INTRO_MS,
  MEETING_RESULTS_MS,
  MIN_PLAYERS_TO_START,
  PLAYER_COLORS,
  REPORT_RANGE,
  ROLE_REVEAL_MS,
  TASK_RANGE,
  VENT_RANGE,
  sanitizePlayerName,
} from '../../shared/constants';
import {
  BodyView,
  ChatMessage,
  EVENTS,
  GameOverInfo,
  GameStateSnapshot,
  MeetingResults,
  MeetingView,
  PlayerSnapshot,
  Role,
  SabotageType,
  TaskView,
  YouView,
} from '../../shared/events';
import {
  EMERGENCY_BUTTON_POS,
  EMERGENCY_BUTTON_RANGE,
  MAP_VENTS,
  detectRoom,
  getClosedDoorWalls,
  getRoomSpot,
  getSpawnPosition,
} from '../../shared/mapData';
import { findPath } from '../../shared/nav';
import { lineIntersectsWalls, resolveMovementCollisions } from '../../shared/physics';
import { assignRoles } from './roles';
import { SabotageManager } from './sabotage';
import { GameStateMachine } from './stateMachine';
import { ALL_TASKS, TaskDefinition, pickCommonTasks, pickPersonalTasks } from './tasks';

type Pt = { x: number; z: number };

interface TaskState {
  def: TaskDefinition;
  step: number;
  done: boolean;
}

interface BotBrain {
  mode: 'idle' | 'task' | 'work' | 'repair' | 'wander' | 'body' | 'chase' | 'flee';
  path: Pt[];
  goal: Pt | null;
  goalRange: number;
  nextRouteAt: number;
  thinkAt: number;
  waitUntil: number;
  workEnd: number;
  currentTask: TaskState | null;
  targetId: string | null;
  fleeUntil: number;
  suspectId: string | null;
  voteAt: number;
  chatAt: number;
  chatLine: string | null;
  lastPos: Pt;
  stuckSince: number;
  repairType: SabotageType | null;
}

interface GamePlayer extends PlayerSnapshot {
  role: Role;
  tasks: TaskState[];
  killReadyAt: number;
  ventEnteredAt?: number;
  emergenciesLeft: number;
  ventId: string | null;
  lastInputAt: number;
  working: { taskId: string; startedAt: number } | null;
  lastChatAt: number;
  engineerVentReadyAt: number;
  engineerVentEndsAt: number;
  brain?: BotBrain;
}

interface Body extends BodyView {
  killerId: string;
  room: string;
}

interface Meeting {
  phase: MeetingView['phase'];
  endsAt: number;
  callerId: string;
  callerName: string;
  callerColorId?: string;
  reason: 'body' | 'emergency';
  bodyColorId?: string;
  bodyVictimName?: string;
  bodyRoom?: string;
  votes: Map<string, string>;
  results?: MeetingResults;
}

export class GameRoom {
  public code: string;
  public io: Server;
  public settings: GameSettings;
  public stateMachine: GameStateMachine;
  public players: Map<string, GamePlayer> = new Map();

  private bodies: Map<string, Body> = new Map();
  private meeting: Meeting | null = null;
  private sabotageManager = new SabotageManager();
  private reactorHolds = new Map<string, { partId: number; expiresAt: number }>();
  private phaseEndsAt = 0;
  private emergencyReadyAt = 0;
  private readonly hasImpostorSeat: boolean;
  private winner: 'crewmates' | 'impostors' | null = null;
  private ended = false;
  private chatCounter = 0;

  private tickInterval: NodeJS.Timeout | null = null;
  private lastTickTime = Date.now();
  private onEnd: () => void;

  constructor(
    code: string,
    io: Server,
    settings: GameSettings,
    lobbyPlayers: { id: string; name: string; colorId: string; hatId: string; isHost: boolean }[],
    onEnd: () => void = () => {}
  ) {
    this.code = code;
    this.io = io;
    this.settings = settings;
    this.onEnd = onEnd;
    this.stateMachine = new GameStateMachine();

    // --- Seats: humans first, then bots up to the minimum player count ---
    const seats: { id: string; name: string; colorId: string; hatId: string; isHost: boolean; isBot: boolean }[] =
      lobbyPlayers.map((lp) => ({ ...lp, isBot: false }));

    const botsNeeded = settings.fillWithBots ? Math.max(0, MIN_PLAYERS_TO_START - seats.length) : 0;
    const usedColors = new Set(seats.map((s) => s.colorId));
    const usedNames = new Set(seats.map((s) => s.name));
    const freeColors = PLAYER_COLORS.filter((c) => !usedColors.has(c.id));
    const botNames = BOT_NAMES.filter((n) => !usedNames.has(n));
    for (let b = 0; b < botsNeeded; b++) {
      seats.push({
        id: `bot_${b + 1}`,
        name: sanitizePlayerName(botNames[b % botNames.length] || `Bot${b + 1}`),
        colorId: (freeColors[b] || PLAYER_COLORS[b % PLAYER_COLORS.length]).id,
        hatId: 'none',
        isHost: false,
        isBot: true,
      });
    }

    // --- Roles & tasks ---
    const roles = assignRoles(
      seats.map((s) => s.id),
      settings.impostorCount
    );
    const common = pickCommonTasks(settings.commonTasks);
    const startNow = Date.now();

    seats.forEach((seat, idx) => {
      const spawn = getSpawnPosition(idx, seats.length);
      const defs: TaskDefinition[] = [...common, ...pickPersonalTasks(settings.shortTasks, settings.longTasks)];
      const gp: GamePlayer = {
        id: seat.id,
        name: seat.name,
        colorId: seat.colorId,
        hatId: seat.hatId,
        isHost: seat.isHost,
        x: spawn.x,
        z: spawn.z,
        rotation: 0,
        isMoving: false,
        isAlive: true,
        room: detectRoom(spawn.x, spawn.z),
        isBot: seat.isBot,
        posSeq: 0,
        inVent: false,
        role: roles.get(seat.id)!.role,
        tasks: defs.map((def) => ({ def, step: 0, done: false })),
        killReadyAt: startNow + INITIAL_KILL_COOLDOWN_MS + ROLE_REVEAL_MS,
        emergenciesLeft: settings.emergencyMeetings,
        ventId: null,
        lastInputAt: startNow,
        working: null,
        lastChatAt: 0,
        engineerVentReadyAt: 0,
        engineerVentEndsAt: 0,
      };
      if (seat.isBot) gp.brain = this.newBrain(spawn);
      this.players.set(seat.id, gp);
    });

    this.hasImpostorSeat = [...this.players.values()].some((p) => p.role === 'impostor');
    this.emergencyReadyAt = startNow + ROLE_REVEAL_MS + settings.emergencyCooldown * 1000;
    this.stateMachine.transitionTo(GAME_STATES.ROLE_REVEAL);
    this.phaseEndsAt = startNow + ROLE_REVEAL_MS;
    this.startSimulation();
  }

  // ---------------------------------------------------------------------------
  // Public API used by LobbyManager / socket handlers
  // ---------------------------------------------------------------------------

  public handlePlayerInput(
    socketId: string,
    input: { seq: number; x: number; z: number; rotation: number; isMoving: boolean }
  ): void {
    const p = this.players.get(socketId);
    if (!p || this.stateMachine.currentState !== GAME_STATES.PLAYING || p.ventId) return;
    if (![input.x, input.z, input.rotation].every((n) => Number.isFinite(n))) return;

    const now = Date.now();
    const dtSec = Math.min(Math.max((now - p.lastInputAt) / 1000, 0.05), 0.5);
    p.lastInputAt = now;

    // Speed clamp: the client can't teleport, but gets generous tolerance for network jitter.
    const maxStep = BASE_PLAYER_SPEED * this.settings.playerSpeed * dtSec * 1.6 + 0.5;
    let dx = input.x - p.x;
    let dz = input.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > maxStep) {
      dx = (dx / d) * maxStep;
      dz = (dz / d) * maxStep;
    }
    let nx = p.x + dx;
    let nz = p.z + dz;
    if (p.isAlive) {
      if (lineIntersectsWalls(p.x, p.z, nx, nz, this.closedDoorWalls()).hit) return;
      const r = resolveMovementCollisions(p.x, p.z, nx, nz);
      nx = r.x;
      nz = r.z;
    }
    p.x = nx;
    p.z = nz;
    p.rotation = input.rotation || 0;
    p.isMoving = !!input.isMoving;
    p.room = detectRoom(p.x, p.z);
    if (p.working && p.isMoving) p.working = null; // walking away cancels a task
  }

  public removePlayer(socketId: string): void {
    const p = this.players.get(socketId);
    if (!p) return;
    this.players.delete(socketId);
    this.reactorHolds.delete(socketId);
    if (this.meeting) {
      for (const [voterId, targetId] of this.meeting.votes) {
        if (voterId === socketId || targetId === socketId) this.meeting.votes.delete(voterId);
      }
    }
    const state = this.stateMachine.currentState;
    if (state === GAME_STATES.PLAYING || state === GAME_STATES.MEETING) this.checkWin();
    if (this.humans().length === 0) this.destroy();
  }

  public startTask(id: string, taskId: string): void {
    const p = this.players.get(id);
    if (!p || p.role === 'impostor' || this.stateMachine.currentState !== GAME_STATES.PLAYING || p.ventId) return;
    const st = this.currentStep(p, taskId);
    if (!st) return;
    if (Math.hypot(p.x - st.x, p.z - st.z) > TASK_RANGE) return;
    p.working = { taskId, startedAt: Date.now() };
  }

  public completeTaskStep(id: string, taskId: string): void {
    const p = this.players.get(id);
    if (!p || this.stateMachine.currentState !== GAME_STATES.PLAYING) return;
    if (!p.working || p.working.taskId !== taskId) return;
    const st = this.currentStep(p, taskId);
    if (!st) return;
    if (Math.hypot(p.x - st.x, p.z - st.z) > TASK_RANGE + 0.8) return;
    if (Date.now() - p.working.startedAt < st.hold * 1000 - 400) return; // too fast
    p.working = null;
    this.advanceTask(p, taskId);
  }

  public cancelTask(id: string): void {
    const p = this.players.get(id);
    if (p) p.working = null;
  }

  public killAttempt(killerId: string, targetId: string): void {
    const killer = this.players.get(killerId);
    const target = this.players.get(targetId);
    if (!killer || !target || this.stateMachine.currentState !== GAME_STATES.PLAYING) return;
    if (killer.role !== 'impostor' || !killer.isAlive || killer.ventId) return;
    if (!target.isAlive || target.role === 'impostor' || target.ventId) return;
    if (Date.now() < killer.killReadyAt) return;
    const range = KILL_DISTANCE_M[this.settings.killDistance] + 0.6;
    if (!this.canSee(killer, target, range)) return;
    this.performKill(killer, target);
  }

  public reportBody(reporterId: string, bodyId: string): void {
    const p = this.players.get(reporterId);
    const body = this.bodies.get(bodyId);
    if (!p || !body || !p.isAlive || this.stateMachine.currentState !== GAME_STATES.PLAYING || p.ventId) return;
    if (!this.canSee(p, body, REPORT_RANGE + 0.5)) return;
    this.startMeeting(p, 'body', body);
  }

  public callEmergency(callerId: string): void {
    const p = this.players.get(callerId);
    if (!p || !p.isAlive || this.stateMachine.currentState !== GAME_STATES.PLAYING || p.ventId) return;
    if (this.sabotageManager.getActiveSabotage()) return;
    if (p.emergenciesLeft <= 0 || Date.now() < this.emergencyReadyAt) return;
    if (Math.hypot(p.x - EMERGENCY_BUTTON_POS.x, p.z - EMERGENCY_BUTTON_POS.z) > EMERGENCY_BUTTON_RANGE + 0.8) return;
    p.emergenciesLeft--;
    this.startMeeting(p, 'emergency');
  }

  public ventEnter(id: string, ventId: string): void {
    const p = this.players.get(id);
    const vent = MAP_VENTS.find((v) => v.id === ventId);
    if (!p || !vent || (p.role !== 'impostor' && p.role !== 'engineer') || !p.isAlive || p.ventId) return;
    if (this.stateMachine.currentState !== GAME_STATES.PLAYING) return;
    if (p.role === 'engineer' && Date.now() < p.engineerVentReadyAt) return;
    if (Math.hypot(p.x - vent.x, p.z - vent.z) > VENT_RANGE + 0.6) return;
    p.ventEnteredAt = Date.now();
    p.ventId = ventId;
    p.inVent = true;
    if (p.role === 'engineer') p.engineerVentEndsAt = Date.now() + 6000;
    p.working = null;
    p.isMoving = false;
    p.x = vent.x;
    p.z = vent.z;
    p.posSeq = (p.posSeq || 0) + 1;
  }

  public ventMove(id: string, ventId: string): void {
    const p = this.players.get(id);
    if (!p || !p.ventId || (p.role !== 'impostor' && p.role !== 'engineer')) return;
    const here = MAP_VENTS.find((v) => v.id === p.ventId);
    const dest = MAP_VENTS.find((v) => v.id === ventId);
    if (!here || !dest || !here.connectedTo.includes(dest.id)) return;
    p.ventId = dest.id;
    p.x = dest.x;
    p.z = dest.z;
    p.room = detectRoom(p.x, p.z);
    p.posSeq = (p.posSeq || 0) + 1;
  }

  public ventExit(id: string): void {
    const p = this.players.get(id);
    if (!p || !p.ventId) return;
    const now = Date.now();
    p.killReadyAt = now + Math.max(0, p.killReadyAt - (p.ventEnteredAt ?? now));
    p.ventEnteredAt = undefined;
    p.ventId = null;
    p.inVent = false;
    if (p.role === 'engineer') {
      p.engineerVentReadyAt = now + 20000;
      p.engineerVentEndsAt = 0;
    }
    p.lastInputAt = now;
    p.posSeq = (p.posSeq || 0) + 1;
  }

  public castVote(voterId: string, targetId: string): void {
    const m = this.meeting;
    const voter = this.players.get(voterId);
    if (!m || m.phase !== 'VOTING' || !voter || !voter.isAlive || m.votes.has(voterId)) return;
    if (targetId !== 'skip') {
      const t = this.players.get(targetId);
      if (!t || !t.isAlive) return;
    }
    m.votes.set(voterId, targetId);
  }

  public chat(senderId: string, rawText: string): void {
    const p = this.players.get(senderId);
    const m = this.meeting;
    if (!p || !m || (m.phase !== 'DISCUSSION' && m.phase !== 'VOTING')) return;
    const now = Date.now();
    if (now - p.lastChatAt < 700) return;
    p.lastChatAt = now;
    const text = String(rawText || '').trim().slice(0, MAX_CHAT_LENGTH);
    if (!text) return;
    this.broadcastChat(p, text);
  }

  public triggerSabotage(playerId: string, type: SabotageType, room?: string): boolean {
    const p = this.players.get(playerId);
    if (!p || p.role !== 'impostor' || this.stateMachine.currentState !== GAME_STATES.PLAYING) {
      return false;
    }
    const success = this.sabotageManager.triggerSabotage(type, room);
    if (success) {
      if (type === 'reactor') this.reactorHolds.clear();
      this.io.to(this.code).emit(EVENTS.SABOTAGE_STARTED, { type, room });
    }
    return success;
  }

  public fixSabotage(playerId: string, partId?: number): boolean {
    const p = this.players.get(playerId);
    if (!p || !p.isAlive || p.ventId || this.stateMachine.currentState !== GAME_STATES.PLAYING) {
      return false;
    }
    const id = partId ?? 1;
    const success = this.sabotageManager.fixPart(id, { x: p.x, z: p.z });
    if (success) {
      if (!this.sabotageManager.getActiveSabotage()) {
        this.io.to(this.code).emit(EVENTS.SABOTAGE_RESOLVED);
      } else {
        this.io.to(this.code).emit(EVENTS.SABOTAGE_UPDATED, { partId: id });
      }
    }
    return success;
  }

  public holdReactorScanner(playerId: string, partId: number, holding: boolean): void {
    const sabotage = this.sabotageManager.getActiveSabotage();
    if (sabotage?.type !== 'reactor' || this.stateMachine.currentState !== GAME_STATES.PLAYING) return;
    const now = Date.now();
    if (!holding) {
      this.reactorHolds.delete(playerId);
      return;
    }
    if (now >= sabotage.endsAt) return;
    this.reactorHolds.set(playerId, { partId, expiresAt: now + 750 });

    const occupied = new Set<number>();
    for (const [id, hold] of this.reactorHolds) {
      const player = this.players.get(id);
      const part = sabotage.parts.find((station) => station.id === hold.partId);
      if (hold.expiresAt <= now || !player?.isAlive || player.ventId || !part || !this.canSee(player, part, 3.8)) {
        this.reactorHolds.delete(id);
        continue;
      }
      occupied.add(part.id);
    }
    if (occupied.size === sabotage.parts.length) {
      this.sabotageManager.resolve(now);
      this.reactorHolds.clear();
      this.io.to(this.code).emit(EVENTS.SABOTAGE_RESOLVED);
    }
  }

  public destroy(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Core loop
  // ---------------------------------------------------------------------------

  private humans(): GamePlayer[] {
    return [...this.players.values()].filter((p) => !p.isBot);
  }

  private startSimulation(): void {
    this.lastTickTime = Date.now();
    this.tickInterval = setInterval(() => this.tick(), 50);
  }

  private tick(): void {
    const now = Date.now();
    const dt = Math.min((now - this.lastTickTime) / 1000, 0.1);
    this.lastTickTime = now;
    switch (this.stateMachine.currentState) {
      case GAME_STATES.ROLE_REVEAL:
        if (now >= this.phaseEndsAt) {
          this.stateMachine.transitionTo(GAME_STATES.PLAYING);
          for (const p of this.players.values()) p.lastInputAt = now;
          this.checkWin();
        }
        break;
      case GAME_STATES.PLAYING: {
        const sabResult = this.sabotageManager.tick(now);
        if (sabResult.criticalTimeout) {
          this.endGame('impostors', sabResult.reason || 'Critical sabotage succeeded!');
          return;
        }
        for (const p of [...this.players.values()]) {
          if (p.role === 'engineer' && p.ventId && now >= p.engineerVentEndsAt) this.ventExit(p.id);
          if (p.isBot && this.stateMachine.currentState === GAME_STATES.PLAYING) this.botUpdate(p, now, dt);
        }
        break;
      }
      case GAME_STATES.MEETING:
        this.advanceMeeting(now);
        break;
      case GAME_STATES.GAME_OVER:
        if (!this.ended && now >= this.phaseEndsAt) {
          this.ended = true;
          this.destroy();
          this.onEnd();
          return;
        }
        break;
    }

    this.broadcastSnapshots(now);
  }

  private broadcastSnapshots(now: number): void {
    const playersObj: Record<string, PlayerSnapshot> = {};
    for (const p of this.players.values()) {
      playersObj[p.id] = {
        id: p.id,
        name: p.name,
        colorId: p.colorId,
        hatId: p.hatId,
        isHost: p.isHost,
        x: p.x,
        z: p.z,
        rotation: p.rotation,
        isMoving: p.isMoving,
        isAlive: p.isAlive,
        room: p.room,
        isBot: p.isBot,
        posSeq: p.posSeq,
        inVent: p.inVent,
      };
    }

    const bodies: BodyView[] = [...this.bodies.values()].map((b) => ({ id: b.id, colorId: b.colorId, x: b.x, z: b.z }));
    const meeting = this.meeting ? this.meetingView(now) : undefined;
    const taskProgress = this.taskProgress();

    for (const human of this.humans()) {
      const snapshot: GameStateSnapshot = {
        state: this.stateMachine.currentState,
        players: playersObj,
        timestamp: now,
        bodies,
        meeting,
        taskProgress,
        you: this.youView(human, now),
        winner: this.winner || undefined,
        sabotage: this.sabotageManager.getView(now),
        doorLocks: this.sabotageManager.getLockedRooms(now),
      };
      this.io.to(human.id).emit(EVENTS.STATE_SNAPSHOT, snapshot);
    }
  }

  // ---------------------------------------------------------------------------
  // Tasks
  // ---------------------------------------------------------------------------

  private currentStep(p: GamePlayer, taskId: string): TaskView | null {
    const t = p.tasks.find((x) => x.def.id === taskId);
    if (!t || t.done) return null;
    return this.taskView(t);
  }

  private taskView(t: TaskState): TaskView {
    const step = t.def.steps[Math.min(t.step, t.def.steps.length - 1)];
    const spot = getRoomSpot(step.room, step.spot);
    return {
      taskId: t.def.id,
      name: t.def.name,
      type: t.def.type,
      step: t.step,
      totalSteps: t.def.steps.length,
      done: t.done,
      room: step.room,
      x: spot.x,
      z: spot.z,
      hold: step.hold,
    };
  }

  private advanceTask(p: GamePlayer, taskId: string): void {
    const t = p.tasks.find((x) => x.def.id === taskId);
    if (!t || t.done) return;
    if (p.role === 'impostor') return;
    t.step++;
    if (t.step >= t.def.steps.length) t.done = true;
    this.checkWin();
  }

  private taskProgress(): number {
    let total = 0;
    let done = 0;
    for (const p of this.players.values()) {
      if (p.role === 'impostor') continue;
      for (const t of p.tasks) {
        total++;
        if (t.done) done++;
      }
    }
    return total === 0 ? 1 : done / total;
  }

  // ---------------------------------------------------------------------------
  // Kills / bodies
  // ---------------------------------------------------------------------------

  private performKill(killer: GamePlayer, victim: GamePlayer): void {
    victim.isAlive = false;
    victim.isMoving = false;
    victim.working = null;
    victim.ventId = null;
    victim.inVent = false;
    this.bodies.set(victim.id, {
      id: victim.id,
      colorId: victim.colorId,
      x: victim.x,
      z: victim.z,
      killerId: killer.id,
      room: victim.room,
    });

    killer.killReadyAt = Date.now() + this.settings.killCooldown * 1000;

    // Bots that saw it remember who did it.
    for (const w of this.players.values()) {
      if (!w.isBot || !w.isAlive || w.role === 'impostor' || w.id === victim.id) continue;
      const dist = Math.hypot(w.x - victim.x, w.z - victim.z);
      if (dist < 10 && !lineIntersectsWalls(w.x, w.z, victim.x, victim.z).hit) {
        w.brain!.suspectId = killer.id;
      }
    }

    const killPayload = {
      victimId: victim.id,
      killerId: killer.id,
      x: victim.x,
      z: victim.z,
    };

    // 1. Killer and victim always receive it
    this.io.to(killer.id).emit(EVENTS.PLAYER_KILLED, killPayload);
    this.io.to(victim.id).emit(EVENTS.PLAYER_KILLED, killPayload);

    // 2. Only notify players who actually have line of sight to witness the kill
    const vRoom = detectRoom(victim.x, victim.z);
    for (const human of this.humans()) {
      if (human.id === killer.id || human.id === victim.id) continue;
      const dist = Math.hypot(human.x - victim.x, human.z - victim.z);
      const hRoom = detectRoom(human.x, human.z);
      const maxRange = hRoom === vRoom ? 12 : 8.5;
      const canSee =
        (!human.isAlive && dist < 15) ||
        (dist <= maxRange && !lineIntersectsWalls(human.x, human.z, victim.x, victim.z).hit);
      if (canSee) {
        this.io.to(human.id).emit(EVENTS.PLAYER_KILLED, killPayload);
      }
    }
    this.checkWin();
  }

  // ---------------------------------------------------------------------------
  // Meetings
  // ---------------------------------------------------------------------------

  private startMeeting(caller: GamePlayer, reason: 'body' | 'emergency', body?: Body): void {
    if (this.meeting || this.stateMachine.currentState !== GAME_STATES.PLAYING) return;
    const now = Date.now();
    this.sabotageManager.clearOnMeeting(now);
    this.reactorHolds.clear();
    const victimPlayer = body ? this.players.get(body.id) : undefined;
    this.meeting = {
      phase: 'INTRO',
      endsAt: now + MEETING_INTRO_MS,
      callerId: caller.id,
      callerName: caller.name,
      callerColorId: caller.colorId,
      reason,
      bodyColorId: body?.colorId,
      bodyVictimName: victimPlayer?.name,
      bodyRoom: body?.room,
      votes: new Map(),
    };
    this.bodies.clear();
    this.stateMachine.transitionTo(GAME_STATES.MEETING);

    // Everyone gathers around the table; vents and tasks are interrupted.
    let i = 0;
    for (const p of this.players.values()) {
      p.working = null;
      if (p.role === 'engineer' && p.ventId) p.engineerVentReadyAt = now + 20000;
      p.engineerVentEndsAt = 0;
      p.ventId = null;
      p.ventEnteredAt = undefined;
      p.inVent = false;
      p.isMoving = false;
      const pos = getSpawnPosition(i++, this.players.size);
      p.x = pos.x;
      p.z = pos.z;
      p.room = detectRoom(p.x, p.z);
      p.posSeq = (p.posSeq || 0) + 1;
      if (p.brain) {
        p.brain.path = [];
        p.brain.mode = 'idle';
      }
    }
  }

  private advanceMeeting(now: number): void {
    const m = this.meeting;
    if (!m) return;

    switch (m.phase) {
      case 'INTRO':
        if (now >= m.endsAt) {
          if (this.settings.discussionTime > 0) {
            m.phase = 'DISCUSSION';
            m.endsAt = now + this.settings.discussionTime * 1000;
            this.scheduleBotChat(m, now);
          } else {
            this.scheduleBotChat(m, now);
            this.beginVoting(m, now);
          }
        }
        break;
      case 'DISCUSSION':
        this.botMeetingChat(now);
        if (now >= m.endsAt) this.beginVoting(m, now);
        break;
      case 'VOTING': {
        this.botMeetingChat(now);
        for (const p of this.players.values()) {
          if (p.isBot && p.isAlive && !m.votes.has(p.id) && now >= p.brain!.voteAt) {
            this.castVote(p.id, this.botChooseVote(p));
          }
        }
        const alive = [...this.players.values()].filter((p) => p.isAlive);
        if (alive.every((p) => m.votes.has(p.id)) || now >= m.endsAt) this.tallyVotes(m, now);
        break;
      }
      case 'RESULTS':
        if (now >= m.endsAt) {
          this.applyEjection(m);
          m.phase = 'EJECTION';
          m.endsAt = now + MEETING_EJECTION_MS;
        }
        break;
      case 'EJECTION':
        if (now >= m.endsAt) this.endMeeting(now);
        break;
    }
  }

  private beginVoting(m: Meeting, now: number): void {
    m.phase = 'VOTING';
    m.endsAt = now + this.settings.votingTime * 1000;
    for (const p of this.players.values()) {
      if (p.isBot) p.brain!.voteAt = now + 2500 + Math.random() * 8000;
    }
  }

  private tallyVotes(m: Meeting, now: number): void {
    const tally: Record<string, number> = {};
    const voteList: { voterId: string; targetId: string }[] = [];
    for (const p of this.players.values()) {
      if (!p.isAlive) continue;
      const choice = m.votes.get(p.id);
      if (!choice) continue;
      tally[choice] = (tally[choice] || 0) + 1;
      voteList.push({ voterId: p.id, targetId: choice });
    }

    let top = 0;
    for (const n of Object.values(tally)) top = Math.max(top, n);
    const leaders = Object.keys(tally).filter((k) => tally[k] === top);

    const results: MeetingResults = {
      votes: this.settings.anonymousVotes ? [] : voteList,
      tally,
      outcome: leaders.length === 0 ? 'skip' : 'tie',
    };
    if (leaders.length === 1) {
      if (leaders[0] === 'skip') {
        results.outcome = 'skip';
      } else {
        const ejected = this.players.get(leaders[0]);
        if (ejected) {
          results.outcome = 'ejected';
          results.ejectedId = ejected.id;
          results.ejectedName = ejected.name;
          results.ejectedColorId = ejected.colorId;
        }
      }
    }
    m.results = results;
    m.phase = 'RESULTS';
    m.endsAt = now + MEETING_RESULTS_MS;
  }

  private applyEjection(m: Meeting): void {
    const r = m.results;
    if (!r || r.outcome !== 'ejected' || !r.ejectedId) return;
    const ejected = this.players.get(r.ejectedId);
    if (!ejected) return;
    ejected.isAlive = false;
    if (this.settings.confirmEjects) {
      r.wasImpostor = ejected.role === 'impostor';
      r.impostorsRemaining = [...this.players.values()].filter((p) => p.isAlive && p.role === 'impostor').length;
    }
  }

  private endMeeting(now: number): void {
    this.meeting = null;
    if (this.checkWin()) return;

    this.stateMachine.transitionTo(GAME_STATES.PLAYING);
    this.emergencyReadyAt = now + this.settings.emergencyCooldown * 1000;
    let i = 0;
    for (const p of this.players.values()) {
      const pos = getSpawnPosition(i++, this.players.size);
      p.x = pos.x;
      p.z = pos.z;
      p.room = detectRoom(p.x, p.z);
      p.posSeq = (p.posSeq || 0) + 1;
      p.lastInputAt = now;
      if (p.role === 'impostor') p.killReadyAt = now + this.settings.killCooldown * 1000;
      if (p.brain) {
        p.brain.path = [];
        p.brain.mode = 'idle';
        p.brain.waitUntil = now + 1000 + Math.random() * 2000;
        p.brain.suspectId = null;
      }
    }
  }

  private meetingView(now: number): MeetingView {
    const m = this.meeting!;
    return {
      phase: m.phase,
      remainingMs: Math.max(0, m.endsAt - now),
      callerName: m.callerName,
      callerColorId: m.callerColorId,
      reason: m.reason,
      bodyColorId: m.bodyColorId,
      bodyVictimName: m.bodyVictimName,
      bodyRoom: m.bodyRoom,
      voted: [...m.votes.keys()],
      results: m.results,
    };
  }

  private broadcastChat(sender: GamePlayer, text: string): void {
    const msg: ChatMessage = {
      id: `c${++this.chatCounter}`,
      senderId: sender.id,
      name: sender.name,
      colorId: sender.colorId,
      text,
      ghost: !sender.isAlive,
    };
    for (const h of this.humans()) {
      // Ghost chat is only visible to other ghosts.
      if (msg.ghost && h.isAlive) continue;
      this.io.to(h.id).emit(EVENTS.CHAT_BROADCAST, msg);
    }
  }

  // ---------------------------------------------------------------------------
  // Win conditions
  // ---------------------------------------------------------------------------

  private checkWin(): boolean {
    if (this.stateMachine.currentState === GAME_STATES.GAME_OVER) return true;
    const all = [...this.players.values()];
    const alive = all.filter((p) => p.isAlive);
    const impostors = alive.filter((p) => p.role === 'impostor').length;
    const crew = alive.length - impostors;
    const hasCrewSeat = all.some((p) => p.role !== 'impostor');

    if (this.hasImpostorSeat && impostors === 0) {
      this.endGame('crewmates', 'All impostors were removed');
      return true;
    }
    if (impostors > 0 && impostors >= crew) {
      this.endGame('impostors', 'The impostors outnumber the crew');
      return true;
    }
    if (hasCrewSeat && this.taskProgress() >= 1) {
      this.endGame('crewmates', 'All tasks completed');
      return true;
    }
    return false;
  }

  private endGame(winner: 'crewmates' | 'impostors', reason: string): void {
    if (this.stateMachine.currentState === GAME_STATES.GAME_OVER) return;
    this.winner = winner;
    this.meeting = null;
    this.stateMachine.transitionTo(GAME_STATES.GAME_OVER);
    this.phaseEndsAt = Date.now() + GAME_OVER_MS;
    const info: GameOverInfo = {
      winner,
      reason,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        colorId: p.colorId,
        role: p.role,
        isBot: !!p.isBot,
      })),
    };
    this.io.to(this.code).emit(EVENTS.GAME_OVER, info);
  }

  // ---------------------------------------------------------------------------
  // Per-player private view
  // ---------------------------------------------------------------------------

  private youView(p: GamePlayer, now: number): YouView {
    const vent = p.ventId ? MAP_VENTS.find((v) => v.id === p.ventId) : null;
    return {
      role: p.role,
      teammates:
        p.role === 'impostor'
          ? [...this.players.values()]
              .filter((o) => o.role === 'impostor' && o.id !== p.id)
              .map((o) => ({ id: o.id, name: o.name, colorId: o.colorId }))
          : [],
      tasks: p.tasks.map((t) => this.taskView(t)),
      killCooldownMs: Math.max(0, p.killReadyAt - (p.ventEnteredAt ?? now)),
      emergencyLeft: p.emergenciesLeft,
      emergencyCooldownMs: Math.max(0, this.emergencyReadyAt - now),
      engineerVentCooldownMs: Math.max(0, p.engineerVentReadyAt - now),
      engineerVentTimeLeftMs: p.role === 'engineer' && p.ventId ? Math.max(0, p.engineerVentEndsAt - now) : 0,
      sabotageCooldownMs: this.sabotageManager.getCooldownRemainingSecs(now) * 1000,
      ventId: p.ventId,
      ventLinks: vent
        ? vent.connectedTo.map((id) => {
            const v = MAP_VENTS.find((x) => x.id === id)!;
            return { id: v.id, x: v.x, z: v.z };
          })
        : [],
      sabotageCooldownSecs: p.role === 'impostor' ? this.sabotageManager.getCooldownRemainingSecs(now) : undefined,
    };
  }

  // ---------------------------------------------------------------------------
  // Bots
  // ---------------------------------------------------------------------------

  private newBrain(pos: Pt): BotBrain {
    return {
      mode: 'idle',
      path: [],
      goal: null,
      goalRange: 1.2,
      nextRouteAt: 0,
      thinkAt: 0,
      waitUntil: Date.now() + ROLE_REVEAL_MS + Math.random() * 3000,
      workEnd: 0,
      currentTask: null,
      targetId: null,
      fleeUntil: 0,
      suspectId: null,
      voteAt: 0,
      chatAt: 0,
      chatLine: null,
      lastPos: { ...pos },
      stuckSince: Date.now(),
      repairType: null,
    };
  }

  private botSpeed(): number {
    return BASE_PLAYER_SPEED * this.settings.playerSpeed * 0.92;
  }

  private setGoal(bot: GamePlayer, goal: Pt, range = 1.2): void {
    const b = bot.brain!;
    const now = Date.now();
    if (!b.path.length && b.goal?.x === goal.x && b.goal?.z === goal.z
      && b.goalRange === range && now < b.nextRouteAt) return;
    b.goal = goal;
    b.goalRange = range;
    b.nextRouteAt = now + 800;
    b.path = findPath(bot, goal, range, bot.isAlive ? this.closedDoorWalls() : []);
  }

  private botMove(bot: GamePlayer, dt: number): void {
    const b = bot.brain!;
    bot.isMoving = false;
    if (b.mode === 'work' || b.path.length === 0) return;

    let remaining = this.botSpeed() * dt;
    const doors = bot.isAlive ? this.closedDoorWalls() : [];
    while (remaining > 0 && b.path.length) {
      const wp = b.path[0];
      const dx = wp.x - bot.x;
      const dz = wp.z - bot.z;
      const d = Math.hypot(dx, dz);
      if (d <= 0.06) {
        b.path.shift();
        continue;
      }
      const step = Math.min(remaining, d, 0.18);
      let nx = bot.x + (dx / d) * step;
      let nz = bot.z + (dz / d) * step;
      if (bot.isAlive) {
        if (lineIntersectsWalls(bot.x, bot.z, nx, nz, doors).hit) break;
        const r = resolveMovementCollisions(bot.x, bot.z, nx, nz);
        nx = r.x;
        nz = r.z;
      }
      const movedX = nx - bot.x;
      const movedZ = nz - bot.z;
      if (Math.hypot(movedX, movedZ) < 0.001) break;
      bot.x = nx;
      bot.z = nz;
      bot.rotation = Math.atan2(movedX, movedZ);
      bot.isMoving = true;
      remaining -= step;
    }
    bot.room = detectRoom(bot.x, bot.z);
  }

  private botUpdate(bot: GamePlayer, now: number, dt: number): void {
    const b = bot.brain!;
    this.botThink(bot, now);
    if (this.stateMachine.currentState !== GAME_STATES.PLAYING) return; // a meeting or game over just started
    this.botMove(bot, dt);

    // Un-stick: if we should be walking but haven't moved, replan promptly.
    if (b.path.length && b.mode !== 'work') {
      if (Math.hypot(bot.x - b.lastPos.x, bot.z - b.lastPos.z) > 0.05) {
        b.lastPos = { x: bot.x, z: bot.z };
        b.stuckSince = now;
      } else if (now - b.stuckSince > 1200 && b.goal) {
        b.stuckSince = now;
        this.setGoal(bot, b.goal, b.goalRange);
      }
    } else {
      b.stuckSince = now;
      b.lastPos = { x: bot.x, z: bot.z };
    }
  }

  private closedDoorWalls() {
    return getClosedDoorWalls(this.sabotageManager.getLockedRooms());
  }

  private canSee(a: Pt, b: Pt, maxDist: number): boolean {
    return Math.hypot(a.x - b.x, a.z - b.z) <= maxDist
      && !lineIntersectsWalls(a.x, a.z, b.x, b.z).hit
      && !lineIntersectsWalls(a.x, a.z, b.x, b.z, this.closedDoorWalls()).hit;
  }

  private botThink(bot: GamePlayer, now: number): void {
    const b = bot.brain!;

    const activeSab = this.sabotageManager.getActiveSabotage();
    const shouldRepair = activeSab && bot.isAlive && bot.role !== 'impostor';
    const shouldThink = now >= b.thinkAt;

    if (shouldThink && bot.isAlive && b.mode !== 'flee') {
      let nearest = b.mode === 'body' && b.targetId ? this.bodies.get(b.targetId) : undefined;
      let best = nearest ? Math.hypot(bot.x - nearest.x, bot.z - nearest.z) : Infinity;
      for (const body of this.bodies.values()) {
        const distance = Math.hypot(bot.x - body.x, bot.z - body.z);
        if (distance >= best || !this.canSee(bot, body, 11)) continue;
        if (bot.role === 'impostor' && (body.killerId === bot.id || Math.random() >= 0.2)) continue;
        best = distance;
        nearest = body;
      }
      if (nearest) {
        b.thinkAt = now + 300;
        this.reportBody(bot.id, nearest.id);
        if (this.meeting) return;
        if (b.mode !== 'body' || b.targetId !== nearest.id || !b.path.length) {
          b.currentTask = null;
          b.mode = 'body';
          b.targetId = nearest.id;
          this.setGoal(bot, nearest, REPORT_RANGE - 0.3);
        }
        if (b.path.length) return;
      }
      if (b.mode === 'body') {
        b.mode = 'idle';
        b.targetId = null;
        b.path = [];
      }
    }

    if (b.mode === 'work' && !(shouldRepair && activeSab.isCritical)) {
      if (now >= b.workEnd) {
        if (b.currentTask) this.advanceTask(bot, b.currentTask.def.id);
        b.currentTask = null;
        b.mode = 'idle';
        b.waitUntil = now + 500 + Math.random() * 1500;
      }
      return;
    }

    if (!shouldThink) return;
    b.thinkAt = now + 250 + Math.random() * 150;

    // --- 2. Impostor hunting ---
    if (bot.role === 'impostor' && bot.isAlive) {
      if (b.mode === 'flee') {
        if (now >= b.fleeUntil || b.path.length === 0) b.mode = 'idle';
        else return;
      }
      if (now >= bot.killReadyAt) {
        const victim = this.pickVictim(bot, b.mode === 'chase' ? b.targetId : null);
        if (victim) {
          const dist = Math.hypot(bot.x - victim.x, bot.z - victim.z);
          if (dist <= KILL_DISTANCE_M[this.settings.killDistance] * 0.9) {
            this.performKill(bot, victim);
            if (this.stateMachine.currentState !== GAME_STATES.PLAYING) return;
            b.mode = 'flee';
            b.fleeUntil = now + 4000;
            b.targetId = null;
            this.setGoal(bot, this.randomStation());
            return;
          }
          const goalStale = !b.goal || Math.hypot(b.goal.x - victim.x, b.goal.z - victim.z) > 1.5;
          if (b.mode !== 'chase' || b.targetId !== victim.id || goalStale) {
            b.mode = 'chase';
            b.targetId = victim.id;
            this.setGoal(bot, { x: victim.x, z: victim.z });
          }
          return;
        }
      }
      if (b.mode === 'chase') {
        b.mode = 'idle';
        b.targetId = null;
        b.path = [];
      }
    }

    // --- 2.5 Sabotage response (crewmate bots repair, impostor bots trigger) ---
    if (shouldRepair) {
      const distance = (part: Pt) => Math.hypot(bot.x - part.x, bot.z - part.z);
      const available = activeSab.parts.filter((part) => !part.resolved)
        .sort((a, b) => distance(a) - distance(b));
      const part = activeSab.type === 'reactor'
        ? available.find((station) => ![...this.players.values()].some((other) =>
            other !== bot && other.isAlive && other.brain?.mode === 'repair'
            && other.brain.goal?.x === station.x && other.brain.goal.z === station.z)
            && ![...this.reactorHolds].some(([id, hold]) => id !== bot.id && hold.partId === station.id
              && hold.expiresAt > now && this.players.get(id)?.isAlive))
        : available[0];
      if (part) {
        b.currentTask = null;
        if (activeSab.type === 'reactor' && this.canSee(bot, part, 3.8)) {
          b.mode = 'repair';
          b.goal = part;
          b.path = [];
          this.holdReactorScanner(bot.id, part.id, true);
          return;
        }
        if (this.canSee(bot, part, 3.8) && this.fixSabotage(bot.id, part.id)) {
          b.path = [];
          b.mode = 'idle';
          b.waitUntil = now + 1200;
          return;
        } else if (b.mode !== 'repair' || b.goal?.x !== part.x || b.goal?.z !== part.z || !b.path.length) {
          b.mode = 'repair';
          this.setGoal(bot, part, 3.5);
        }
        return;
      }
    }
    if (b.mode === 'repair') {
      b.mode = 'idle';
      b.path = [];
    }
    if (!activeSab && bot.isAlive && bot.role === 'impostor' && this.sabotageManager.getCooldownRemainingSecs(now) === 0) {
      if (Math.random() < 0.04) {
        const types: SabotageType[] = ['reactor', 'o2', 'lights', 'comms'];
        const chosen = types[Math.floor(Math.random() * types.length)];
        this.triggerSabotage(bot.id, chosen);
      }
    }

    // --- 3. Tasks / wandering ---
    if (b.mode === 'task' && b.currentTask) {
      const step = this.taskView(b.currentTask);
      if (this.canSee(bot, step, TASK_RANGE)) {
        b.mode = 'work';
        b.workEnd = now + step.hold * 1000 + Math.random() * 800;
        b.path = [];
        bot.isMoving = false;
      } else if (b.path.length === 0) {
        this.setGoal(bot, step, TASK_RANGE - 0.25);
      }
      return;
    }

    if (b.mode === 'wander') {
      if (b.path.length === 0) {
        b.mode = 'idle';
        b.waitUntil = now + 1000 + Math.random() * 3000;
      }
      return;
    }

    if (b.mode === 'idle' && now >= b.waitUntil) {
      const remaining = bot.role !== 'impostor' ? bot.tasks.filter((t) => !t.done) : [];
      if (remaining.length > 0) {
        remaining.sort((a, bTask) => {
          const first = this.taskView(a);
          const second = this.taskView(bTask);
          return Math.hypot(bot.x - first.x, bot.z - first.z) - Math.hypot(bot.x - second.x, bot.z - second.z);
        });
        b.currentTask = remaining[0];
        b.mode = 'task';
        const step = this.taskView(b.currentTask);
        this.setGoal(bot, step, TASK_RANGE - 0.25);
      } else {
        b.mode = 'wander';
        this.setGoal(bot, this.randomStation());
      }
    }
  }

  private randomStation(): Pt {
    const def = ALL_TASKS[Math.floor(Math.random() * ALL_TASKS.length)];
    const step = def.steps[Math.floor(Math.random() * def.steps.length)];
    return getRoomSpot(step.room, step.spot);
  }

  /** Choose a crewmate this impostor bot can reach without any other crewmate watching. */
  private pickVictim(bot: GamePlayer, preferId: string | null): GamePlayer | null {
    let best: GamePlayer | null = null;
    let bestScore = Infinity;
    for (const c of this.players.values()) {
      if (!c.isAlive || c.role === 'impostor' || c.ventId) continue;
      if (!this.canSee(bot, c, 16)) continue;
      let witnesses = 0;
      for (const w of this.players.values()) {
        if (w.id === c.id || w.id === bot.id || !w.isAlive || w.role === 'impostor') continue;
        if (this.canSee(w, c, 11)) witnesses++;
      }
      if (witnesses > 0) continue;
      const d = Math.hypot(bot.x - c.x, bot.z - c.z);
      const score = c.id === preferId ? d - 3 : d;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  private botChooseVote(bot: GamePlayer): string {
    const b = bot.brain!;
    const others = [...this.players.values()].filter((p) => p.isAlive && p.id !== bot.id);
    if (others.length === 0) return 'skip';

    if (bot.role === 'impostor') {
      const targets = others.filter((p) => p.role !== 'impostor');
      if (targets.length && Math.random() < 0.5) return targets[Math.floor(Math.random() * targets.length)].id;
      return 'skip';
    }
    if (b.suspectId && others.some((p) => p.id === b.suspectId)) return b.suspectId;
    return 'skip';
  }

  private scheduleBotChat(m: Meeting, now: number): void {
    for (const p of this.players.values()) {
      if (!p.isBot || !p.isAlive) continue;
      const b = p.brain!;
      b.chatLine = null;
      b.chatAt = now + 1500 + Math.random() * 5000;
      if (m.callerId === p.id) {
        b.chatLine = m.reason === 'body' ? `I found a body in ${m.bodyRoom || 'the ship'}!` : 'I called an emergency meeting.';
      } else if (b.suspectId) {
        const sus = this.players.get(b.suspectId);
        if (sus) b.chatLine = `I saw ${sus.name} kill someone!`;
      } else if (Math.random() < 0.25) {
        b.chatLine = p.role !== 'impostor' ? `I was doing tasks in ${p.room}.` : `I was in ${p.room}, nothing weird.`;
      }
    }
  }

  private botMeetingChat(now: number): void {
    for (const p of this.players.values()) {
      if (!p.isBot || !p.isAlive) continue;
      const b = p.brain!;
      if (b.chatLine && now >= b.chatAt) {
        this.broadcastChat(p, b.chatLine);
        b.chatLine = null;
      }
    }
  }
}
