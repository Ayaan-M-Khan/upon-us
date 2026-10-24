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
  MAX_PLAYERS_PER_LOBBY,
  MIN_PLAYERS_TO_START,
  PLAYER_COLORS,
  PLAYER_HATS,
  sanitizePlayerName,
} from '../shared/constants';
import { EVENTS, LobbyData, LobbyPlayer } from '../shared/events';
import { GameRoom } from './game/GameRoom';

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

export class LobbyManager {
  private io: Server;
  private gameRooms: Map<string, GameRoom> = new Map();
  private lobbies: Map<string, Lobby> = new Map();
  private socketToLobby: Map<string, string> = new Map();
  private tickInterval: NodeJS.Timeout | null = null;

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

  public createLobby(socket: Socket, playerName: string, isPrivate: boolean = false): void {
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
      hatId: 'none',
      isHost: true,
      x: 0,
      z: 0,
      rotation: 0,
      isMoving: false,
    };

    lobby.players.set(socket.id, player);
    this.lobbies.set(code, lobby);
    this.socketToLobby.set(socket.id, code);

    socket.join(code);
    socket.emit(EVENTS.LOBBY_STATE, lobby.toJSON());
  }

  public joinLobby(socket: Socket, codeRaw: string, playerName: string): void {
    this.leaveLobby(socket);

    const code = (codeRaw || '').trim().toUpperCase();
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
      hatId: 'none',
      isHost: false,
      x: spawnX,
      z: spawnZ,
      rotation: 0,
      isMoving: false,
    };

    lobby.players.set(socket.id, player);
    this.socketToLobby.set(socket.id, code);

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
    s.impostorCount = Math.max(1, Math.min(3, Math.round(s.impostorCount || 1)));
    s.playerSpeed = Math.max(0.5, Math.min(3.0, Number(s.playerSpeed) || 1.0));
    s.crewmateVision = Math.max(0.25, Math.min(5.0, Number(s.crewmateVision) || 1.0));
    s.impostorVision = Math.max(0.25, Math.min(5.0, Number(s.impostorVision) || 1.5));
    s.killCooldown = Math.max(10, Math.min(60, Number(s.killCooldown) || 25));
    s.commonTasks = Math.max(0, Math.min(2, Math.round(s.commonTasks || 1)));
    s.shortTasks = Math.max(0, Math.min(5, Math.round(s.shortTasks || 2)));
    s.longTasks = Math.max(0, Math.min(3, Math.round(s.longTasks || 1)));
    s.emergencyMeetings = Math.max(0, Math.min(9, Math.round(s.emergencyMeetings || 1)));
    s.emergencyCooldown = Math.max(0, Math.min(60, Math.round(s.emergencyCooldown || 15)));
    s.discussionTime = Math.max(0, Math.min(120, Math.round(s.discussionTime || 15)));
    s.votingTime = Math.max(15, Math.min(300, Math.round(s.votingTime || 120)));
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

    const targetSocket = this.io.sockets.sockets.get(targetSocketId);
    if (targetSocket) {
      targetSocket.emit(EVENTS.LOBBY_ERROR, { message: 'You have been kicked from the lobby by the host.' });
      this.leaveLobby(targetSocket);
    }
  }

  public handleLobbyInput(
    socket: Socket,
    input: { x: number; z: number; rotation: number; isMoving: boolean }
  ): void {
    const lobby = this.getLobbyBySocket(socket);
    if (!lobby || lobby.state !== GAME_STATES.LOBBY) return;

    const player = lobby.players.get(socket.id);
    if (!player) return;

    // Bounds check for dropship room (-8 to 8 on X, -4 to 4 on Z)
    player.x = Math.max(-7.5, Math.min(7.5, input.x));
    player.z = Math.max(-3.5, Math.min(3.5, input.z));
    player.rotation = input.rotation || 0;
    player.isMoving = !!input.isMoving;
  }

  public startGame(socket: Socket, isTestMode: boolean = false): void {
    const lobby = this.getLobbyBySocket(socket);
    if (!lobby || lobby.state !== GAME_STATES.LOBBY) return;

    if (lobby.hostId !== socket.id) {
      socket.emit(EVENTS.LOBBY_ERROR, { message: 'Only the host can start the game.' });
      return;
    }

    // With bot fill on (default), any lobby can start: AI bots take the empty seats up to 4 players.
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

  public leaveLobby(socket: Socket): void {
    const code = this.socketToLobby.get(socket.id);
    if (!code) return;

    this.socketToLobby.delete(socket.id);
    socket.leave(code);

    const lobby = this.lobbies.get(code);
    if (!lobby) return;

    lobby.players.delete(socket.id);

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
      gameRoom.removePlayer(socket.id);
    }

    // Host migration
    if (lobby.players.size === 0) {
      if (lobby.countdownTimer) clearInterval(lobby.countdownTimer);
      if (gameRoom) {
        gameRoom.destroy();
        this.gameRooms.delete(code);
      }
      this.lobbies.delete(code);
      return;
    }

    if (lobby.hostId === socket.id) {
      // Pick the first remaining player as the new host
      const nextEntry = lobby.players.entries().next().value;
      if (nextEntry) {
        const [newHostId, newHostPlayer] = nextEntry;
        lobby.hostId = newHostId;
        newHostPlayer.isHost = true;
      }
    }

    this.broadcastLobbyState(lobby);
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
