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
  bounds: Rect;
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

const room = (id: string, name: string, color: string, floorHex: string, bounds: Rect): MapRoom => ({
  id,
  name,
  color,
  floorHex,
  bounds,
  labelPos: { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 },
});

export const MAP_ROOMS_DETAIL: MapRoom[] = [
  room('cafeteria', 'Cafeteria', '#38bdf8', '#1e293b', rect(-12, 12, -30, -14)),
  room('upper_engine', 'Upper Engine', '#a855f7', '#2e1065', rect(-48, -30, -32, -18)),
  room('medbay', 'Medbay', '#06b6d4', '#134e4a', rect(-24, -14, -20, -8)),
  room('reactor', 'Reactor', '#ef4444', '#450a0a', rect(-56, -42, -12, 6)),
  room('security', 'Security', '#6366f1', '#1e1b4b', rect(-30, -24, -6, 2)),
  room('lower_engine', 'Lower Engine', '#a855f7', '#2e1065', rect(-48, -30, 10, 24)),
  room('electrical', 'Electrical', '#eab308', '#422006', rect(-26, -14, 10, 22)),
  room('storage', 'Storage', '#f97316', '#431407', rect(-10, 8, 14, 32)),
  room('admin', 'Admin', '#10b981', '#064e3b', rect(8, 22, -6, 6)),
  room('communications', 'Communications', '#14b8a6', '#042f2e', rect(14, 26, 24, 34)),
  room('shields', 'Shields', '#3b82f6', '#172554', rect(30, 44, 12, 28)),
  room('navigation', 'Navigation', '#ec4899', '#500724', rect(46, 58, -14, 4)),
  room('o2', 'O2', '#22c55e', '#14532d', rect(20, 30, -20, -10)),
  room('weapons', 'Weapons', '#fb923c', '#3b0764', rect(30, 44, -32, -20)),
];

export const MAP_CORRIDORS: Corridor[] = [
  { id: 'hall_upper_cafeteria', name: 'Upper West Hallway', bounds: rect(-30, -12, -27, -23) },
  { id: 'hall_medbay', name: 'Medbay Hallway', bounds: rect(-20, -16, -23, -20) },
  { id: 'hall_upper_reactor', name: 'Reactor Hallway (North)', bounds: rect(-47, -43, -18, -12) },
  { id: 'hall_lower_reactor', name: 'Reactor Hallway (South)', bounds: rect(-47, -43, 6, 10) },
  { id: 'hall_reactor_security', name: 'Security Hallway', bounds: rect(-42, -30, -4, 0) },
  { id: 'hall_security_spine', name: 'Security Link', bounds: rect(-24, -20, -4, 0) },
  { id: 'hall_west_spine', name: 'West Corridor', bounds: rect(-20, -16, -8, 10) },
  { id: 'hall_lower_electrical', name: 'Engine Hallway', bounds: rect(-30, -26, 14, 18) },
  { id: 'hall_electrical_storage', name: 'Electrical Hallway', bounds: rect(-14, -10, 16, 20) },
  { id: 'hall_central', name: 'Main Corridor', bounds: rect(-2, 2, -14, 14) },
  { id: 'hall_admin', name: 'Admin Hallway', bounds: rect(2, 8, -2, 2) },
  { id: 'hall_east', name: 'East Hallway', bounds: rect(12, 30, -28, -24) },
  { id: 'hall_o2', name: 'O2 Hallway', bounds: rect(22, 26, -24, -20) },
  { id: 'hall_o2_nav', name: 'Navigation Hallway', bounds: rect(30, 46, -14, -10) },
  { id: 'hall_weapons', name: 'Weapons Hallway', bounds: rect(32, 36, -20, -14) },
  { id: 'hall_nav_south', name: 'East Corridor', bounds: rect(48, 52, 4, 18) },
  { id: 'hall_shields_east', name: 'Shields Hallway', bounds: rect(42, 48, 14, 18) },
  { id: 'hall_shields_comms', name: 'Comms Hallway', bounds: rect(26, 30, 24, 28) },
  { id: 'hall_comms_storage', name: 'Storage Hallway', bounds: rect(8, 14, 26, 30) },
];

