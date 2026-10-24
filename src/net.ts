/**
 * Impostor Protocol - Client Network Manager
 * Socket.IO wrapper with typed events, reconnection, and state broadcasting.
 */

import { io, Socket } from 'socket.io-client';
import { GameSettings } from '../shared/constants';
import { ChatMessage, EVENTS, GameOverInfo, GameStateSnapshot, LobbyData } from '../shared/events';

type LobbyStateListener = (state: LobbyData | null) => void;
type ErrorListener = (message: string) => void;
type StartingListener = (countdown: number) => void;
type MovementListener = (players: Record<string, { x: number; z: number; rotation: number; isMoving: boolean }>) => void;
type GameStartedListener = (data: { map: string; settings: GameSettings }) => void;
type StateSnapshotListener = (snapshot: GameStateSnapshot) => void;

class NetworkManager {
  private socket: Socket | null = null;
  private lobbyStateListeners: Set<LobbyStateListener> = new Set();
  private errorListeners: Set<ErrorListener> = new Set();
  private startingListeners: Set<StartingListener> = new Set();
  private movementListeners: Set<MovementListener> = new Set();
  private gameStartedListeners: Set<GameStartedListener> = new Set();
  private snapshotListeners: Set<StateSnapshotListener> = new Set();
  private chatListeners: Set<(m: ChatMessage) => void> = new Set();
  private gameOverListeners: Set<(g: GameOverInfo) => void> = new Set();
  private currentLobby: LobbyData | null = null;

  public init(): void {
    if (this.socket) return;

    // Connect to same origin
    this.socket = io({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log('[Net] Connected to server, socketId:', this.socket?.id);
    });

    this.socket.on(EVENTS.LOBBY_STATE, (data: LobbyData) => {
      this.currentLobby = data;
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

    this.socket.on('disconnect', () => {
      console.log('[Net] Disconnected from server');
    });
  }

  public getSocketId(): string | undefined {
    return this.socket?.id;
  }

  public getCurrentLobby(): LobbyData | null {
    return this.currentLobby;
  }

  public createLobby(playerName: string, isPrivate: boolean = false): void {
    this.socket?.emit(EVENTS.CREATE_LOBBY, { playerName, isPrivate });
  }

  public joinLobby(code: string, playerName: string): void {
    this.socket?.emit(EVENTS.JOIN_LOBBY, { code, playerName });
  }

  public leaveLobby(): void {
    this.socket?.emit(EVENTS.LEAVE_LOBBY);
    this.currentLobby = null;
    this.lobbyStateListeners.forEach((cb) => cb(null));
  }

  public setColor(colorId: string): void {
    this.socket?.emit(EVENTS.SET_COLOR, { colorId });
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
}

export const net = new NetworkManager();
