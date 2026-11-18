/**
 * Impostor Protocol - Client Network Manager
 * Socket.IO wrapper with typed events, reconnection, and state broadcasting.
 */

import { io, Socket } from 'socket.io-client';
import { GameSettings } from '../shared/constants';
import { ChatMessage, EVENTS, GameOverInfo, GameStateSnapshot, LobbyData, SabotageType } from '../shared/events';

type LobbyStateListener = (state: LobbyData | null) => void;
type ErrorListener = (message: string) => void;
type StartingListener = (countdown: number) => void;
type MovementListener = (players: Record<string, { x: number; z: number; rotation: number; isMoving: boolean }>) => void;
type GameStartedListener = (data: { map: string; settings: GameSettings }) => void;
type StateSnapshotListener = (snapshot: GameStateSnapshot) => void;
export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline';
type ConnectionStateListener = (state: ConnectionState) => void;
export type PlayerKilledListener = (data: { victimId: string; killerId?: string; x?: number; z?: number }) => void;

// Per-tab identity that survives a page refresh (sessionStorage), so a dropped player can reclaim their seat.
const SESSION_KEY = 'impostor_session_id';
const SEAT_KEY = 'impostor_seat_code';

function storageGet(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function storageSet(key: string, value: string | null): void {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode etc.): rejoin just won't survive a refresh */
  }
}
function newSessionId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

class NetworkManager {
  private socket: Socket | null = null;
  private lobbyStateListeners: Set<LobbyStateListener> = new Set();
  private errorListeners: Set<ErrorListener> = new Set();
  private startingListeners: Set<StartingListener> = new Set();
  private movementListeners: Set<MovementListener> = new Set();
  private gameStartedListeners: Set<GameStartedListener> = new Set();
  private snapshotListeners: Set<StateSnapshotListener> = new Set();
  private playerKilledListeners: Set<PlayerKilledListener> = new Set();
  private chatListeners: Set<(m: ChatMessage) => void> = new Set();
  private gameOverListeners: Set<(g: GameOverInfo) => void> = new Set();
  private currentLobby: LobbyData | null = null;
  private connectionState: ConnectionState = 'connecting';
  private connectionStateListeners: Set<ConnectionStateListener> = new Set();
  private hasConnected = false;
  private sessionId: string = storageGet(SESSION_KEY) || '';
  /** Lobby code we hold a seat in; used to rejoin after a reconnect or refresh. */
  private seatCode: string | null = storageGet(SEAT_KEY);
  private rejoinPending = false;
  private rejoinRetries = 0;
  private exitMessage: string | null = null;

