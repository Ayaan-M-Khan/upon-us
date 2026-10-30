/**
 * Impostor Protocol - Shared Constants
 */

export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const JOIN_CODE_LENGTH = 5;

export const MAX_PLAYER_NAME_LENGTH = 10;
export const MIN_PLAYERS_TO_START = 4;
export const MAX_PLAYERS_PER_LOBBY = 10;
export const RECONNECT_GRACE_PERIOD_MS = 60000;

export interface PlayerColor {
  id: string;
  name: string;
  hex: string;
  shadowHex: string;
}

export const PLAYER_COLORS: PlayerColor[] = [
  { id: 'red', name: 'Red', hex: '#c51111', shadowHex: '#7a0838' },
  { id: 'blue', name: 'Blue', hex: '#132ed1', shadowHex: '#09158e' },
  { id: 'green', name: 'Green', hex: '#117f2d', shadowHex: '#0a4d1a' },
  { id: 'pink', name: 'Pink', hex: '#ed54ba', shadowHex: '#ab2ba0' },
  { id: 'orange', name: 'Orange', hex: '#ef7d0d', shadowHex: '#b33e15' },
  { id: 'yellow', name: 'Yellow', hex: '#f5f557', shadowHex: '#c2870e' },
  { id: 'black', name: 'Black', hex: '#3f474e', shadowHex: '#1e1f26' },
  { id: 'white', name: 'White', hex: '#d6e0f0', shadowHex: '#8394bf' },
  { id: 'purple', name: 'Purple', hex: '#6b2fbb', shadowHex: '#3b177c' },
  { id: 'brown', name: 'Brown', hex: '#71491e', shadowHex: '#522a0d' },
  { id: 'cyan', name: 'Cyan', hex: '#38fedc', shadowHex: '#24a8be' },
  { id: 'lime', name: 'Lime', hex: '#50ef39', shadowHex: '#15a725' },
];

export interface PlayerHat {
  id: string;
  name: string;
}

export const PLAYER_HATS: PlayerHat[] = [
  { id: 'none', name: 'No Hat' },
  { id: 'crown', name: 'Crown' },
  { id: 'halo', name: 'Angel Halo' },
  { id: 'tophat', name: 'Top Hat' },
  { id: 'beanie', name: 'Beanie' },
  { id: 'horns', name: 'Demon Horns' },
  { id: 'goggles', name: 'Goggles' },
  { id: 'antenna', name: 'Antenna' },
  { id: 'chef', name: 'Chef Toque' },
  { id: 'cowboy', name: 'Cowboy Hat' },
  { id: 'party', name: 'Party Hat' },
  { id: 'ninja', name: 'Ninja Headband' },
  { id: 'flower', name: 'Sprout Flower' },
  { id: 'egg', name: 'Fried Egg' },
];

export type KillDistance = 'Short' | 'Medium' | 'Long';
export type TaskBarUpdateMode = 'Always' | 'Meetings' | 'Never';

export interface GameSettings {
  impostorCount: number; // 1-3
  playerSpeed: number; // 0.5x - 3x (1.0 default)
  crewmateVision: number; // 0.25x - 5x (1.0 default)
  impostorVision: number; // 0.25x - 5x (1.5 default)
  killCooldown: number; // 10s - 60s (25s default)
  killDistance: KillDistance; // 'Short'
  commonTasks: number; // 0-2 (1 default)
  shortTasks: number; // 0-5 (2 default)
  longTasks: number; // 0-3 (1 default)
  emergencyMeetings: number; // 0-9 (1 default)
  emergencyCooldown: number; // 0-60s (15s default)
  discussionTime: number; // 0-120s (15s default)
  votingTime: number; // 15-300s (120s default)
  confirmEjects: boolean; // default false
  anonymousVotes: boolean; // default false
  taskBarUpdates: TaskBarUpdateMode; // 'Always'
  visualTasks: boolean; // default true
  map: string; // 'The Skeld'
  fillWithBots: boolean; // fill empty seats with AI bots so a game can start with fewer than 4 players
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  impostorCount: 1,
  playerSpeed: 1.0,
  crewmateVision: 1.0,
  impostorVision: 1.5,
  killCooldown: 25,
  killDistance: 'Short',
  commonTasks: 1,
  shortTasks: 2,
  longTasks: 1,
  emergencyMeetings: 1,
  emergencyCooldown: 15,
  discussionTime: 15,
  votingTime: 120,
  confirmEjects: false,
  anonymousVotes: false,
  taskBarUpdates: 'Always',
  visualTasks: true,
  map: 'The Skeld',
  fillWithBots: true,
};

// ---- Gameplay tuning (shared by client prediction and server validation) ----
export const BASE_PLAYER_SPEED = 4.8; // metres / second at 1.0x
export const KILL_DISTANCE_M: Record<KillDistance, number> = { Short: 2.2, Medium: 3.2, Long: 4.2 };
export const REPORT_RANGE = 4.5;
export const TASK_RANGE = 2.4;
export const VENT_RANGE = 2.4;
export const INITIAL_KILL_COOLDOWN_MS = 10000;
export const MEETING_INTRO_MS = 2500;
export const MEETING_RESULTS_MS = 5000;
export const MEETING_EJECTION_MS = 6000;
export const ROLE_REVEAL_MS = 5000;
export const GAME_OVER_MS = 9000;
export const MAX_CHAT_LENGTH = 100;

export const BOT_NAMES = ['Beep', 'Boop', 'Nova', 'Orbit', 'Comet', 'Pixel', 'Zap', 'Echo', 'Luna', 'Sparky'];

export const GAME_STATES = {
  LOBBY: 'LOBBY',
  STARTING: 'STARTING',
  ROLE_REVEAL: 'ROLE_REVEAL',
  PLAYING: 'PLAYING',
  MEETING: 'MEETING',
  GAME_OVER: 'GAME_OVER',
} as const;

export type GameState = (typeof GAME_STATES)[keyof typeof GAME_STATES];

export const MEETING_SUBSTATES = {
  INTRO: 'MEETING_INTRO',
  DISCUSSION: 'DISCUSSION',
  VOTING: 'VOTING',
  VOTE_RESULTS: 'VOTE_RESULTS',
  EJECTION: 'EJECTION',
} as const;

export type MeetingSubstate = (typeof MEETING_SUBSTATES)[keyof typeof MEETING_SUBSTATES];

// Basic profanity check
const BANNED_WORDS = ['fuck', 'shit', 'bitch', 'asshole', 'nigger', 'faggot', 'cunt', 'dick'];

export function sanitizePlayerName(name: string): string {
  let cleaned = name.trim().slice(0, MAX_PLAYER_NAME_LENGTH);
  if (!cleaned) cleaned = 'Crewmate';
  const lower = cleaned.toLowerCase();
  for (const bad of BANNED_WORDS) {
    if (lower.includes(bad)) {
      cleaned = 'Astronaut';
      break;
    }
  }
  return cleaned;
}
