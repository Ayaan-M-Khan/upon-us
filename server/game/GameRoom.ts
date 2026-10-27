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
  BodyDiscoveredPayload,
  BodyView,
  ChatMessage,
  EVENTS,
  GameOverInfo,
  GameStateSnapshot,
  MeetingIncidentLogEntry,
  MeetingResults,
  MeetingView,
  PlayerKilledPayload,
  PlayerMatchStats,
  PlayerSnapshot,
  Role,
  TaskView,
  YouView,
} from '../../shared/events';
import {
  EMERGENCY_BUTTON_POS,
  EMERGENCY_BUTTON_RANGE,
  MAP_VENTS,
  detectRoom,
  getActiveWalls,
  getRoomSpot,
  getSpawnPosition,
} from '../../shared/mapData';
import { findPath } from '../../shared/nav';
import { lineIntersectsWalls, resolveWallCollisions } from '../../shared/physics';
import { generateBotMeetingStatement } from './meeting';
import { GhostManager } from './ghostManager';
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
  mode: 'idle' | 'task' | 'work' | 'wander' | 'body' | 'chase' | 'flee';
  path: Pt[];
  goal: Pt | null;
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
}

interface GamePlayer extends PlayerSnapshot {
  role: Role;
  tasks: TaskState[];
  killReadyAt: number;
  emergenciesLeft: number;
  ventId: string | null;
  lastInputAt: number;
  working: { taskId: string; startedAt: number } | null;
  lastChatAt: number;
  brain?: BotBrain;
  stats: PlayerMatchStats;
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
  reason: 'body' | 'emergency';
  bodyColorId?: string;
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
  private discoveredBodies: Set<string> = new Set();
  private meeting: Meeting | null = null;
  private meetingHistory: MeetingIncidentLogEntry[] = [];
  private matchStartTime: number = Date.now();
  private phaseEndsAt = 0;
  private emergencyReadyAt = 0;
  private winner: 'crewmates' | 'impostors' | null = null;
  private ended = false;
  private chatCounter = 0;
  private totalSabotagesCount = 0;

  private tickInterval: NodeJS.Timeout | null = null;
  private lastTickTime = Date.now();
  private onEnd: () => void;
  private sabotageManager: SabotageManager = new SabotageManager();
  private ghostManager: GhostManager = new GhostManager();