  private ensureSessionId(): string {
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(this.sessionId)) {
      this.sessionId = newSessionId();
      storageSet(SESSION_KEY, this.sessionId);
    }
    return this.sessionId;
  }

  private setSeat(code: string | null): void {
    this.seatCode = code;
    storageSet(SEAT_KEY, code);
  }

  /** Drop out of the lobby locally (server already released us) and tell listeners why. */
  private dropLobby(message: string | null): void {
    this.setSeat(null);
    this.rejoinPending = false;
    this.currentLobby = null;
    this.exitMessage = message;
    this.lobbyStateListeners.forEach((cb) => cb(null));
    if (message) this.errorListeners.forEach((cb) => cb(message));
  }

  /** True while we are waiting for the server to hand our held seat back (after a refresh or blip). */
  public isRejoining(): boolean {
    return this.rejoinPending;
  }

  /** One-shot message explaining why we were dropped back to the menu (kick, seat expired). */
  public consumeExitMessage(): string | null {
    const m = this.exitMessage;
    this.exitMessage = null;
    return m;
  }

  public init(): void {
    if (this.socket) return;

    // Connect to same origin
    this.socket = io({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      this.hasConnected = true;
      console.log('[Net] Connected to server, socketId:', this.socket?.id);
      // We held a seat before this connection (refresh or network blip): ask for it back.
      if (this.seatCode) {
        this.rejoinPending = true;
        this.socket?.emit(EVENTS.REJOIN, { sessionId: this.ensureSessionId() });
      }
      this.setConnectionState('connected');
    });

    this.socket.on(EVENTS.REJOIN_FAILED, (data: { message?: string; retry?: boolean }) => {
      // Right after a refresh the server may not have noticed the old socket closing yet: try again shortly.
      if (data?.retry && this.rejoinRetries < 4 && this.seatCode) {
        this.rejoinRetries++;
        window.setTimeout(() => {
          if (this.socket?.connected && this.seatCode) {
            this.socket.emit(EVENTS.REJOIN, { sessionId: this.ensureSessionId() });
          }
        }, 1000);
        return;
      }
      this.rejoinRetries = 0;
      // Seat is gone (or open in another tab): start a fresh identity so we can't collide again.
      this.sessionId = '';
      this.ensureSessionId();
      this.dropLobby(data?.message || 'Your previous seat could not be restored.');
    });

    this.socket.on(EVENTS.REMOVED_FROM_LOBBY, (data: { message?: string }) => {
      this.dropLobby(data?.message || 'You were removed from the lobby.');
    });

    this.socket.on('connect_error', () => {
      this.setConnectionState(this.socket?.active ? (this.hasConnected ? 'reconnecting' : 'connecting') : 'offline');
    });
    this.socket.io.on('reconnect_attempt', () => {
      this.setConnectionState(this.hasConnected ? 'reconnecting' : 'connecting');
    });
    this.socket.io.on('reconnect_failed', () => this.setConnectionState('offline'));

    this.socket.on(EVENTS.LOBBY_STATE, (data: LobbyData) => {
      this.currentLobby = data;
      this.rejoinPending = false;
      this.rejoinRetries = 0;
      if (data?.code) this.setSeat(data.code);
      this.lobbyStateListeners.forEach((cb) => cb(data));
    });

    this.socket.on(EVENTS.LOBBY_ERROR, (data: { message: string }) => {
      this.errorListeners.forEach((cb) => cb(data.message));
    });

    this.socket.on(EVENTS.GAME_STARTING, (data: { countdown: number }) => {
      this.startingListeners.forEach((cb) => cb(data.countdown));
    });

    this.socket.on(EVENTS.GAME_STARTED, (data: { map: string; settings: GameSettings }) => {
      this.gameStartedListeners.forEach((cb) => cb(data));
    });

    this.socket.on(EVENTS.STATE_SNAPSHOT, (data: GameStateSnapshot) => {
      this.snapshotListeners.forEach((cb) => cb(data));
    });

    this.socket.on(
      EVENTS.LOBBY_MOVEMENT_SYNC,
      (data: { players: Record<string, { x: number; z: number; rotation: number; isMoving: boolean }> }) => {
        this.movementListeners.forEach((cb) => cb(data.players));
      }
    );

    this.socket.on(EVENTS.CHAT_BROADCAST, (m: ChatMessage) => this.chatListeners.forEach((cb) => cb(m)));
    this.socket.on(EVENTS.GAME_OVER, (g: GameOverInfo) => this.gameOverListeners.forEach((cb) => cb(g)));
    this.socket.on(EVENTS.PLAYER_KILLED, (data: { victimId: string; killerId?: string; x?: number; z?: number }) => {
      this.playerKilledListeners.forEach((cb) => cb(data));
    });

    this.socket.on('disconnect', (reason) => {
      // The server holds our seat for a grace period; keep the current view and rejoin on reconnect.
      console.log('[Net] Disconnected from server:', reason);
      if (reason === 'io server disconnect') this.socket?.connect(); // server-side drops don't auto-retry
      this.setConnectionState(this.socket?.active ? 'reconnecting' : 'offline');
    });
  }

  private setConnectionState(state: ConnectionState): void {
    if (state === this.connectionState) return;
    this.connectionState = state;
    this.connectionStateListeners.forEach((cb) => cb(state));
  }

  public getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  public onConnectionState(cb: ConnectionStateListener): () => void {
    this.connectionStateListeners.add(cb);
    cb(this.connectionState);
    return () => this.connectionStateListeners.delete(cb);
  }

  public retryConnection(): void {
    if (this.socket?.connected) {
      this.setConnectionState('connected');
      return;
    }
    if (!this.socket) {
      this.init();
      return;
    }
    this.setConnectionState(this.hasConnected ? 'reconnecting' : 'connecting');
    this.socket.connect();
  }

  public getSocketId(): string | undefined {
    return this.socket?.id;
  }

  public getCurrentLobby(): LobbyData | null {
    return this.currentLobby;
  }

  public createLobby(playerName: string, isPrivate: boolean = false, hatId?: string): void {
    this.socket?.emit(EVENTS.CREATE_LOBBY, { playerName, isPrivate, hatId, sessionId: this.ensureSessionId() });
  }

  public joinLobby(code: string, playerName: string, hatId?: string): void {
    this.socket?.emit(EVENTS.JOIN_LOBBY, { code, playerName, hatId, sessionId: this.ensureSessionId() });
  }

  public leaveLobby(): void {
    this.socket?.emit(EVENTS.LEAVE_LOBBY);
    this.dropLobby(null);
  }

  public setColor(colorId: string): void {
    this.socket?.emit(EVENTS.SET_COLOR, { colorId });
  }

  public setReady(ready: boolean): void {
    this.socket?.emit(EVENTS.SET_READY, { ready });
  }

  public setHat(hatId: string): void {
    this.socket?.emit(EVENTS.SET_HAT, { hatId });
  }

  public updateSettings(settings: Partial<GameSettings>): void {
    this.socket?.emit(EVENTS.UPDATE_SETTINGS, { settings });
  }

  public kickPlayer(targetSocketId: string): void {
    this.socket?.emit(EVENTS.KICK_PLAYER, { targetSocketId });
  }

  public startGame(): void {
    this.socket?.emit(EVENTS.START_GAME);
  }

  public startTestGame(): void {
    this.socket?.emit(EVENTS.START_TEST_GAME);
  }

  public sendLobbyInput(input: { x: number; z: number; rotation: number; isMoving: boolean }): void {
    this.socket?.emit(EVENTS.LOBBY_INPUT, input);
  }

  public sendPlayerInput(input: { seq: number; x: number; z: number; rotation: number; isMoving: boolean }): void {
    this.socket?.emit(EVENTS.PLAYER_INPUT, input);
  }

  // ---- In-game actions (the server validates every one of these) ----
  public useTask(taskId: string): void {
    this.socket?.emit(EVENTS.USE_TASK, { taskId });
  }
  public completeTaskStep(taskId: string): void {
    this.socket?.emit(EVENTS.COMPLETE_TASK_STEP, { taskId });
  }
  public cancelTask(): void {
    this.socket?.emit('cancelTask');
  }
  public kill(targetId: string): void {
    this.socket?.emit(EVENTS.KILL_ATTEMPT, { targetId });
  }
  public reportBody(bodyId: string): void {
    this.socket?.emit(EVENTS.REPORT_BODY, { bodyId });
  }
  public callEmergency(): void {
    this.socket?.emit(EVENTS.CALL_EMERGENCY);
  }
  public ventEnter(ventId: string): void {
    this.socket?.emit(EVENTS.VENT_ENTER, { ventId });
  }
  public ventMove(ventId: string): void {
    this.socket?.emit(EVENTS.VENT_MOVE, { ventId });
  }
  public ventExit(): void {
    this.socket?.emit(EVENTS.VENT_EXIT);
  }
  public castVote(targetId: string): void {
    this.socket?.emit(EVENTS.CAST_VOTE, { targetId });
  }
  public sendChat(text: string): void {
    this.socket?.emit(EVENTS.CHAT_MESSAGE, { text });
  }
  public sabotage(type: SabotageType, room?: string): void {
    this.socket?.emit(EVENTS.SABOTAGE, { type, room });
  }
  public fixSabotage(partId?: number, instant?: boolean): void {
    this.socket?.emit(EVENTS.FIX_SABOTAGE, { partId, instant });
  }

  public holdReactorScanner(partId: number, holding: boolean): void {
    this.socket?.emit(EVENTS.FIX_SABOTAGE, { partId, holding });
  }

  public onChat(cb: (m: ChatMessage) => void): () => void {
    this.chatListeners.add(cb);
    return () => this.chatListeners.delete(cb);
  }
  public onGameOver(cb: (g: GameOverInfo) => void): () => void {
    this.gameOverListeners.add(cb);
    return () => this.gameOverListeners.delete(cb);
  }

  public onGameStarted(cb: GameStartedListener): () => void {
    this.gameStartedListeners.add(cb);
    return () => this.gameStartedListeners.delete(cb);
  }

  public onSnapshot(cb: StateSnapshotListener): () => void {
    this.snapshotListeners.add(cb);
    return () => this.snapshotListeners.delete(cb);
  }

  public onLobbyState(cb: LobbyStateListener): () => void {
    this.lobbyStateListeners.add(cb);
    if (this.currentLobby) cb(this.currentLobby);
    return () => this.lobbyStateListeners.delete(cb);
  }

  public onError(cb: ErrorListener): () => void {
    this.errorListeners.add(cb);
    return () => this.errorListeners.delete(cb);
  }

  public onStarting(cb: StartingListener): () => void {
    this.startingListeners.add(cb);
    return () => this.startingListeners.delete(cb);
  }

  public onMovement(cb: MovementListener): () => void {
    this.movementListeners.add(cb);
    return () => this.movementListeners.delete(cb);
  }

  public onPlayerKilled(cb: PlayerKilledListener): () => void {
    this.playerKilledListeners.add(cb);
    return () => this.playerKilledListeners.delete(cb);
  }

  /** Close this manager's socket (dev hot-reload replaces the module; the old socket must not linger). */
  public shutdown(): void {
    this.socket?.removeAllListeners();
    this.socket?.io.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
  }
}

export const net = new NetworkManager();

// In dev, a hot update re-creates this module. Without this the old socket stays connected and keeps
// "owning" our seat, so the new socket's rejoin would be refused.
if (import.meta.hot) {
  import.meta.hot.dispose(() => net.shutdown());
}
