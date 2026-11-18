/**
 * Impostor Protocol - Lobby Manager
 * Authoritative lobby lifecycle, join code generator, color/hat management, host migration.
 */

import { Server, Socket } from 'socket.io';
import {
  DEFAULT_GAME_SETTINGS,
  GameSettings,
  GAME_STATES,
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  KILL_DISTANCE_M,
  KillDistance,
  LOBBY_RECONNECT_GRACE_MS,
  MAX_PLAYERS_PER_LOBBY,
  MIN_PLAYERS_TO_START,
  PLAYER_COLORS,
  PLAYER_HATS,
  RECONNECT_GRACE_PERIOD_MS,
  TaskBarUpdateMode,
  sanitizePlayerName,
} from '../shared/constants';
import { EVENTS, LobbyData, LobbyPlayer } from '../shared/events';
import { GameRoom } from './game/GameRoom';

const clampNumber = (value: unknown, fallback: number, min: number, max: number, integer = false): number => {
  const parsed = Number(value);
  const valid = Number.isFinite(parsed) ? parsed : fallback;
  const bounded = Math.max(min, Math.min(max, valid));
  return integer ? Math.round(bounded) : bounded;
};

export class Lobby {
  public code: string;
  public hostId: string;
  public isPrivate: boolean;
  public players: Map<string, LobbyPlayer> = new Map();
  public settings: GameSettings;
  public state: (typeof GAME_STATES)[keyof typeof GAME_STATES] = GAME_STATES.LOBBY;
  public countdownTimer: NodeJS.Timeout | null = null;
  public startingCountdown: number = 3;
  public createdAt: number = Date.now();

  constructor(code: string, hostId: string, isPrivate: boolean = false) {
    this.code = code;
    this.hostId = hostId;
    this.isPrivate = isPrivate;
    this.settings = { ...DEFAULT_GAME_SETTINGS };
  }

  public getAvailableColor(preferredColorId?: string): string {
    const takenColors = new Set(Array.from(this.players.values()).map((p) => p.colorId));
    if (preferredColorId && !takenColors.has(preferredColorId)) {
      return preferredColorId;
    }
    const available = PLAYER_COLORS.find((c) => !takenColors.has(c.id));
    return available ? available.id : PLAYER_COLORS[0].id;
  }

  public getUniquePlayerName(requestedName: string): string {
    let name = sanitizePlayerName(requestedName);
    const existingNames = new Set(Array.from(this.players.values()).map((p) => p.name));
    if (!existingNames.has(name)) {
      return name;
    }
    let counter = 2;
    while (existingNames.has(`${name} ${counter}`)) {
      counter++;
    }
    return `${name} ${counter}`;
  }

  public toJSON(): LobbyData {
    return {
      code: this.code,
      hostId: this.hostId,
      isPrivate: this.isPrivate,
      players: Array.from(this.players.values()),
      settings: this.settings,
      state: this.state,
      startingCountdown: this.state === GAME_STATES.STARTING ? this.startingCountdown : undefined,
    };
  }
}

/** A client-generated id that survives page refreshes, so a dropped player can reclaim their seat. */
const isValidSessionId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v);

export class LobbyManager {
  private io: Server;
  private gameRooms: Map<string, GameRoom> = new Map();
  private lobbies: Map<string, Lobby> = new Map();
  private socketToLobby: Map<string, string> = new Map();
  private tickInterval: NodeJS.Timeout | null = null;
  /** sessionId -> current player id (socket id) of the seat it owns. */
  private sessionToPlayer: Map<string, string> = new Map();
  private playerToSession: Map<string, string> = new Map();
  /** Seats whose socket dropped, waiting for a rejoin before being removed. */
  private disconnectTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(io: Server) {
    this.io = io;
    this.startTick();
  }

