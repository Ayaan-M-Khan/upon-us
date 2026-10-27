/**
 * Impostor Protocol - Shared Socket Event Definitions and Payloads
 */

import { GameSettings, GameState, MeetingSubstate } from './constants';

export const EVENTS = {
  // Client -> Server
  CREATE_LOBBY: 'createLobby',
  JOIN_LOBBY: 'joinLobby',
  LEAVE_LOBBY: 'leaveLobby',
  UPDATE_SETTINGS: 'updateSettings',
  SET_COLOR: 'setColor',
  SET_HAT: 'setHat',
  KICK_PLAYER: 'kickPlayer',
  START_GAME: 'startGame',
  START_TEST_GAME: 'startTestGame', // Host can start in test mode with 1-3 players
  LOBBY_INPUT: 'lobbyInput',
  PLAYER_INPUT: 'playerInput',
  USE_TASK: 'useTask',
  COMPLETE_TASK_STEP: 'completeTaskStep',
  KILL_ATTEMPT: 'killAttempt',
  REPORT_BODY: 'reportBody',
  CALL_EMERGENCY: 'callEmergency',
  VENT_ENTER: 'ventEnter',
  VENT_MOVE: 'ventMove',
  VENT_EXIT: 'ventExit',
  SABOTAGE: 'sabotage',
  FIX_SABOTAGE: 'fixSabotage',
  CHAT_MESSAGE: 'chatMessage',
  CAST_VOTE: 'castVote',
  REJOIN: 'rejoin',
  RTC_SIGNAL: 'rtcSignal',
  VOICE_SPEAKING_UPDATE: 'voiceSpeakingUpdate',
  RTC_INIT_PEER: 'rtcInitPeer',

  // Server -> Client
  LOBBY_STATE: 'lobbyState',
  LOBBY_ERROR: 'lobbyError',
  LOBBY_MOVEMENT_SYNC: 'lobbyMovementSync',
  GAME_STARTING: 'gameStarting',
  GAME_STARTED: 'gameStarted',
  STATE_SNAPSHOT: 'stateSnapshot',
  PLAYER_KILLED: 'playerKilled',
  BODY_DISCOVERED: 'bodyDiscovered',
  BODY_LIST: 'bodyList',
  MEETING_STARTED: 'meetingStarted',
  CHAT_BROADCAST: 'chatBroadcast',
  VOTE_PROGRESS: 'voteProgress',
  VOTE_RESULTS: 'voteResults',
  EJECTION: 'ejection',
  TASK_PROGRESS: 'taskProgress',
  SABOTAGE_STARTED: 'sabotageStarted',
  SABOTAGE_UPDATED: 'sabotageUpdated',
  SABOTAGE_RESOLVED: 'sabotageResolved',
  GAME_OVER: 'gameOver',
  ERROR_MESSAGE: 'errorMessage',
  VOTE_CAST_ACK: 'voteCastAck',
} as const;

export type Role = 'crewmate' | 'impostor';

export interface LobbyPlayer {
  id: string; // Socket ID
  name: string;
  colorId: string;
  hatId: string;
  isHost: boolean;
  isReady?: boolean;
  x: number;
  z: number;
  rotation: number;
  isMoving: boolean;
  isAlive?: boolean;
  room?: string;
}

export interface LobbyData {
  code: string;
  hostId: string;
  isPrivate: boolean;
  players: LobbyPlayer[];
  settings: GameSettings;
  state: GameState;
  startingCountdown?: number;
}

export interface PlayerSnapshot {
  id: string;
  name: string;
  colorId: string;
  hatId: string;
  isHost: boolean;
  x: number;
  z: number;
  rotation: number;
  isMoving: boolean;
  isAlive: boolean;
  room: string;
  isBot?: boolean;
  /** Incremented whenever the server teleports a player (kill, meeting start). Clients snap when it changes. */
  posSeq?: number;
  inVent?: boolean;
}

export interface TaskView {
  taskId: string;
  name: string;
  type: 'common' | 'short' | 'long';
  step: number;
  totalSteps: number;
  done: boolean;
  room: string;
  x: number;
  z: number;
  hold: number; // seconds to hold USE
}

export interface BodyView {
  id: string;
  colorId: string;
  x: number;
  z: number;
  room?: string;
}

export interface PlayerKilledPayload {
  victimId: string;
  victimName: string;
  victimColorId: string;
  killerId: string;
  killerName?: string;
  x: number;
  z: number;
  room?: string;
  impulseX: number;
  impulseZ: number;
  timestamp: number;
}

