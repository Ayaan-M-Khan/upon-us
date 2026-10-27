/**
 * Impostor Protocol - Ship map (The Skeld-style layout)
 *
 * The map is described ONLY as floor rectangles (rooms + corridors).
 * Wall segments for collision, rendering and line-of-sight are generated from the
 * boundary of the floor area, so the 3D map, physics and bot navigation can never
 * disagree with each other. Doorways are simply the places where a corridor
 * rectangle meets a room rectangle.
 *
 * Coordinates are metres. +X is east (right on the minimap), -Z is north (top).
 *
 *   Upper Engine   Medbay         Cafeteria            Weapons
 *   Reactor        Security         Admin       O2          Navigation
 *   Lower Engine   Electrical   Storage      Comms   Shields
 */

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface WallSegment {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  height?: number;
}

export interface MapRoom {
  id: string;
  name: string;
  color: string;
  floorHex: string;
  labelPos: { x: number; z: number };
  /** Bounding box of the room (for labels, lights, quick checks). */
  bounds: Rect;
  /** The actual floor: rooms can be L-shaped / chamfered unions of rectangles. */
  rects: Rect[];
  /** Four task-station spots inside the room. */
  spots: { x: number; z: number }[];
}

export interface VentDefinition {
  id: string;
  room: string;
  x: number;
  z: number;
  connectedTo: string[];
}

export interface Corridor {
  id: string;
  name: string;
  bounds: Rect;
}

const rect = (minX: number, maxX: number, minZ: number, maxZ: number): Rect => ({ minX, maxX, minZ, maxZ });

const room = (
  id: string,
  name: string,
  color: string,
  floorHex: string,
  rects: Rect[],
  spots: [number, number][]
): MapRoom => {
  const bounds: Rect = {
    minX: Math.min(...rects.map((r) => r.minX)),
    maxX: Math.max(...rects.map((r) => r.maxX)),
    minZ: Math.min(...rects.map((r) => r.minZ)),
    maxZ: Math.max(...rects.map((r) => r.maxZ)),
  };
  return {
    id,
    name,
    color,
    floorHex,
    bounds,
    rects,
    spots: spots.map(([x, z]) => ({ x, z })),
    labelPos: { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 },
  };
};

// Layout (north is up). Chamfered rooms are unions of two overlapping rectangles.
//
//   Upper Engine   Medbay        CAFETERIA          Weapons
//   Reactor        Security       Admin     O2         Navigation
//   Lower Engine   Electrical    Storage     Comms   Shields
export const MAP_ROOMS_DETAIL: MapRoom[] = [
  room('cafeteria', 'Cafeteria', '#38bdf8', '#1e293b',
    [rect(-12, 12, -21, -15), rect(-9, 9, -25, -11)],
    [[-7, -23], [7, -23], [-7, -13], [7, -13]]),
  room('upper_engine', 'Upper Engine', '#a855f7', '#2e1065',
    [rect(-44, -30, -24, -16), rect(-42, -32, -26, -14)],
    [[-41, -23], [-33, -23], [-42, -18], [-33, -18]]),
  room('medbay', 'Medbay', '#06b6d4', '#134e4a',
    [rect(-27, -17, -13, -7)],
    [[-25.5, -11], [-18.5, -11], [-25.5, -8.5], [-22.5, -8.5]]),
  room('reactor', 'Reactor', '#ef4444', '#450a0a',
    [rect(-46, -34, -8, 8), rect(-44, -36, -10, 10)],
    [[-43, -6], [-37, -6], [-43, 6], [-37, 6]]),
  room('security', 'Security', '#6366f1', '#1e1b4b',
    [rect(-30, -23, -5, 3)],
    [[-28, -3], [-25, -3], [-28, 1], [-25, 1]]),
  room('lower_engine', 'Lower Engine', '#a855f7', '#2e1065',
    [rect(-44, -30, 16, 24), rect(-42, -32, 14, 26)],
    [[-41, 18], [-33, 18], [-41, 23], [-35, 23]]),
  room('electrical', 'Electrical', '#eab308', '#422006',
    [rect(-26, -12, 12, 22)],
    [[-24, 14], [-14, 14], [-22, 20], [-16, 20]]),
  room('storage', 'Storage', '#f97316', '#431407',
    [rect(-8, 10, 14, 26)],
    [[-6, 16], [8, 16], [-5, 24], [5, 24]]),
  room('admin', 'Admin', '#10b981', '#064e3b',
    [rect(8, 18, -4, 6)],
    [[10, -2], [16, -2], [10, 4], [16, 4]]),
  room('communications', 'Communications', '#14b8a6', '#042f2e',
    [rect(16, 26, 20, 28)],
    [[18, 22], [24, 22], [18, 26], [24, 26]]),
  room('shields', 'Shields', '#3b82f6', '#172554',
    [rect(30, 42, 12, 28)],
    [[33, 14], [39, 14], [34, 26.5], [39, 25]]),
  room('navigation', 'Navigation', '#ec4899', '#500724',
    [rect(44, 52, -12, 4)],
    [[47, -11], [50.5, -11], [46, -2], [50.5, -2]]),
  room('o2', 'O2', '#22c55e', '#14532d',
    [rect(20, 28, -12, -6)],
    [[21.5, -10.5], [26.5, -10.5], [21.5, -7.5], [26.5, -7.5]]),
  room('weapons', 'Weapons', '#fb923c', '#3b0764',
    [rect(30, 42, -26, -14)],
    [[33, -24], [40, -24], [40, -16], [36, -20]]),
];

