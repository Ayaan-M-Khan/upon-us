/**
 * Impostor Protocol - Task definitions
 * Each step happens at a fixed station (room + spot index, see getRoomSpot in shared/mapData).
 * Players press USE at the station and play a 2D mini-game on the client. `hold` is the minimum
 * plausible duration in seconds (bots spend this long "working"); the server validates distance and time.
 */

export type TaskKind = 'common' | 'short' | 'long';

export interface TaskStepDef {
  room: string;
  spot: number; // 0-3, see getRoomSpot
  hold: number; // seconds
}
export interface TaskDefinition {
  id: string;
  name: string;
  type: TaskKind;
  steps: TaskStepDef[];
}

const S = (room: string, spot: number, hold = 3): TaskStepDef => ({ room, spot, hold });

export const ALL_TASKS: TaskDefinition[] = [
  // Common (same for every crewmate)
  { id: 'fix_wiring', name: 'Fix Wiring', type: 'common', steps: [S('Admin', 3), S('Electrical', 1), S('Storage', 0)] },
  { id: 'swipe_card', name: 'Swipe Card', type: 'common', steps: [S('Admin', 0, 2)] },

  // Short
  { id: 'align_engine_upper', name: 'Align Engine Output (Upper)', type: 'short', steps: [S('Upper Engine', 3)] },
  { id: 'align_engine_lower', name: 'Align Engine Output (Lower)', type: 'short', steps: [S('Lower Engine', 1)] },
  { id: 'clean_o2', name: 'Clean O2 Filter', type: 'short', steps: [S('O2', 2)] },
  { id: 'prime_shields', name: 'Prime Shields', type: 'short', steps: [S('Shields', 1)] },
  { id: 'calibrate_distributor', name: 'Calibrate Distributor', type: 'short', steps: [S('Electrical', 3, 4)] },
  { id: 'divert_power', name: 'Divert Power', type: 'short', steps: [S('Electrical', 2, 2), S('Weapons', 1, 2)] },
  { id: 'unlock_manifolds', name: 'Unlock Manifolds', type: 'short', steps: [S('Reactor', 1)] },
  { id: 'chart_course', name: 'Chart Course', type: 'short', steps: [S('Navigation', 0)] },
  { id: 'stabilize_steering', name: 'Stabilize Steering', type: 'short', steps: [S('Navigation', 2)] },
  { id: 'scan_boarding', name: 'Submit Scan', type: 'short', steps: [S('Medbay', 2, 4)] },
  { id: 'clear_asteroids', name: 'Clear Asteroids', type: 'short', steps: [S('Weapons', 3, 4)] },

  // Long
  { id: 'fuel_engines', name: 'Fuel Engines', type: 'long', steps: [S('Storage', 1, 4), S('Upper Engine', 0, 4), S('Lower Engine', 3, 4)] },
  { id: 'empty_garbage', name: 'Empty Garbage', type: 'long', steps: [S('Cafeteria', 1, 4), S('Storage', 3, 4)] },
  { id: 'download_data', name: 'Download / Upload Data', type: 'long', steps: [S('Weapons', 0, 5), S('Admin', 1, 5)] },
  { id: 'start_reactor', name: 'Start Reactor', type: 'long', steps: [S('Reactor', 3, 6)] },
  { id: 'inspect_sample', name: 'Inspect Sample', type: 'long', steps: [S('Medbay', 0, 5), S('Medbay', 1, 5)] },
];

const DOWNLOAD_ROOMS: TaskStepDef[] = [
  S('Weapons', 0, 5),
  S('Cafeteria', 1, 5),
  S('Navigation', 0, 5),
  S('Electrical', 2, 5),
];

const WIRING_ROOMS: TaskStepDef[] = [
  S('Electrical', 1, 3),
  S('Storage', 0, 3),
  S('Admin', 3, 3),
  S('Navigation', 2, 3),
  S('Cafeteria', 2, 3),
];

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick common tasks once (shared by everyone), with randomized wiring steps if present. */
export function pickCommonTasks(count: number): TaskDefinition[] {
  const pool = ALL_TASKS.filter((t) => t.type === 'common');
  const picked = shuffle(pool).slice(0, count);
  return picked.map((task) => {
    if (task.id === 'fix_wiring') {
      const steps = shuffle(WIRING_ROOMS).slice(0, 3);
      return { ...task, steps };
    }
    return { ...task, steps: [...task.steps] };
  });
}

/** Pick a random short/long set per player, with randomized download stations. */
export function pickPersonalTasks(shortCount: number, longCount: number): TaskDefinition[] {
  const shorts = shuffle(ALL_TASKS.filter((t) => t.type === 'short')).slice(0, shortCount);
  const longs = shuffle(ALL_TASKS.filter((t) => t.type === 'long')).slice(0, longCount);
  return [...shorts, ...longs].map((task) => {
    if (task.id === 'download_data') {
      const source = DOWNLOAD_ROOMS[Math.floor(Math.random() * DOWNLOAD_ROOMS.length)];
      return {
        ...task,
        steps: [source, S('Admin', 1, 5)],
      };
    }
    return { ...task, steps: [...task.steps] };
  });
}
