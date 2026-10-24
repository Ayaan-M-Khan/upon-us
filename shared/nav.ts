/**
 * Impostor Protocol - Navigation (A* over the eroded floor grid)
 * Used by server-side bots. Returns world-space waypoints, string-pulled so bots
 * walk in straight lines where the floor allows it.
 */

import { GRID, cellToWorld, navWalkable, worldToCell } from './mapData';

type Pt = { x: number; z: number };

function nearestWalkable(x: number, z: number): { i: number; j: number } | null {
  const c = worldToCell(x, z);
  if (navWalkable(c.i, c.j)) return c;
  for (let r = 1; r < 8; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        if (navWalkable(c.i + di, c.j + dj)) return { i: c.i + di, j: c.j + dj };
      }
    }
  }
  return null;
}

/** True if a straight line between two points stays on safe (eroded) floor. */
export function hasClearLine(a: Pt, b: Pt): boolean {
  const dist = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(1, Math.ceil(dist / 0.4));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const c = worldToCell(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
    if (!navWalkable(c.i, c.j)) return false;
  }
  return true;
}

export function findPath(from: Pt, to: Pt): Pt[] {
  const start = nearestWalkable(from.x, from.z);
  const goal = nearestWalkable(to.x, to.z);
  if (!start || !goal) return [to];

  const idx = (i: number, j: number) => j * GRID.cols + i;
  const startIdx = idx(start.i, start.j);
  const goalIdx = idx(goal.i, goal.j);

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

  const h = (i: number, j: number) => Math.hypot(i - goal.i, j - goal.j);
  const dirs = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414],
  ];

  let found = false;
  while (heap.length) {
    const [, cur] = pop();
    if (closed.has(cur)) continue;
    if (cur === goalIdx) {
      found = true;
      break;
    }
    closed.add(cur);
    const ci = cur % GRID.cols;
    const cj = Math.floor(cur / GRID.cols);
    const cg = gScore.get(cur)!;
    for (const [di, dj, cost] of dirs) {
      const ni = ci + di;
      const nj = cj + dj;
      if (!navWalkable(ni, nj)) continue;
      // no cutting corners diagonally
      if (di !== 0 && dj !== 0 && (!navWalkable(ci + di, cj) || !navWalkable(ci, cj + dj))) continue;
      const nIdx = idx(ni, nj);
      const tentative = cg + cost;
      if (tentative < (gScore.get(nIdx) ?? Infinity)) {
        gScore.set(nIdx, tentative);
        cameFrom.set(nIdx, cur);
        push([tentative + h(ni, nj), nIdx]);
      }
    }
  }
  if (!found) return [to];

  const cells: Pt[] = [];
  let c = goalIdx;
  while (c !== startIdx) {
    cells.push(cellToWorld(c % GRID.cols, Math.floor(c / GRID.cols)));
    c = cameFrom.get(c)!;
  }
  cells.reverse();

  // String pulling
  const result: Pt[] = [];
  let anchor: Pt = from;
  let k = 0;
  while (k < cells.length) {
    let far = k;
    for (let m = cells.length - 1; m > k; m--) {
      if (hasClearLine(anchor, cells[m])) {
        far = m;
        break;
      }
    }
    result.push(cells[far]);
    anchor = cells[far];
    k = far + 1;
  }
  result.push(to);
  return result;
}
