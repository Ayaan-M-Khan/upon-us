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
  room('cafeteria', 'Cafeteria', '#38bdf8', '#b0c4de',
    [rect(-12, 12, -21, -15), rect(-9, 9, -25, -11)],
    [[-7, -23], [7, -23], [-7, -13], [7, -13]]),
  room('upper_engine', 'Upper Engine', '#a855f7', '#25293e',
    [rect(-44, -30, -24, -16), rect(-42, -32, -26, -14)],
    [[-41, -23], [-33, -23], [-42, -18], [-33, -18]]),
  room('medbay', 'Medbay', '#06b6d4', '#14b8a6',
    [rect(-27, -17, -13, -7)],
    [[-25.5, -11], [-18.5, -11], [-25.5, -8.5], [-22.5, -8.5]]),
  room('reactor', 'Reactor', '#ef4444', '#3b0764',
    [rect(-46, -34, -8, 8), rect(-44, -36, -10, 10)],
    [[-43, -6], [-37, -6], [-43, 6], [-37, 6]]),
  room('security', 'Security', '#6366f1', '#1e1b4b',
    [rect(-30, -23, -5, 3)],
    [[-28, -3], [-25, -3], [-28, 1], [-25, 1]]),
  room('lower_engine', 'Lower Engine', '#a855f7', '#25293e',
    [rect(-44, -30, 16, 24), rect(-42, -32, 14, 26)],
    [[-41, 18], [-33, 18], [-41, 23], [-35, 23]]),
  room('electrical', 'Electrical', '#eab308', '#382f2d',
    [rect(-26, -12, 12, 22)],
    [[-24, 14], [-14, 14], [-22, 20], [-16, 20]]),
  room('storage', 'Storage', '#f97316', '#2d3748',
    [rect(-8, 10, 14, 26)],
    [[-6, 16], [8, 16], [-5, 24], [5, 24]]),
  room('admin', 'Admin', '#10b981', '#7f1d1d',
    [rect(8, 18, -4, 6)],
    [[10, -2], [16, -2], [10, 4], [16, 4]]),
  room('communications', 'Communications', '#14b8a6', '#0f766e',
    [rect(16, 26, 20, 28)],
    [[18, 22], [24, 22], [18, 26], [24, 26]]),
  room('shields', 'Shields', '#3b82f6', '#1e3a5f',
    [rect(30, 42, 12, 28)],
    [[33, 14], [39, 14], [34, 26.5], [39, 25]]),
  room('navigation', 'Navigation', '#ec4899', '#242a38',
    [rect(44, 52, -12, 4)],
    [[47, -11], [50.5, -11], [46, -2], [50.5, -2]]),
  room('o2', 'O2', '#22c55e', '#1e3a2b',
    [rect(20, 28, -12, -6)],
    [[21.5, -10.5], [26.5, -10.5], [21.5, -7.5], [26.5, -7.5]]),
  room('weapons', 'Weapons', '#fb923c', '#332742',
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

export interface MapObstacle {
  id: string;
  type: 'circle' | 'box';
  name: string;
  x: number;
  z: number;
  radius: number;
  minX?: number;
  maxX?: number;
  minZ?: number;
  maxZ?: number;
}

export const MAP_OBSTACLES: MapObstacle[] = [
  // Cafeteria Central Emergency Meeting Table & 4 Dining Tables
  { id: 'caf_emergency_table', type: 'circle', name: 'Emergency Table', x: 0, z: -18, radius: 2.75 },
  { id: 'caf_table_nw', type: 'circle', name: 'Cafeteria Table NW', x: -5.8, z: -22.5, radius: 2.0 },
  { id: 'caf_table_ne', type: 'circle', name: 'Cafeteria Table NE', x: 5.8, z: -22.5, radius: 2.0 },
  { id: 'caf_table_sw', type: 'circle', name: 'Cafeteria Table SW', x: -5.8, z: -13.5, radius: 2.0 },
  { id: 'caf_table_se', type: 'circle', name: 'Cafeteria Table SE', x: 5.8, z: -13.5, radius: 2.0 },
  { id: 'caf_food_counter', type: 'box', name: 'Food Counter', x: 0, z: -24.4, radius: 0, minX: -2.8, maxX: 2.8, minZ: -25.0, maxZ: -23.8 },

  // Admin Central Meeting Table
  { id: 'admin_table', type: 'box', name: 'Admin Table', x: 13, z: 1, radius: 0, minX: 10.8, maxX: 15.2, minZ: -0.3, maxZ: 2.3 },

  // Reactor Fusion Core & Dual Manifold Columns (Exact match with map3D)
  { id: 'reactor_core', type: 'circle', name: 'Reactor Core', x: -38.2, z: 0, radius: 2.35 },
  { id: 'reactor_manifold_n', type: 'circle', name: 'Reactor Manifold North', x: -41.5, z: -4.5, radius: 1.5 },
  { id: 'reactor_manifold_s', type: 'circle', name: 'Reactor Manifold South', x: -41.5, z: 4.5, radius: 1.5 },

  // Upper & Lower Engine Ion Thrusters (Aligned horizontal cylinders)
  { id: 'upper_engine_generator', type: 'box', name: 'Upper Engine Generator', x: -37, z: -20, radius: 0, minX: -39.3, maxX: -34.7, minZ: -21.7, maxZ: -18.3 },
  { id: 'lower_engine_generator', type: 'box', name: 'Lower Engine Generator', x: -37, z: 20, radius: 0, minX: -39.3, maxX: -34.7, minZ: 18.3, maxZ: 21.7 },

  // Medbay Examination Beds (Flush against East bulkhead, opening up 8m+ clear walkway)
  { id: 'medbay_beds', type: 'box', name: 'Medbay Beds', x: -18.2, z: -10, radius: 0, minX: -18.9, maxX: -17.3, minZ: -12.3, maxZ: -7.7 },

  // Security CCTV Monitoring Desk (Centered under monitor bank)
  { id: 'security_desk', type: 'box', name: 'Security Desk', x: -27.3, z: -3.2, radius: 0, minX: -28.9, maxX: -25.7, minZ: -3.8, maxZ: -2.6 },

  // Electrical Generator & Hallway Divider Wall
  { id: 'electrical_generator', type: 'box', name: 'Electrical Generator', x: -23.2, z: 14.5, radius: 0, minX: -24.2, maxX: -22.2, minZ: 13.5, maxZ: 15.5 },
  { id: 'electrical_divider', type: 'box', name: 'Electrical Divider Wall', x: -19.5, z: 17.5, radius: 0, minX: -19.7, maxX: -19.3, minZ: 14.7, maxZ: 20.3 },

  // Storage Cargo Crates & Fuel Tanks
  { id: 'storage_crates', type: 'box', name: 'Cargo Crates', x: 0.8, z: 20.0, radius: 0, minX: -2.2, maxX: 3.6, minZ: 18.2, maxZ: 21.6 },
  { id: 'storage_fuel_tanks', type: 'box', name: 'Storage Fuel Tanks', x: -5.0, z: 18.0, radius: 0, minX: -6.0, maxX: -3.6, minZ: 16.5, maxZ: 19.3 },

  // Shields Central Sunk Well
  { id: 'shields_core', type: 'circle', name: 'Shields Generator', x: 36, z: 20, radius: 2.0 },

  // Navigation Star Map Table & Bow Pilot Console
  { id: 'nav_star_table', type: 'circle', name: 'Navigation Table', x: 48, z: -4, radius: 1.6 },
  { id: 'nav_pilot_helm', type: 'box', name: 'Navigation Pilot Helm', x: 51.2, z: -4, radius: 0, minX: 50.6, maxX: 51.8, minZ: -6.1, maxZ: -1.9 },

  // Weapons Gunner Targeting Station
  { id: 'weapons_cockpit', type: 'circle', name: 'Weapons Station', x: 36, z: -20, radius: 1.1 },

  // O2 Scrubber Hydroponic Greenhouse Dome
  { id: 'o2_canister', type: 'circle', name: 'O2 Greenhouse Dome', x: 24, z: -9, radius: 1.4 },

  // Communications Server Racks & Telemetry Console Desk
  { id: 'comms_server_racks', type: 'box', name: 'Comms Server Racks', x: 17.8, z: 24, radius: 0, minX: 17.3, maxX: 18.3, minZ: 22.1, maxZ: 25.9 },
  { id: 'comms_desk', type: 'box', name: 'Communications Desk', x: 22.2, z: 24, radius: 0, minX: 21.0, maxX: 23.4, minZ: 23.4, maxZ: 24.6 },
];

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

export const SABOTAGE_REPAIR_POINTS: Record<string, { x: number; z: number }> = {
  reactor: { x: -40, z: 0 },
  o2: { x: 24, z: -9 },
  lights: { x: -20, z: 17 },
  comms: { x: 21, z: 24 },
};

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

// ---------------------------------------------------------------------------
// Security CCTV Surveillance Cameras (The Skeld 4 Corridor Feeds)
// ---------------------------------------------------------------------------

export interface SecurityCamera {
  id: string;
  name: string;
  sector: string;
  x: number;
  y: number;
  z: number;
  lookAt: { x: number; y: number; z: number };
  zone: Rect;
}

export const SECURITY_CAMERAS: SecurityCamera[] = [
  {
    id: 'cam_west',
    name: 'CAM 01',
    sector: 'West Corridor (Medbay / Cafeteria)',
    x: -21,
    y: 5.5,
    z: -14,
    lookAt: { x: -21, y: 0.8, z: -20 },
    zone: { minX: -26, maxX: -15, minZ: -22, maxZ: -13 },
  },
  {
    id: 'cam_east',
    name: 'CAM 02',
    sector: 'East Hallway (Admin / Cafeteria)',
    x: 18,
    y: 5.5,
    z: -16,
    lookAt: { x: 26, y: 0.8, z: -18 },
    zone: { minX: 12, maxX: 28, minZ: -22, maxZ: -14 },
  },
  {
    id: 'cam_shields',
    name: 'CAM 03',
    sector: 'Navigation / Shields Crossway',
    x: 48,
    y: 5.5,
    z: 6,
    lookAt: { x: 48, y: 0.8, z: 14 },
    zone: { minX: 42, maxX: 52, minZ: 4, maxZ: 18 },
  },
  {
    id: 'cam_reactor',
    name: 'CAM 04',
    sector: 'Reactor Spine (Engine Crossway)',
    x: -39,
    y: 5.5,
    z: 0,
    lookAt: { x: -39, y: 0.8, z: 6 },
    zone: { minX: -42, maxX: -36, minZ: -10, maxZ: 10 },
  },
];

export const SECURITY_DESK_POS = { x: -27.3, z: -3.2 };
export const SECURITY_DESK_RANGE = 3.2;

/**
 * Fast 2D segment-segment intersection test with tolerance epsilon
 */
function testSegmentIntersection(
  x1: number, z1: number, x2: number, z2: number,
  x3: number, z3: number, x4: number, z4: number
): boolean {
  const d = (x1 - x2) * (z3 - z4) - (z1 - z2) * (x3 - x4);
  if (Math.abs(d) < 1e-7) return false;
  const t = ((x1 - x3) * (z3 - z4) - (z1 - z3) * (x3 - x4)) / d;
  const u = -((x1 - x2) * (z1 - z3) - (z1 - z2) * (x1 - x3)) / d;
  return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98;
}

/**
 * Checks whether two points on the spaceship deck have unobstructed line of sight
 * (no intervening wall segments).
 */
export function hasLineOfSight(x1: number, z1: number, x2: number, z2: number, walls: WallSegment[] = MAP_WALLS): boolean {
  const minX = Math.min(x1, x2) - 0.1;
  const maxX = Math.max(x1, x2) + 0.1;
  const minZ = Math.min(z1, z2) - 0.1;
  const maxZ = Math.max(z1, z2) + 0.1;

  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    const wMinX = Math.min(w.x1, w.x2);
    const wMaxX = Math.max(w.x1, w.x2);
    const wMinZ = Math.min(w.z1, w.z2);
    const wMaxZ = Math.max(w.z1, w.z2);

    // Fast AABB rejection
    if (maxX < wMinX || minX > wMaxX || maxZ < wMinZ || minZ > wMaxZ) continue;

    if (testSegmentIntersection(x1, z1, x2, z2, w.x1, w.z1, w.x2, w.z2)) {
      return false; // sightline blocked by a spaceship bulkhead wall
    }
  }
  return true;
}