export interface BodyDiscoveredPayload {
  bodyId: string;
  victimColorId: string;
  discovererId: string;
  discovererName: string;
  discovererColorId: string;
  room?: string;
  x: number;
  z: number;
  timestamp: number;
}

export interface MeetingResults {
  votes: { voterId: string; targetId: string }[]; // empty when anonymous votes are on
  tally: Record<string, number>; // targetId | 'skip' -> count
  outcome: 'ejected' | 'skip' | 'tie';
  ejectedId?: string;
  ejectedName?: string;
  ejectedColorId?: string;
  wasImpostor?: boolean; // only when confirmEjects is on
  impostorsRemaining?: number; // only when confirmEjects is on
}

export interface MeetingIncidentLogEntry {
  id: string;
  roundNumber: number;
  callerId: string;
  callerName: string;
  callerColorId: string;
  reason: 'body' | 'emergency';
  bodyColorId?: string;
  bodyRoom?: string;
  timestamp: number;
  timeFormatted: string;
  outcome?: 'ejected' | 'skip' | 'tie';
  ejectedName?: string;
  ejectedColorId?: string;
  wasImpostor?: boolean;
}

export interface MeetingView {
  phase: 'INTRO' | 'DISCUSSION' | 'VOTING' | 'RESULTS' | 'EJECTION';
  remainingMs: number;
  callerName: string;
  callerColorId?: string;
  reason: 'body' | 'emergency';
  bodyColorId?: string;
  bodyRoom?: string;
  voted: string[];
  results?: MeetingResults;
  history?: MeetingIncidentLogEntry[];
}

export interface YouView {
  role: Role;
  teammates: { id: string; name: string; colorId: string }[];
  tasks: TaskView[];
  killCooldownMs: number;
  emergencyLeft: number;
  emergencyCooldownMs: number;
  ventId: string | null;
  ventLinks: { id: string; x: number; z: number }[];
  sabotageCooldownMs?: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  name: string;
  colorId: string;
  text: string;
  ghost: boolean;
}

export type SabotageType = 'lights' | 'reactor' | 'o2' | 'doors';

export interface ActiveSabotageState {
  type: SabotageType;
  countdown: number; // For reactor/o2 (45s -> 0)
  targetRoom?: 'Cafeteria' | 'Storage'; // For doors
  doorsRemaining?: number; // For doors (10s -> 0)
  switches?: boolean[]; // 5 switches for electrical lights
  reactorPads?: { top: boolean; bottom: boolean }; // 2 pads for reactor
  o2Pads?: { o2: boolean; admin: boolean }; // 2 pads for o2
  activatedAt: number;
}

export interface SabotageTriggerPayload {
  type: SabotageType;
  room?: 'Cafeteria' | 'Storage';
}

export interface FixSabotagePayload {
  type: SabotageType;
  switchIndex?: number;
  pad?: 'top' | 'bottom' | 'o2' | 'admin';
}

export interface PlayerMatchStats {
  tasksCompleted: number;
  totalTasks: number;
  timesSabotaged: number;
  sabotagesFixed: number;
  killsCount: number;
  bodiesReported: number;
  emergenciesCalled: number;
  survived: boolean;
  eliminationReason?: 'alive' | 'killed' | 'ejected';
}

export interface GameOverPlayerSummary {
  id: string;
  name: string;
  colorId: string;
  role: Role;
  isBot: boolean;
  stats?: PlayerMatchStats;
}

export interface GameOverInfo {
  winner: 'crewmates' | 'impostors';
  reason: string;
  players: GameOverPlayerSummary[];
  matchDurationSecs?: number;
  totalTasksDone?: number;
  totalTasksAvailable?: number;
  totalSabotagesTriggered?: number;
  totalBodiesFound?: number;
}

export interface GameStateSnapshot {
  state: GameState;
  players: Record<string, PlayerSnapshot>;
  timestamp: number;
  bodies?: BodyView[];
  meeting?: MeetingView;
  taskProgress?: number; // 0..1
  tasksCompleted?: number;
  totalTasks?: number;
  you?: YouView;
  winner?: 'crewmates' | 'impostors';
  sabotage?: ActiveSabotageState | null;
  lockedDoors?: ('Cafeteria' | 'Storage')[];
  meetingHistory?: MeetingIncidentLogEntry[];
}

export type ChatScope = 'team' | 'proximity' | 'impostor' | 'haunt';

export interface ChatMessagePayload {
  text: string;
  scope?: ChatScope;
}

export interface ChatBroadcastMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderColorId: string;
  senderHatId?: string;
  text: string;
  scope: ChatScope;
  timestamp: number;
  senderRoom?: string;
  senderX?: number;
  senderZ?: number;
  distance?: number;
}