  private generateLobbyCode(): string {
    let code = '';
    do {
      code = '';
      for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
        const idx = Math.floor(Math.random() * JOIN_CODE_ALPHABET.length);
        code += JOIN_CODE_ALPHABET[idx];
      }
    } while (this.lobbies.has(code));
    return code;
  }

  public createLobby(socket: Socket, playerName: string, isPrivate: boolean = false, hatId?: string, sessionId?: unknown): void {
    // Leave any existing lobby first
    this.leaveLobby(socket);

    const code = this.generateLobbyCode();
    const lobby = new Lobby(code, socket.id, isPrivate);
    const uniqueName = lobby.getUniquePlayerName(playerName);
    const colorId = lobby.getAvailableColor('red');

    const player: LobbyPlayer = {
      id: socket.id,
      name: uniqueName,
      colorId,
      hatId: PLAYER_HATS.find((hat) => hat.id === hatId)?.id ?? 'none',
      isHost: true,
      x: 0,
      z: 0,
      rotation: 0,
      isMoving: false,
    };

    lobby.players.set(socket.id, player);
    this.lobbies.set(code, lobby);
    this.socketToLobby.set(socket.id, code);
    this.bindSession(socket.id, sessionId);

    socket.join(code);
    socket.emit(EVENTS.LOBBY_STATE, lobby.toJSON());
  }

  public joinLobby(socket: Socket, codeRaw: string, playerName: string, hatId?: string, sessionId?: unknown): void {
    this.leaveLobby(socket);

    const code = (typeof codeRaw === 'string' ? codeRaw : '').trim().toUpperCase();
    const lobby = this.lobbies.get(code);

    if (!lobby) {
      socket.emit(EVENTS.LOBBY_ERROR, { message: 'Lobby not found. Check the code and try again.' });
      return;
    }

    if (lobby.state !== GAME_STATES.LOBBY) {
      socket.emit(EVENTS.LOBBY_ERROR, { message: 'Game already in progress. Wait for it to finish.' });
      return;
    }

    if (lobby.players.size >= MAX_PLAYERS_PER_LOBBY) {
      socket.emit(EVENTS.LOBBY_ERROR, { message: 'Lobby is full (10/10 players).' });
      return;
    }

    const uniqueName = lobby.getUniquePlayerName(playerName);
    const colorId = lobby.getAvailableColor();

    // Spawn slightly jittered around center of dropship
    const spawnX = (Math.random() - 0.5) * 4;
    const spawnZ = (Math.random() - 0.5) * 2;

    const player: LobbyPlayer = {
      id: socket.id,
      name: uniqueName,
      colorId,
      hatId: PLAYER_HATS.find((hat) => hat.id === hatId)?.id ?? 'none',
      isHost: false,
      x: spawnX,
      z: spawnZ,
      rotation: 0,
      isMoving: false,
    };

    lobby.players.set(socket.id, player);
    this.socketToLobby.set(socket.id, code);
    this.bindSession(socket.id, sessionId);

    socket.join(code);
    this.broadcastLobbyState(lobby);
  }

  public setColor(socket: Socket, colorId: string): void {
    const lobby = this.getLobbyBySocket(socket);
    if (!lobby || lobby.state !== GAME_STATES.LOBBY) return;

    const player = lobby.players.get(socket.id);
    if (!player) return;

    // Check if color is taken by another player
    const isTaken = Array.from(lobby.players.values()).some((p) => p.id !== socket.id && p.colorId === colorId);
    if (isTaken) {
      socket.emit(EVENTS.LOBBY_ERROR, { message: 'Color already taken by another player.' });
      return;
    }

    const validColor = PLAYER_COLORS.find((c) => c.id === colorId);
    if (validColor) {
      player.colorId = validColor.id;
      this.broadcastLobbyState(lobby);
    }
  }

  public setReady(socket: Socket, ready: boolean): void {
    const lobby = this.getLobbyBySocket(socket);
    const player = lobby?.players.get(socket.id);
    if (!lobby || !player || lobby.state !== GAME_STATES.LOBBY || player.isReady === ready) return;
    player.isReady = ready;
    this.broadcastLobbyState(lobby);
  }

  public setHat(socket: Socket, hatId: string): void {
    const lobby = this.getLobbyBySocket(socket);
    if (!lobby) return;

    const player = lobby.players.get(socket.id);
    if (!player) return;

    const validHat = PLAYER_HATS.find((h) => h.id === hatId);
    if (validHat) {
      player.hatId = validHat.id;
      this.broadcastLobbyState(lobby);
    }
  }

  public updateSettings(socket: Socket, partialSettings: Partial<GameSettings>): void {
    const lobby = this.getLobbyBySocket(socket);
    if (!lobby || lobby.state !== GAME_STATES.LOBBY) return;

    // Host check
    if (lobby.hostId !== socket.id) {
      socket.emit(EVENTS.LOBBY_ERROR, { message: 'Only the host can modify game settings.' });
      return;
    }

    // Validate settings values
    const s = { ...lobby.settings, ...partialSettings };
    s.impostorCount = clampNumber(s.impostorCount, 1, 1, 3, true);
    s.playerSpeed = clampNumber(s.playerSpeed, 1, 0.5, 3);
    s.crewmateVision = clampNumber(s.crewmateVision, 1, 0.25, 5);
    s.impostorVision = clampNumber(s.impostorVision, 1.5, 0.25, 5);
    s.killCooldown = clampNumber(s.killCooldown, 25, 10, 60);
    s.commonTasks = clampNumber(s.commonTasks, 1, 0, 2, true);
    s.shortTasks = clampNumber(s.shortTasks, 2, 0, 5, true);
    s.longTasks = clampNumber(s.longTasks, 1, 0, 3, true);
    s.emergencyMeetings = clampNumber(s.emergencyMeetings, 1, 0, 9, true);
    s.emergencyCooldown = clampNumber(s.emergencyCooldown, 15, 0, 60, true);
    s.discussionTime = clampNumber(s.discussionTime, 15, 0, 120, true);
    s.votingTime = clampNumber(s.votingTime, 120, 15, 300, true);
    // Always leave crewmates at least one task, otherwise the task bar starts full and crew wins instantly.
    if (s.commonTasks + s.shortTasks + s.longTasks === 0) s.shortTasks = 1;
    s.killDistance = (Object.keys(KILL_DISTANCE_M) as KillDistance[]).includes(s.killDistance)
      ? s.killDistance : lobby.settings.killDistance;
    s.taskBarUpdates = (['Always', 'Meetings', 'Never'] as TaskBarUpdateMode[]).includes(s.taskBarUpdates)
      ? s.taskBarUpdates : lobby.settings.taskBarUpdates;
    s.confirmEjects = s.confirmEjects === true;
    s.anonymousVotes = s.anonymousVotes === true;
    s.visualTasks = s.visualTasks !== false;
    s.map = DEFAULT_GAME_SETTINGS.map; // only one map exists
    s.fillWithBots = s.fillWithBots !== false;

    lobby.settings = s;
    this.broadcastLobbyState(lobby);
  }

  public kickPlayer(socket: Socket, targetSocketId: string): void {
    const lobby = this.getLobbyBySocket(socket);
    if (!lobby || lobby.state !== GAME_STATES.LOBBY) return;

    if (lobby.hostId !== socket.id) {
      socket.emit(EVENTS.LOBBY_ERROR, { message: 'Only the host can kick players.' });
      return;
    }

    if (targetSocketId === socket.id) return; // Cannot kick self

    if (!lobby.players.has(targetSocketId)) return;
    const targetSocket = this.io.sockets.sockets.get(targetSocketId);
    targetSocket?.emit(EVENTS.REMOVED_FROM_LOBBY, { message: 'You were removed from the lobby by the host.' });
    this.removeSeat(lobby.code, targetSocketId);
  }

  public handleLobbyInput(
    socket: Socket,
    input: { x: number; z: number; rotation: number; isMoving: boolean }
  ): void {
    const lobby = this.getLobbyBySocket(socket);
    if (!lobby || lobby.state !== GAME_STATES.LOBBY) return;

    const player = lobby.players.get(socket.id);
    if (!player) return;

    if (!input || ![input.x, input.z].every((n) => Number.isFinite(n))) return;
    // Bounds check for dropship room (-8 to 8 on X, -4 to 4 on Z)
    player.x = Math.max(-7.5, Math.min(7.5, input.x));
    player.z = Math.max(-3.5, Math.min(3.5, input.z));
    player.rotation = Number.isFinite(input.rotation) ? input.rotation : 0;
    player.isMoving = !!input.isMoving;
  }

  public startGame(socket: Socket, isTestMode: boolean = false): void {
    const lobby = this.getLobbyBySocket(socket);
    if (!lobby || lobby.state !== GAME_STATES.LOBBY) return;

    if (lobby.hostId !== socket.id) {
      socket.emit(EVENTS.LOBBY_ERROR, { message: 'Only the host can start the game.' });
      return;
    }

    // With bot fill on (default), any lobby can start: AI bots top the match up to BOT_FILL_TARGET seats.
    if (!isTestMode && !lobby.settings.fillWithBots && lobby.players.size < MIN_PLAYERS_TO_START) {
      socket.emit(EVENTS.LOBBY_ERROR, {
        message: `At least ${MIN_PLAYERS_TO_START} players required to start (currently ${lobby.players.size}). Turn on bot fill to play with fewer.`,
      });
      return;
    }

    // Start 3-second countdown
    lobby.state = GAME_STATES.STARTING;
    lobby.startingCountdown = 3;
    this.broadcastLobbyState(lobby);

    if (lobby.countdownTimer) clearInterval(lobby.countdownTimer);

    lobby.countdownTimer = setInterval(() => {
      lobby.startingCountdown--;
      if (lobby.startingCountdown <= 0) {
        if (lobby.countdownTimer) clearInterval(lobby.countdownTimer);
        lobby.countdownTimer = null;
        this.launchGame(lobby);
      } else {
        this.io.to(lobby.code).emit(EVENTS.GAME_STARTING, { countdown: lobby.startingCountdown });
        this.broadcastLobbyState(lobby);
      }
    }, 1000);
  }

  private launchGame(lobby: Lobby): void {
    lobby.state = GAME_STATES.PLAYING;
    this.broadcastLobbyState(lobby);

    // Instantiate active GameRoom on spaceship map
    const gameRoom = new GameRoom(
      lobby.code,
      this.io,
      lobby.settings,
      Array.from(lobby.players.values()),
      () => this.returnToLobby(lobby.code)
    );
    this.gameRooms.set(lobby.code, gameRoom);

    // Notify clients that match has started
    this.io.to(lobby.code).emit(EVENTS.GAME_STARTED, {
      map: lobby.settings.map,
      settings: lobby.settings,
    });
  }

  /** Called by a GameRoom when the post-game screen is over: everyone goes back to the waiting room. */
  private returnToLobby(code: string): void {
    const room = this.gameRooms.get(code);
    if (room) {
      room.destroy();
      this.gameRooms.delete(code);
    }
    const lobby = this.lobbies.get(code);
    if (!lobby) return;
    lobby.state = GAME_STATES.LOBBY;
    for (const p of lobby.players.values()) {
      p.isReady = false;
      p.x = (Math.random() - 0.5) * 4;
      p.z = (Math.random() - 0.5) * 2;
      p.isMoving = false;
    }
    this.broadcastLobbyState(lobby);
  }

  public gameRoomFor(socket: Socket): GameRoom | undefined {
    const code = this.socketToLobby.get(socket.id);
    return code ? this.gameRooms.get(code) : undefined;
  }

  public handlePlayerInput(
    socket: Socket,
    input: { seq: number; x: number; z: number; rotation: number; isMoving: boolean }
  ): void {
    const code = this.socketToLobby.get(socket.id);
    if (!code) return;
    const gameRoom = this.gameRooms.get(code);
    if (gameRoom) {
      gameRoom.handlePlayerInput(socket.id, input);
    }
  }

  /** Deliberate exit (Leave button, creating/joining another lobby): the seat is released immediately. */
  public leaveLobby(socket: Socket): void {
    const code = this.socketToLobby.get(socket.id);
    if (!code) return;
    socket.leave(code);
    this.removeSeat(code, socket.id);
  }

  /**
   * Connection dropped. If the client registered a session, hold the seat so a refresh or network blip
   * doesn't eject them (or end the match); otherwise behave like a normal leave.
   */
  public handleDisconnect(socket: Socket): void {
    const code = this.socketToLobby.get(socket.id);
    if (!code) return;
    const lobby = this.lobbies.get(code);
    const player = lobby?.players.get(socket.id);
    if (!lobby || !player || !this.playerToSession.has(socket.id)) {
      this.removeSeat(code, socket.id);
      return;
    }

    player.disconnected = true;
    player.isMoving = false;
    this.gameRooms.get(code)?.setDisconnected(socket.id, true);
    // RECONNECT_GRACE_MS (env) overrides both holds; used by the multiplayer smoke test.
    const override = Number(process.env.RECONNECT_GRACE_MS);
    const grace = override > 0 ? override
      : lobby.state === GAME_STATES.LOBBY ? LOBBY_RECONNECT_GRACE_MS : RECONNECT_GRACE_PERIOD_MS;
    const playerId = socket.id;
    this.clearDisconnectTimer(playerId);
    this.disconnectTimers.set(
      playerId,
      setTimeout(() => {
        this.disconnectTimers.delete(playerId);
        const currentCode = this.socketToLobby.get(playerId);
        if (currentCode) this.removeSeat(currentCode, playerId);
      }, grace)
    );
    this.broadcastLobbyState(lobby);
  }

  /** A reconnecting client reclaims the seat held for its session; all ids are re-keyed to the new socket. */
  public rejoin(socket: Socket, sessionId: unknown): void {
    const fail = (message: string, retry = false): void => {
      socket.emit(EVENTS.REJOIN_FAILED, { message, retry });
    };
    if (!isValidSessionId(sessionId)) return fail('Your previous session could not be restored.');

    const oldId = this.sessionToPlayer.get(sessionId);
    const code = oldId ? this.socketToLobby.get(oldId) : undefined;
    const lobby = code ? this.lobbies.get(code) : undefined;
    const player = oldId && lobby ? lobby.players.get(oldId) : undefined;
    if (!oldId || !code || !lobby || !player) {
      if (oldId) this.unbindSession(oldId);
      return fail('Your seat was released while you were away. Join again with the room code.');
    }
    if (oldId === socket.id) {
      socket.emit(EVENTS.LOBBY_STATE, lobby.toJSON());
      return;
    }
    // Old socket still open: either a refresh whose close hasn't arrived yet (client retries), or the
    // same session in a duplicated tab (retries run out). Never steal a live seat.
    if (this.io.sockets.sockets.get(oldId)?.connected) {
      return fail('This seat is already in use in another tab.', true);
    }

    // If this socket was sitting in some other lobby, release that first.
    if (this.socketToLobby.has(socket.id)) this.leaveLobby(socket);

    this.clearDisconnectTimer(oldId);
    lobby.players.delete(oldId);
    player.id = socket.id;
    player.disconnected = false;
    lobby.players.set(socket.id, player);
    if (lobby.hostId === oldId) lobby.hostId = socket.id;
    this.socketToLobby.delete(oldId);
    this.socketToLobby.set(socket.id, code);
    this.sessionToPlayer.set(sessionId, socket.id);
    this.playerToSession.delete(oldId);
    this.playerToSession.set(socket.id, sessionId);
    socket.join(code);

    const gameRoom = this.gameRooms.get(code);
    gameRoom?.rebindPlayer(oldId, socket.id);
    this.broadcastLobbyState(lobby);
    if (gameRoom) {
      socket.emit(EVENTS.GAME_STARTED, { map: lobby.settings.map, settings: lobby.settings });
    }
  }

  /** Remove a seat from its lobby (and running match), migrating host and cleaning up empty lobbies. */
  private removeSeat(code: string, playerId: string): void {
    this.clearDisconnectTimer(playerId);
    this.unbindSession(playerId);
    this.socketToLobby.delete(playerId);
    this.io.sockets.sockets.get(playerId)?.leave(code);

    const lobby = this.lobbies.get(code);
    if (!lobby) return;

    lobby.players.delete(playerId);

    // If countdown was in progress and players < minimum, cancel it
    const minToStart = lobby.settings.fillWithBots ? 1 : MIN_PLAYERS_TO_START;
    if (lobby.state === GAME_STATES.STARTING && lobby.players.size < minToStart) {
      if (lobby.countdownTimer) {
        clearInterval(lobby.countdownTimer);
        lobby.countdownTimer = null;
      }
      lobby.state = GAME_STATES.LOBBY;
    }

    // Clean up active game room player
    const gameRoom = this.gameRooms.get(code);
    if (gameRoom) {
      gameRoom.removePlayer(playerId);
    }

    if (lobby.players.size === 0) {
      if (lobby.countdownTimer) clearInterval(lobby.countdownTimer);
      if (gameRoom) {
        gameRoom.destroy();
        this.gameRooms.delete(code);
      }
      this.lobbies.delete(code);
      return;
    }

    // Host migration: prefer someone who is actually connected.
    if (lobby.hostId === playerId || !lobby.players.has(lobby.hostId)) {
      const players = [...lobby.players.values()];
      const next = players.find((p) => !p.disconnected) ?? players[0];
      lobby.hostId = next.id;
    }
    for (const p of lobby.players.values()) p.isHost = p.id === lobby.hostId;

    this.broadcastLobbyState(lobby);
  }

  private bindSession(playerId: string, sessionId: unknown): void {
    if (!isValidSessionId(sessionId)) return;
    // A session owns at most one seat.
    const previous = this.sessionToPlayer.get(sessionId);
    if (previous && previous !== playerId) {
      const prevCode = this.socketToLobby.get(previous);
      if (prevCode) this.removeSeat(prevCode, previous);
    }
    this.sessionToPlayer.set(sessionId, playerId);
    this.playerToSession.set(playerId, sessionId);
  }

  private unbindSession(playerId: string): void {
    const sessionId = this.playerToSession.get(playerId);
    if (!sessionId) return;
    this.playerToSession.delete(playerId);
    if (this.sessionToPlayer.get(sessionId) === playerId) this.sessionToPlayer.delete(sessionId);
  }

  private clearDisconnectTimer(playerId: string): void {
    const t = this.disconnectTimers.get(playerId);
    if (t) {
      clearTimeout(t);
      this.disconnectTimers.delete(playerId);
    }
  }

  public getLobbyBySocket(socket: Socket): Lobby | undefined {
    const code = this.socketToLobby.get(socket.id);
    return code ? this.lobbies.get(code) : undefined;
  }

  public broadcastLobbyState(lobby: Lobby): void {
    this.io.to(lobby.code).emit(EVENTS.LOBBY_STATE, lobby.toJSON());
  }

  private startTick(): void {
    // 20 Hz synchronization for lobby movements
    this.tickInterval = setInterval(() => {
      for (const lobby of this.lobbies.values()) {
        if (lobby.state === GAME_STATES.LOBBY || lobby.state === GAME_STATES.STARTING) {
          const playersObj: Record<string, { x: number; z: number; rotation: number; isMoving: boolean }> = {};
          for (const [id, p] of lobby.players) {
            playersObj[id] = {
              x: p.x,
              z: p.z,
              rotation: p.rotation,
              isMoving: p.isMoving,
            };
          }
          this.io.to(lobby.code).emit(EVENTS.LOBBY_MOVEMENT_SYNC, { players: playersObj });
        }
      }
    }, 50); // 20 Hz (50ms)
  }

  public destroy(): void {
    if (this.tickInterval) clearInterval(this.tickInterval);
  }
}
