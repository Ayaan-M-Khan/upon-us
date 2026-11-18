/**
 * Map audit: every gameplay station (task spots, sabotage repair parts, vents, emergency button)
 * must sit on walkable floor in its intended room and be reachable from spawn within its use range.
 *
 *   npx tsx scripts/map-audit.ts
 */
import { REPORT_RANGE, TASK_RANGE, VENT_RANGE } from '../shared/constants';
import { EMERGENCY_BUTTON_POS, EMERGENCY_BUTTON_RANGE, MAP_ROOMS_DETAIL, MAP_VENTS, detectRoom, getSpawnPosition, isFloorAt } from '../shared/mapData';
import { findPath } from '../shared/nav';
import { PLAYER_RADIUS, lineIntersectsWalls, resolveMovementCollisions } from '../shared/physics';
import { SABOTAGE_LOCATIONS } from '../server/game/sabotage';
import { ALL_TASKS } from '../server/game/tasks';

type Pt = { x: number; z: number };
const spawn = getSpawnPosition(0, 4);
let problems = 0;

/** Can a player standing somewhere reachable get within `range` of `p` with line of sight? */
function audit(label: string, p: Pt, range: number, expectRoom?: string) {
  const issues: string[] = [];
  const room = detectRoom(p.x, p.z);
  if (expectRoom && room.toLowerCase() !== expectRoom.toLowerCase()) issues.push(`in "${room}", expected "${expectRoom}"`);
  const path = findPath(spawn, p, range - 0.25);
  const end = path.length ? path[path.length - 1] : spawn;
  const d = Math.hypot(end.x - p.x, end.z - p.z);
  if (!path.length && Math.hypot(spawn.x - p.x, spawn.z - p.z) > range) issues.push('no path from spawn');
  else if (d > range) issues.push(`path ends ${d.toFixed(2)} m away (range ${range})`);
  else if (lineIntersectsWalls(end.x, end.z, p.x, p.z).hit) issues.push('no line of sight from path end');
  // Simulate walking the path with the real collision code.
  let pos = { ...spawn };
  for (const wp of path) {
    for (let i = 0; i < 400 && Math.hypot(wp.x - pos.x, wp.z - pos.z) > 0.05; i++) {
      const dx = wp.x - pos.x, dz = wp.z - pos.z, dd = Math.hypot(dx, dz), st = Math.min(dd, 0.18);
      const r = resolveMovementCollisions(pos.x, pos.z, pos.x + (dx / dd) * st, pos.z + (dz / dd) * st, PLAYER_RADIUS);
      if (Math.hypot(r.x - pos.x, r.z - pos.z) < 0.001) break;
      pos = { x: r.x, z: r.z };
    }
  }
  const walked = Math.hypot(pos.x - p.x, pos.z - p.z);
  if (walked > range) issues.push(`walking the path gets stuck ${walked.toFixed(2)} m away`);
  if (issues.length) {
    problems++;
    console.log(`FAIL ${label} (${p.x}, ${p.z}) floor=${isFloorAt(p.x, p.z)}: ${issues.join('; ')}`);
  }
}

for (const r of MAP_ROOMS_DETAIL) r.spots.forEach((s, i) => audit(`task spot ${r.name}#${i}`, s, TASK_RANGE, r.name));
for (const t of ALL_TASKS) t.steps.forEach((s, i) => {
  if (!MAP_ROOMS_DETAIL.some((r) => r.name === s.room)) { problems++; console.log(`FAIL task ${t.id} step ${i}: unknown room ${s.room}`); }
});
const roomNames: Record<string, string> = { reactor: 'Reactor', o2: 'O2', admin: 'Admin', electrical: 'Electrical', communications: 'Communications' };
for (const [key, part] of Object.entries(SABOTAGE_LOCATIONS)) audit(`sabotage ${key}`, part, 3.8, roomNames[part.room]);
for (const v of MAP_VENTS) audit(`vent ${v.id}`, v, VENT_RANGE + 0.6, v.room);
audit('emergency button', EMERGENCY_BUTTON_POS, EMERGENCY_BUTTON_RANGE + 0.8, 'Cafeteria');
void REPORT_RANGE;
console.log(problems ? `\n${problems} problem(s)` : 'all stations reachable');
process.exit(problems ? 1 : 0);