  public getGhostManager(): GhostManager {
    return this.ghostManager;
  }

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
        stats: {
          tasksCompleted: 0,
          totalTasks: defs.length,
          timesSabotaged: 0,
          sabotagesFixed: 0,
          killsCount: 0,
          bodiesReported: 0,
          emergenciesCalled: 0,
          survived: true,
          eliminationReason: 'alive',
        },
      };
      if (seat.isBot) gp.brain = this.newBrain(spawn);
      this.players.set(seat.id, gp);
    });

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
    if (p.isAlive && !this.ghostManager.canNoclip(p.id)) {
      const activeWalls = getActiveWalls(this.sabotageManager.getLockedDoors());
      const r = resolveWallCollisions(nx, nz, undefined, activeWalls);
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
    if (this.meeting) this.meeting.votes.delete(socketId);
    const state = this.stateMachine.currentState;
    if (state === GAME_STATES.PLAYING || state === GAME_STATES.MEETING) this.checkWin();
    if (this.humans().length === 0) this.destroy();
  }

  public startTask(id: string, taskId: string): void {
    const p = this.players.get(id);
    if (!p || this.stateMachine.currentState !== GAME_STATES.PLAYING || p.ventId) return;
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
    if (Math.hypot(p.x - st.x, p.z - st.z) > TASK_RANGE + 1.2) return;
    if (Date.now() - p.working.startedAt < 350) return; // Debounce
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
    if (Math.hypot(killer.x - target.x, killer.z - target.z) > range) return;
    this.performKill(killer, target);
  }

  public reportBody(reporterId: string, bodyId: string): void {
    const p = this.players.get(reporterId);
    const body = this.bodies.get(bodyId);
    if (!p || !body || !p.isAlive || this.stateMachine.currentState !== GAME_STATES.PLAYING || p.ventId) return;
    if (Math.hypot(p.x - body.x, p.z - body.z) > REPORT_RANGE + 0.5) return;
    this.discoveredBodies.add(bodyId);
    this.startMeeting(p, 'body', body);
  }

  public callEmergency(callerId: string): void {
    const p = this.players.get(callerId);
    if (!p || !p.isAlive || this.stateMachine.currentState !== GAME_STATES.PLAYING || p.ventId) return;
    if (this.sabotageManager.isEmergencyBlocked()) return;
    if (p.emergenciesLeft <= 0 || Date.now() < this.emergencyReadyAt) return;
    if (Math.hypot(p.x - EMERGENCY_BUTTON_POS.x, p.z - EMERGENCY_BUTTON_POS.z) > EMERGENCY_BUTTON_RANGE + 0.8) return;
    p.emergenciesLeft--;
    this.startMeeting(p, 'emergency');
  }

  public sabotage(socketId: string, data: { type: string; room?: string }): void {
    const p = this.players.get(socketId);
    if (!p || p.role !== 'impostor' || !p.isAlive || this.stateMachine.currentState !== GAME_STATES.PLAYING) return;
    const res = this.sabotageManager.trigger({
      type: data?.type as any,
      room: data?.room as any,
    });
    if (res.success) {
      p.stats.timesSabotaged++;
      this.totalSabotagesCount++;
      this.io.to(this.code).emit(EVENTS.SABOTAGE_STARTED, this.sabotageManager.getActiveSabotage());
    }
  }

  public fixSabotage(socketId: string, data: { type: string; switchIndex?: number; pad?: string }): void {
    const p = this.players.get(socketId);
    if (!p || !p.isAlive || this.stateMachine.currentState !== GAME_STATES.PLAYING) return;
    const res = this.sabotageManager.fix({
      type: data?.type as any,
      switchIndex: data?.switchIndex,
      pad: data?.pad as any,
    });
    if (res.resolved) {
      p.stats.sabotagesFixed++;
      this.io.to(this.code).emit(EVENTS.SABOTAGE_RESOLVED, { type: data.type });
    } else if (res.updated) {
      p.stats.sabotagesFixed++;
      this.io.to(this.code).emit(EVENTS.SABOTAGE_UPDATED, this.sabotageManager.getActiveSabotage());
    }
  }

  public ventEnter(id: string, ventId: string): void {
    const p = this.players.get(id);
    const vent = MAP_VENTS.find((v) => v.id === ventId);
    if (!p || !vent || p.role !== 'impostor' || !p.isAlive || p.ventId) return;
    if (this.stateMachine.currentState !== GAME_STATES.PLAYING) return;
    if (Math.hypot(p.x - vent.x, p.z - vent.z) > VENT_RANGE + 0.6) return;
    p.ventId = ventId;
    p.inVent = true;
    p.working = null;
    p.isMoving = false;
    p.x = vent.x;
    p.z = vent.z;
    p.posSeq = (p.posSeq || 0) + 1;
  }

  public ventMove(id: string, ventId: string): void {
    const p = this.players.get(id);
    if (!p || !p.ventId) return;
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
    p.ventId = null;
    p.inVent = false;
    p.lastInputAt = Date.now();
    p.posSeq = (p.posSeq || 0) + 1;
  }

  public castVote(voterId: string, targetId: string): void {
    const m = this.meeting;
    const voter = this.players.get(voterId);
    if (!m || m.phase !== 'VOTING' || !voter || !voter.isAlive || m.votes.has(voterId)) return;
    if (targetId !== 'skip') {
      const t = this.players.get(targetId);
      if (!t || !t.isAlive || targetId === voterId) return;
    }
    m.votes.set(voterId, targetId);
  }

  public chat(senderId: string, rawText: string): void {
    const p = this.players.get(senderId);
    if (!p) return;
    const isGhost = this.ghostManager.isGhost(p.id) || !p.isAlive;
    const m = this.meeting;
    const isMeetingActive = m && (m.phase === 'DISCUSSION' || m.phase === 'VOTING');
    // Living players only chat during active meetings; dead ghost players can chat anytime in Haunt Chat!
    if (!isGhost && !isMeetingActive) return;

    const now = Date.now();
    if (now - p.lastChatAt < 500) return;
    p.lastChatAt = now;
    const text = String(rawText || '').trim().slice(0, MAX_CHAT_LENGTH);
    if (!text) return;

    if (isGhost) {
      this.ghostManager.broadcastGhostChat(
        { id: p.id, name: p.name, colorId: p.colorId, hatId: p.hatId, room: p.room },
        text,
        this.humans(),
        this.io
      );
    } else {
      this.broadcastChat(p, text);
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
        }
        break;
      case GAME_STATES.PLAYING: {
        const { criticalFailed, failedType } = this.sabotageManager.tick(now);
        if (criticalFailed) {
          this.endGame('impostors', failedType || 'Critical Sabotage');
          break;
        }
        this.checkBodySightings();
        for (const p of [...this.players.values()]) {
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

    const bodies: BodyView[] = [...this.bodies.values()].map((b) => ({
      id: b.id,
      colorId: b.colorId,
      x: b.x,
      z: b.z,
      room: b.room,
    }));
    const meeting = this.meeting ? this.meetingView(now) : undefined;
    const stats = this.taskStats();
    const taskProgress = stats.progress;

    for (const human of this.humans()) {
      const snapshot: GameStateSnapshot = {
        state: this.stateMachine.currentState,
        players: playersObj,
        timestamp: now,
        bodies,
        meeting,
        taskProgress,
        tasksCompleted: stats.done,
        totalTasks: stats.total,
        you: this.youView(human, now),
        winner: this.winner || undefined,
        sabotage: this.sabotageManager.getActiveSabotage(),
        lockedDoors: this.sabotageManager.getLockedDoors(),
        meetingHistory: [...this.meetingHistory],
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
    // Impostors only fake tasks: it looks the same to them but never counts toward progress.
    t.step++;
    if (t.step >= t.def.steps.length) {
      if (!t.done) {
        t.done = true;
        p.stats.tasksCompleted++;
      }
    }
    if (p.role === 'crewmate') this.checkWin();
  }

  private taskStats(): { done: number; total: number; progress: number } {
    let total = 0;
    let done = 0;
    for (const p of this.players.values()) {
      if (p.role !== 'crewmate') continue;
      for (const t of p.tasks) {
        total += t.def.steps.length;
        done += t.done ? t.def.steps.length : t.step;
      }
    }
    const progress = total === 0 ? 0 : done / total;
    return { done, total, progress };
  }

  private taskProgress(): number {
    return this.taskStats().progress;
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
    victim.stats.survived = false;
    victim.stats.eliminationReason = 'killed';
    killer.stats.killsCount++;
    this.ghostManager.eliminatePlayer(victim, 'killed', killer.id);
    this.bodies.set(victim.id, {
      id: victim.id,
      colorId: victim.colorId,
      x: victim.x,
      z: victim.z,
      killerId: killer.id,
      room: victim.room,
    });

    // Like the original: the impostor ends up where the victim stood.
    killer.x = victim.x;
    killer.z = victim.z;
    killer.room = victim.room;
    killer.posSeq = (killer.posSeq || 0) + 1;
    killer.killReadyAt = Date.now() + this.settings.killCooldown * 1000;

    // Bots that saw it remember who did it.
    for (const w of this.players.values()) {
      if (!w.isBot || !w.isAlive || w.role === 'impostor' || w.id === victim.id) continue;
      const dist = Math.hypot(w.x - victim.x, w.z - victim.z);
      if (dist < 10 && !lineIntersectsWalls(w.x, w.z, victim.x, victim.z).hit) {
        w.brain!.suspectId = killer.id;
      }
    }

    const dx = victim.x - killer.x;
    const dz = victim.z - killer.z;
    const dist = Math.hypot(dx, dz) || 1;
    const impulseX = (dx / dist) * 2.8;
    const impulseZ = (dz / dist) * 2.8;

    const killPayload: PlayerKilledPayload = {
      victimId: victim.id,
      victimName: victim.name,
      victimColorId: victim.colorId,
      killerId: killer.id,
      killerName: killer.name,
      x: victim.x,
      z: victim.z,
      room: victim.room,
      impulseX,
      impulseZ,
      timestamp: Date.now(),
    };

    this.io.to(this.code).emit(EVENTS.PLAYER_KILLED, killPayload);
    this.checkWin();
  }

  private checkBodySightings(): void {
    if (this.bodies.size === 0) return;
    for (const [bodyId, body] of this.bodies) {
      if (this.discoveredBodies.has(bodyId)) continue;
      for (const p of this.players.values()) {
        if (!p.isAlive || p.ventId || p.inVent) continue;
        const dist = Math.hypot(p.x - body.x, p.z - body.z);
        // Discovery range: within REPORT_RANGE + 1.5 (~4.0m) with direct line-of-sight
        if (dist <= REPORT_RANGE + 1.5) {
          const los = lineIntersectsWalls(p.x, p.z, body.x, body.z);
          if (!los.hit) {
            this.discoveredBodies.add(bodyId);
            const payload: BodyDiscoveredPayload = {
              bodyId,
              victimColorId: body.colorId,
              discovererId: p.id,
              discovererName: p.name,
              discovererColorId: p.colorId,
              room: body.room,
              x: body.x,
              z: body.z,
              timestamp: Date.now(),
            };
            this.io.to(this.code).emit(EVENTS.BODY_DISCOVERED, payload);
            break;
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Meetings
  // ---------------------------------------------------------------------------

  private startMeeting(caller: GamePlayer, reason: 'body' | 'emergency', body?: Body): void {
    if (this.meeting || this.stateMachine.currentState !== GAME_STATES.PLAYING) return;
    const now = Date.now();
    this.meeting = {
      phase: 'INTRO',
      endsAt: now + MEETING_INTRO_MS,
      callerId: caller.id,
      callerName: caller.name,
      reason,
      bodyColorId: body?.colorId,
      bodyRoom: body?.room,
      votes: new Map(),
    };

    const roundNumber = this.meetingHistory.length + 1;
    const elapsedSec = Math.floor((now - this.matchStartTime) / 1000);
    const mins = Math.floor(elapsedSec / 60);
    const secs = elapsedSec % 60;
    const timeFormatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    this.meetingHistory.push({
      id: `inc_${roundNumber}_${now}`,
      roundNumber,
      callerId: caller.id,
      callerName: caller.name,
      callerColorId: caller.colorId,
      reason,
      bodyColorId: body?.colorId,
      bodyRoom: body?.room,
      timestamp: now,
      timeFormatted,
    });

    this.bodies.clear();
    this.discoveredBodies.clear();
    this.sabotageManager.clearAll();
    this.stateMachine.transitionTo(GAME_STATES.MEETING);

    // Everyone gathers around the table; vents and tasks are interrupted.
    let i = 0;
    for (const p of this.players.values()) {
      p.working = null;
      p.ventId = null;
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
      const choice = m.votes.get(p.id) ?? 'skip'; // not voting counts as a skip
      tally[choice] = (tally[choice] || 0) + 1;
      voteList.push({ voterId: p.id, targetId: choice });
    }

    let top = 0;
    for (const n of Object.values(tally)) top = Math.max(top, n);
    const leaders = Object.keys(tally).filter((k) => tally[k] === top);

    const results: MeetingResults = {
      votes: this.settings.anonymousVotes ? [] : voteList,
      tally,
      outcome: 'tie',
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

    const currentIncident = this.meetingHistory[this.meetingHistory.length - 1];
    if (currentIncident) {
      currentIncident.outcome = results.outcome;
      currentIncident.ejectedName = results.ejectedName;
      currentIncident.ejectedColorId = results.ejectedColorId;
    }
  }

  private applyEjection(m: Meeting): void {
    const r = m.results;
    if (!r || r.outcome !== 'ejected' || !r.ejectedId) return;
    const ejected = this.players.get(r.ejectedId);
    if (!ejected) return;
    ejected.isAlive = false;
    this.ghostManager.eliminatePlayer(ejected, 'ejected');
    if (this.settings.confirmEjects) {
      r.wasImpostor = ejected.role === 'impostor';
      r.impostorsRemaining = [...this.players.values()].filter((p) => p.isAlive && p.role === 'impostor').length;
      const currentIncident = this.meetingHistory[this.meetingHistory.length - 1];
      if (currentIncident) {
        currentIncident.wasImpostor = r.wasImpostor;
      }
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
      if (p.role === 'impostor') p.killReadyAt = now + Math.min(this.settings.killCooldown, 15) * 1000;
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
      callerColorId: this.players.get(m.callerId)?.colorId,
      reason: m.reason,
      bodyColorId: m.bodyColorId,
      bodyRoom: m.bodyRoom,
      voted: [...m.votes.keys()],
      results: m.results,
      history: [...this.meetingHistory],
    };
  }

  private broadcastChat(sender: GamePlayer, text: string): void {
    const isGhost = this.ghostManager.isGhost(sender.id) || !sender.isAlive;
    if (isGhost) {
      this.ghostManager.broadcastGhostChat(
        { id: sender.id, name: sender.name, colorId: sender.colorId, hatId: sender.hatId, room: sender.room },
        text,
        this.humans(),
        this.io
      );
      return;
    }

    const msg = {
      id: `c${++this.chatCounter}`,
      senderId: sender.id,
      name: sender.name,
      senderName: sender.name,
      colorId: sender.colorId,
      senderColorId: sender.colorId,
      senderHatId: sender.hatId,
      text,
      ghost: false,
      scope: 'team' as const,
      timestamp: Date.now(),
      senderRoom: sender.room,
    };
    for (const h of this.humans()) {
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
    const hasImpostorSeat = all.some((p) => p.role === 'impostor');
    const hasCrewSeat = all.some((p) => p.role === 'crewmate');

    if (hasImpostorSeat && impostors === 0) {
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
      killCooldownMs: Math.max(0, p.killReadyAt - now),
      emergencyLeft: p.emergenciesLeft,
      emergencyCooldownMs: Math.max(0, this.emergencyReadyAt - now),
      ventId: p.ventId,
      ventLinks: vent
        ? vent.connectedTo.map((id) => {
            const v = MAP_VENTS.find((x) => x.id === id)!;
            return { id: v.id, x: v.x, z: v.z };
          })
        : [],
      sabotageCooldownMs: p.role === 'impostor' ? this.sabotageManager.getCooldownRemainingMs(now) : undefined,
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
      stuckSince: 0,
    };
  }

  private botSpeed(): number {
    return BASE_PLAYER_SPEED * this.settings.playerSpeed * 0.92;
  }

  private setGoal(bot: GamePlayer, goal: Pt): void {
    const b = bot.brain!;
    b.goal = goal;
    b.path = findPath({ x: bot.x, z: bot.z }, goal);
  }

  private botMove(bot: GamePlayer, dt: number): void {
    const b = bot.brain!;
    bot.isMoving = false;
    if (b.mode === 'work' || b.path.length === 0) return;

    let remaining = this.botSpeed() * dt;
    while (remaining > 0 && b.path.length) {
      const wp = b.path[0];
      const dx = wp.x - bot.x;
      const dz = wp.z - bot.z;
      const d = Math.hypot(dx, dz);
      const reach = b.path.length > 1 ? 0.45 : 0.15;
      if (d <= reach) {
        b.path.shift();
        continue;
      }
      const step = Math.min(remaining, d);
      let nx = bot.x + (dx / d) * step;
      let nz = bot.z + (dz / d) * step;
      if (bot.isAlive) {
        const r = resolveWallCollisions(nx, nz);
        nx = r.x;
        nz = r.z;
      }
      bot.x = nx;
      bot.z = nz;
      bot.rotation = Math.atan2(dx, dz);
      bot.isMoving = true;
      remaining -= step;
      if (step < d) break;
    }
    bot.room = detectRoom(bot.x, bot.z);
  }

  private botUpdate(bot: GamePlayer, now: number, dt: number): void {
    const b = bot.brain!;
    this.botThink(bot, now);
    if (this.stateMachine.currentState !== GAME_STATES.PLAYING) return; // a meeting or game over just started
    this.botMove(bot, dt);

    // Un-stick: if we should be walking but haven't moved, replan.
    if (b.path.length && b.mode !== 'work') {
      if (Math.hypot(bot.x - b.lastPos.x, bot.z - b.lastPos.z) > 0.4) {
        b.lastPos = { x: bot.x, z: bot.z };
        b.stuckSince = now;
      } else if (now - b.stuckSince > 2500 && b.goal) {
        b.stuckSince = now;
        this.setGoal(bot, b.goal);
      }
    } else {
      b.stuckSince = now;
      b.lastPos = { x: bot.x, z: bot.z };
    }
  }

  private canSee(a: Pt, b: Pt, maxDist: number): boolean {
    return Math.hypot(a.x - b.x, a.z - b.z) <= maxDist && !lineIntersectsWalls(a.x, a.z, b.x, b.z).hit;
  }

  private botThink(bot: GamePlayer, now: number): void {
    const b = bot.brain!;

    // Finishing a task is checked every tick so completion is timely.
    if (b.mode === 'work') {
      if (now >= b.workEnd) {
        if (b.currentTask) this.advanceTask(bot, b.currentTask.def.id);
        b.currentTask = null;
        b.mode = 'idle';
        b.waitUntil = now + 500 + Math.random() * 1500;
      }
      return;
    }

    if (now < b.thinkAt) return;
    b.thinkAt = now + 250 + Math.random() * 150;

    // --- 1. Notice bodies (living bots only) ---
    if (bot.isAlive && this.bodies.size > 0 && b.mode !== 'flee') {
      let nearest: Body | null = null;
      let best = Infinity;
      for (const body of this.bodies.values()) {
        const d = Math.hypot(bot.x - body.x, bot.z - body.z);
        if (d < best && this.canSee(bot, body, 11)) {
          best = d;
          nearest = body;
        }
      }
      if (nearest) {
        const guilty = nearest.killerId === bot.id;
        const willReport = bot.role === 'crewmate' || (!guilty && Math.random() < 0.2);
        if (willReport) {
          if (best <= REPORT_RANGE - 1) {
            this.startMeeting(bot, 'body', nearest);
            return;
          }
          b.mode = 'body';
          this.setGoal(bot, { x: nearest.x, z: nearest.z });
          return;
        }
      }
    }
    if (b.mode === 'body') b.mode = 'idle';

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

    // --- 3. Tasks / wandering ---
    if (b.mode === 'task' && b.currentTask) {
      const step = this.taskView(b.currentTask);
      if (Math.hypot(bot.x - step.x, bot.z - step.z) < 1.3) {
        b.mode = 'work';
        b.workEnd = now + step.hold * 1000 + Math.random() * 800;
        b.path = [];
        bot.isMoving = false;
      } else if (b.path.length === 0) {
        this.setGoal(bot, { x: step.x, z: step.z });
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
      const remaining = bot.tasks.filter((t) => !t.done);
      if (remaining.length > 0 && Math.random() < 0.9) {
        b.currentTask = remaining[Math.floor(Math.random() * remaining.length)];
        b.mode = 'task';
        const step = this.taskView(b.currentTask);
        this.setGoal(bot, { x: step.x, z: step.z });
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
    if (b.suspectId && others.some((p) => p.id === b.suspectId) && Math.random() < 0.9) return b.suspectId;
    if (Math.random() < 0.55) return 'skip';
    return others[Math.floor(Math.random() * others.length)].id;
  }

  private scheduleBotChat(m: Meeting, now: number): void {
    const aliveNames = [...this.players.values()].filter((p) => p.isAlive).map((p) => p.name);
    for (const p of this.players.values()) {
      if (!p.isBot || !p.isAlive) continue;
      const b = p.brain!;
      b.chatLine = null;
      b.chatAt = now + 1500 + Math.random() * 5000;

      const suspectPlayer = b.suspectId ? this.players.get(b.suspectId) : undefined;
      const completedTaskNames = p.tasks.filter((t) => t.done).map((t) => t.def.name);

      generateBotMeetingStatement({
        botName: p.name,
        botRole: p.role,
        currentRoom: p.room,
        completedTasks: completedTaskNames,
        suspectName: suspectPlayer?.name,
        isCaller: m.callerId === p.id,
        meetingReason: m.reason,
        callerName: m.callerName,
        bodyRoom: m.bodyRoom,
        bodyColor: m.bodyColorId,
        alivePlayers: aliveNames,
      })
        .then((statement) => {
          b.chatLine = statement;
        })
        .catch(() => {});
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