// ---------------------------------------------------------------------------
// Floor grid (1 m cells) -> walls, navigation mask
// ---------------------------------------------------------------------------

export const GRID = { minX: -60, minZ: -36, cols: 124, rows: 76 } as const;
export const MAP_BOUNDS = { minX: -58, maxX: 60, minZ: -34, maxZ: 36 };

const floorGrid = new Uint8Array(GRID.cols * GRID.rows);

function fillRect(r: Rect): void {
  for (let j = r.minZ - GRID.minZ; j < r.maxZ - GRID.minZ; j++) {
    for (let i = r.minX - GRID.minX; i < r.maxX - GRID.minX; i++) {
      floorGrid[j * GRID.cols + i] = 1;
    }
  }
}
MAP_ROOMS_DETAIL.forEach((r) => fillRect(r.bounds));
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

export const CAFETERIA_TABLE_CENTER = { x: 0, z: -22 };
export const SPAWN_RADIUS = 4;
export const EMERGENCY_BUTTON_POS = { x: 0, z: -22 };
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
    { id: 'vent_reactor_n', room: 'Reactor', x: -54, z: -10 },
    { id: 'vent_upper_engine', room: 'Upper Engine', x: -46, z: -30 },
  ],
  [
    { id: 'vent_reactor_s', room: 'Reactor', x: -54, z: 4 },
    { id: 'vent_lower_engine', room: 'Lower Engine', x: -46, z: 22 },
  ],
  [
    { id: 'vent_medbay', room: 'Medbay', x: -22, z: -10 },
    { id: 'vent_security', room: 'Security', x: -28, z: 0 },
    { id: 'vent_electrical', room: 'Electrical', x: -24, z: 12 },
  ],
  [
    { id: 'vent_cafeteria', room: 'Cafeteria', x: 10, z: -28 },
    { id: 'vent_admin', room: 'Admin', x: 20, z: -4 },
  ],
  [
    { id: 'vent_weapons', room: 'Weapons', x: 42, z: -30 },
    { id: 'vent_nav_n', room: 'Navigation', x: 56, z: -12 },
  ],
  [
    { id: 'vent_shields', room: 'Shields', x: 42, z: 26 },
    { id: 'vent_nav_s', room: 'Navigation', x: 56, z: 2 },
  ],
];

export const MAP_VENTS: VentDefinition[] = ventGroups.flatMap((group) =>
  group.map((v) => ({ ...v, connectedTo: group.filter((o) => o.id !== v.id).map((o) => o.id) }))
);

// ---------------------------------------------------------------------------
// Task stations: four fixed spots in every room (inset from the corners).
// Tasks refer to a (room, spot) pair.
// ---------------------------------------------------------------------------

export function getRoomSpot(roomName: string, spot: number): { x: number; z: number } {
  const r = MAP_ROOMS_DETAIL.find((m) => m.name === roomName) || MAP_ROOMS_DETAIL[0];
  const b = r.bounds;
  const inset = Math.min(2, (b.maxX - b.minX) / 3, (b.maxZ - b.minZ) / 3);
  const spots = [
    { x: b.minX + inset, z: b.minZ + inset },
    { x: b.maxX - inset, z: b.minZ + inset },
    { x: b.minX + inset, z: b.maxZ - inset },
    { x: b.maxX - inset, z: b.maxZ - inset },
  ];
  return spots[((spot % 4) + 4) % 4];
}

export function getRoomCenter(roomName: string): { x: number; z: number } {
  const r = MAP_ROOMS_DETAIL.find((m) => m.name === roomName) || MAP_ROOMS_DETAIL[0];
  return { x: (r.bounds.minX + r.bounds.maxX) / 2, z: (r.bounds.minZ + r.bounds.maxZ) / 2 };
}

export function detectRoom(x: number, z: number): string {
  for (const r of MAP_ROOMS_DETAIL) {
    if (x >= r.bounds.minX && x <= r.bounds.maxX && z >= r.bounds.minZ && z <= r.bounds.maxZ) {
      return r.name;
    }
  }
  for (const c of MAP_CORRIDORS) {
    if (x >= c.bounds.minX && x <= c.bounds.maxX && z >= c.bounds.minZ && z <= c.bounds.maxZ) {
      return c.name;
    }
  }
  return 'Corridor';
}
