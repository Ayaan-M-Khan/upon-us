/**
 * Impostor Protocol - Navigation (A* over collision-checked floor cells)
 * Used by server-side bots. Returns world-space waypoints, string-pulled so bots
 * walk in straight lines where the floor allows it.
 */

import { GRID, WallSegment, cellToWorld, isFloorAt, worldToCell } from './mapData';
import { PLAYER_RADIUS, lineIntersectsWalls, resolveWallCollisions } from './physics';

type Pt = { x: number; z: number };

const clearance = PLAYER_RADIUS + 0.14;
const cellIndex = (i: number, j: number) => j * GRID.cols + i;
const walkable = new Uint8Array(GRID.cols * GRID.rows);
const edges = new Map<number, boolean>();

function isClear(x: number, z: number, radius = clearance): boolean {
  return isFloorAt(x, z) && !resolveWallCollisions(x, z, radius).collided;
}

for (let j = 0; j < GRID.rows; j++) {
  for (let i = 0; i < GRID.cols; i++) {
    const p = cellToWorld(i, j);
    if (isClear(p.x, p.z)) walkable[cellIndex(i, j)] = 1;
  }
}

function canTraverse(a: Pt, b: Pt, radius = clearance): boolean {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.2));
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    if (!isClear(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, radius)) return false;
  }
  return true;
}

export function findPath(from: Pt, to: Pt, range = 1.2, doors: WallSegment[] = []): Pt[] {
  const openDoorLine = (a: Pt, b: Pt) => !lineIntersectsWalls(a.x, a.z, b.x, b.z, doors).hit;
  const start = worldToCell(from.x, from.z);
  let startIdx = -1;
  let startDist = Infinity;
  for (let j = Math.max(0, start.j - 2); j <= Math.min(GRID.rows - 1, start.j + 2); j++) {
    for (let i = Math.max(0, start.i - 2); i <= Math.min(GRID.cols - 1, start.i + 2); i++) {
      const index = cellIndex(i, j);
      if (!walkable[index]) continue;
      const p = cellToWorld(i, j);
      const dist = Math.hypot(p.x - from.x, p.z - from.z);
      if (dist >= startDist || !openDoorLine(from, p) || !canTraverse(from, p, PLAYER_RADIUS)) continue;
      startIdx = index;
      startDist = dist;
    }
  }
  if (startIdx < 0) return [];

  const atGoal = (point: Pt) => Math.hypot(point.x - to.x, point.z - to.z) <= range
    && !lineIntersectsWalls(point.x, point.z, to.x, to.z).hit && openDoorLine(point, to);

  const gScore = new Map<number, number>([[startIdx, 0]]);
  const cameFrom = new Map<number, number>();
  const closed = new Set<number>();
  // Open list as a simple binary heap of [f, idx]
  const heap: [number, number][] = [[0, startIdx]];
  const push = (item: [number, number]) => {
    heap.push(item);
    let n = heap.length - 1;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (heap[p][0] <= heap[n][0]) break;
      [heap[p], heap[n]] = [heap[n], heap[p]];
      n = p;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let n = 0;
      for (;;) {
        const l = n * 2 + 1;
        const r = l + 1;
        let m = n;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === n) break;
        [heap[m], heap[n]] = [heap[n], heap[m]];
        n = m;
      }
    }
    return top;
  };

  const h = (p: Pt) => Math.max(0, Math.hypot(p.x - to.x, p.z - to.z) - range);
  const dirs = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414],
  ];

  let goalIdx = -1;
  while (heap.length) {
    const [, cur] = pop();
    if (closed.has(cur)) continue;
    const ci = cur % GRID.cols;
    const cj = Math.floor(cur / GRID.cols);
    const current = cellToWorld(ci, cj);
    if (atGoal(current)) {
      goalIdx = cur;
      break;
    }
    closed.add(cur);
    const cg = gScore.get(cur)!;
    for (const [di, dj, cost] of dirs) {
      const ni = ci + di;
      const nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= GRID.cols || nj >= GRID.rows) continue;
      const nIdx = cellIndex(ni, nj);
      if (!walkable[nIdx] || closed.has(nIdx)) continue;
      const next = cellToWorld(ni, nj);
      const edge = Math.min(cur, nIdx) * walkable.length + Math.max(cur, nIdx);
      let passable = edges.get(edge);
      if (passable === undefined) {
        passable = canTraverse(current, next);
        edges.set(edge, passable);
      }
      if (!passable || !openDoorLine(current, next)) continue;
      const tentative = cg + cost;
      if (tentative < (gScore.get(nIdx) ?? Infinity)) {
        gScore.set(nIdx, tentative);
        cameFrom.set(nIdx, cur);
        push([tentative + h(next), nIdx]);
      }
    }
  }
  if (goalIdx < 0) return [];

  const cells: Pt[] = [];
  let c = goalIdx;
  while (c !== startIdx) {
    cells.push(cellToWorld(c % GRID.cols, Math.floor(c / GRID.cols)));
    c = cameFrom.get(c)!;
  }
  cells.push(cellToWorld(startIdx % GRID.cols, Math.floor(startIdx / GRID.cols)));
  cells.reverse();

  // String pulling
  const result: Pt[] = [];
  let anchor: Pt = from;
  let k = 0;
  while (k < cells.length) {
    let far = k;
    for (let m = cells.length - 1; m > k; m--) {
      if (openDoorLine(anchor, cells[m]) && canTraverse(anchor, cells[m])) {
        far = m;
        break;
      }
    }
    result.push(cells[far]);
    anchor = cells[far];
    k = far + 1;
  }
  return result;
}