export const MAP_CORRIDORS: Corridor[] = [
  { id: 'hall_west', name: 'West Hallway', bounds: rect(-30, -12, -20, -16) },
  { id: 'hall_medbay', name: 'Medbay Hallway', bounds: rect(-23, -19, -16, -13) },
  { id: 'hall_upper_reactor', name: 'Reactor Hallway (North)', bounds: rect(-41, -37, -14, -10) },
  { id: 'hall_lower_reactor', name: 'Reactor Hallway (South)', bounds: rect(-41, -37, 10, 14) },
  { id: 'hall_reactor_security', name: 'Security Hallway', bounds: rect(-34, -30, -3, 1) },
  { id: 'hall_security_spine', name: 'Security Link', bounds: rect(-23, -21, -3, 1) },
  { id: 'hall_west_spine', name: 'West Corridor', bounds: rect(-21, -17, -7, 12) },
  { id: 'hall_lower_electrical', name: 'Engine Hallway', bounds: rect(-30, -26, 17, 21) },
  { id: 'hall_electrical_storage', name: 'Electrical Hallway', bounds: rect(-12, -8, 17, 21) },
  { id: 'hall_central', name: 'Main Corridor', bounds: rect(-2, 2, -11, 14) },
  { id: 'hall_admin', name: 'Admin Hallway', bounds: rect(2, 8, -1, 3) },
  { id: 'hall_east', name: 'East Hallway', bounds: rect(12, 30, -20, -16) },
  { id: 'hall_o2', name: 'O2 Hallway', bounds: rect(22, 26, -16, -12) },
  { id: 'hall_o2_nav', name: 'Navigation Hallway', bounds: rect(28, 46, -10, -6) },
  { id: 'hall_weapons', name: 'Weapons Hallway', bounds: rect(34, 38, -14, -10) },
  { id: 'hall_nav_south', name: 'East Corridor', bounds: rect(46, 50, 4, 20) },
  { id: 'hall_shields_east', name: 'Shields Hallway', bounds: rect(42, 46, 16, 20) },
  { id: 'hall_shields_comms', name: 'Comms Hallway', bounds: rect(26, 30, 22, 26) },
  { id: 'hall_comms_storage', name: 'Storage Hallway', bounds: rect(10, 16, 22, 26) },
];

// ---------------------------------------------------------------------------
// Floor grid (1 m cells) -> walls, navigation mask
// ---------------------------------------------------------------------------

export const GRID = { minX: -60, minZ: -36, cols: 124, rows: 76 } as const;
export const MAP_BOUNDS = { minX: -52, maxX: 56, minZ: -30, maxZ: 30 };

const floorGrid = new Uint8Array(GRID.cols * GRID.rows);

function fillRect(r: Rect): void {
  for (let j = r.minZ - GRID.minZ; j < r.maxZ - GRID.minZ; j++) {
    for (let i = r.minX - GRID.minX; i < r.maxX - GRID.minX; i++) {
      floorGrid[j * GRID.cols + i] = 1;
    }
  }
}
MAP_ROOMS_DETAIL.forEach((r) => r.rects.forEach(fillRect));
MAP_CORRIDORS.forEach((c) => fillRect(c.bounds));

const cellFloor = (i: number, j: number): boolean =>
  i >= 0 && j >= 0 && i < GRID.cols && j < GRID.rows && floorGrid[j * GRID.cols + i] === 1;

export function isFloorAt(x: number, z: number): boolean {
  return cellFloor(Math.floor(x - GRID.minX), Math.floor(z - GRID.minZ));
}

function buildWalls(): WallSegment[] {
  const walls: WallSegment[] = [];

  // Horizontal boundaries (between row j-1 and row j)
  for (let j = 0; j <= GRID.rows; j++) {
    let runStart = -1;
    for (let i = 0; i <= GRID.cols; i++) {
      const edge = i < GRID.cols && cellFloor(i, j - 1) !== cellFloor(i, j);
      if (edge && runStart < 0) runStart = i;
      if (!edge && runStart >= 0) {
        const z = GRID.minZ + j;
        walls.push({ x1: GRID.minX + runStart, z1: z, x2: GRID.minX + i, z2: z });
        runStart = -1;
      }
    }
  }

  // Vertical boundaries (between column i-1 and column i)
  for (let i = 0; i <= GRID.cols; i++) {
    let runStart = -1;
    for (let j = 0; j <= GRID.rows; j++) {
      const edge = j < GRID.rows && cellFloor(i - 1, j) !== cellFloor(i, j);
      if (edge && runStart < 0) runStart = j;
      if (!edge && runStart >= 0) {
        const x = GRID.minX + i;
        walls.push({ x1: x, z1: GRID.minZ + runStart, x2: x, z2: GRID.minZ + j });
        runStart = -1;
      }
    }
  }
  return walls;
}

export const MAP_WALLS: WallSegment[] = buildWalls();

/** Cells whose full 3x3 neighbourhood is floor: safe centres for bots to path through. */
const navGrid = new Uint8Array(GRID.cols * GRID.rows);
for (let j = 0; j < GRID.rows; j++) {
  for (let i = 0; i < GRID.cols; i++) {
    let ok = true;
    for (let dj = -1; dj <= 1 && ok; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!cellFloor(i + di, j + dj)) {
          ok = false;
          break;
        }
      }
    }
    navGrid[j * GRID.cols + i] = ok ? 1 : 0;
  }
}

export const navWalkable = (i: number, j: number): boolean =>
  i >= 0 && j >= 0 && i < GRID.cols && j < GRID.rows && navGrid[j * GRID.cols + i] === 1;

export const worldToCell = (x: number, z: number) => ({
  i: Math.floor(x - GRID.minX),
  j: Math.floor(z - GRID.minZ),
});
export const cellToWorld = (i: number, j: number) => ({ x: GRID.minX + i + 0.5, z: GRID.minZ + j + 0.5 });

// ---------------------------------------------------------------------------
// Cafeteria / meeting
// ---------------------------------------------------------------------------

export const CAFETERIA_TABLE_CENTER = { x: 0, z: -18 };
export const SPAWN_RADIUS = 4;
export const EMERGENCY_BUTTON_POS = { x: 0, z: -18 };
export const EMERGENCY_BUTTON_RANGE = 3.2;

export function getSpawnPosition(playerIndex: number, totalPlayers: number = 10): { x: number; z: number } {
  const angle = (playerIndex / Math.max(totalPlayers, 1)) * Math.PI * 2;
  return {
    x: CAFETERIA_TABLE_CENTER.x + Math.sin(angle) * SPAWN_RADIUS,
    z: CAFETERIA_TABLE_CENTER.z + Math.cos(angle) * SPAWN_RADIUS,
  };
}

// ---------------------------------------------------------------------------
// Vents (impostors only). Every vent connects to the others in its group.
// ---------------------------------------------------------------------------

const ventGroups: { room: string; x: number; z: number; id: string }[][] = [
  [
    { id: 'vent_reactor_n', room: 'Reactor', x: -43, z: -9 },
    { id: 'vent_upper_engine', room: 'Upper Engine', x: -40, z: -24.5 },
  ],
  [
    { id: 'vent_reactor_s', room: 'Reactor', x: -43, z: 8 },
    { id: 'vent_lower_engine', room: 'Lower Engine', x: -40, z: 24.5 },
  ],
  [
    { id: 'vent_medbay', room: 'Medbay', x: -20, z: -9.5 },
    { id: 'vent_security', room: 'Security', x: -26.5, z: -1 },
    { id: 'vent_electrical', room: 'Electrical', x: -24, z: 18 },
  ],
  [
    { id: 'vent_cafeteria', room: 'Cafeteria', x: 5, z: -24 },
    { id: 'vent_admin', room: 'Admin', x: 13, z: 1 },
  ],
  [
    { id: 'vent_weapons', room: 'Weapons', x: 40, z: -20 },
    { id: 'vent_nav_n', room: 'Navigation', x: 50.5, z: -8 },
  ],
  [
    { id: 'vent_shields', room: 'Shields', x: 40, z: 22 },
    { id: 'vent_nav_s', room: 'Navigation', x: 50.5, z: 0 },
  ],
];

export const MAP_VENTS: VentDefinition[] = ventGroups.flatMap((group) =>
  group.map((v) => ({ ...v, connectedTo: group.filter((o) => o.id !== v.id).map((o) => o.id) }))
);

// ---------------------------------------------------------------------------
// Task stations: four fixed spots in every room (see `spots` in the room table).
// Tasks refer to a (room, spot) pair.
// ---------------------------------------------------------------------------

export function getRoomSpot(roomName: string, spot: number): { x: number; z: number } {
  const r = MAP_ROOMS_DETAIL.find((m) => m.name === roomName) || MAP_ROOMS_DETAIL[0];
  return r.spots[((spot % 4) + 4) % 4];
}

export function getRoomCenter(roomName: string): { x: number; z: number } {
  const r = MAP_ROOMS_DETAIL.find((m) => m.name === roomName) || MAP_ROOMS_DETAIL[0];
  return r.labelPos;
}

export function detectRoom(x: number, z: number): string {
  for (const r of MAP_ROOMS_DETAIL) {
    for (const b of r.rects) {
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return r.name;
    }
  }
  for (const c of MAP_CORRIDORS) {
    if (x >= c.bounds.minX && x <= c.bounds.maxX && z >= c.bounds.minZ && z <= c.bounds.maxZ) {
      return c.name;
    }
  }
  return 'Corridor';
}
