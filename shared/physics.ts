/**
 * Impostor Protocol - Shared Physics & Wall Collision
 * Circle vs Line Segment collision detection with smooth sliding and zero corner snagging.
 */

import { MAP_WALLS, WallSegment } from './mapData';

export const PLAYER_RADIUS = 0.45; // meters

export function closestPointOnSegment(
  px: number,
  pz: number,
  x1: number,
  z1: number,
  x2: number,
  z2: number
): { x: number; z: number } {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lenSq = dx * dx + dz * dz;

  if (lenSq === 0) return { x: x1, z: z1 };

  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / lenSq));
  return {
    x: x1 + t * dx,
    z: z1 + t * dz,
  };
}

export function resolveWallCollisions(
  px: number,
  pz: number,
  radius: number = PLAYER_RADIUS,
  walls: WallSegment[] = MAP_WALLS
): { x: number; z: number; collided: boolean } {
  let resolvedX = px;
  let resolvedZ = pz;
  let hasCollided = false;

  // 3 iterations for robust multi-wall/corner resolution
  for (let iter = 0; iter < 3; iter++) {
    for (const wall of walls) {
      // Fast AABB pre-check
      const minX = Math.min(wall.x1, wall.x2) - radius;
      const maxX = Math.max(wall.x1, wall.x2) + radius;
      const minZ = Math.min(wall.z1, wall.z2) - radius;
      const maxZ = Math.max(wall.z1, wall.z2) + radius;

      if (resolvedX < minX || resolvedX > maxX || resolvedZ < minZ || resolvedZ > maxZ) {
        continue;
      }

      const closest = closestPointOnSegment(resolvedX, resolvedZ, wall.x1, wall.z1, wall.x2, wall.z2);
      const diffX = resolvedX - closest.x;
      const diffZ = resolvedZ - closest.z;
      const distSq = diffX * diffX + diffZ * diffZ;

      if (distSq < radius * radius && distSq > 0.000001) {
        hasCollided = true;
        const dist = Math.sqrt(distSq);
        const overlap = radius - dist;
        const normX = diffX / dist;
        const normZ = diffZ / dist;

        // Push player outside wall
        resolvedX += normX * overlap;
        resolvedZ += normZ * overlap;
      } else if (distSq <= 0.000001) {
        // Exactly on segment line - push in default normal direction
        hasCollided = true;
        const dx = wall.x2 - wall.x1;
        const dz = wall.z2 - wall.z1;
        const len = Math.hypot(dx, dz) || 1;
        resolvedX += (-dz / len) * radius;
        resolvedZ += (dx / len) * radius;
      }
    }
  }

  return { x: resolvedX, z: resolvedZ, collided: hasCollided };
}

/**
 * Checks if a line segment between (x1, z1) and (x2, z2) intersects any wall
 * Used for camera occlusion clipping and line-of-sight checks
 */
export function lineIntersectsWalls(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  walls: WallSegment[] = MAP_WALLS
): { hit: boolean; distanceRatio: number; hitPoint?: { x: number; z: number } } {
  let closestRatio = 1.0;
  let didHit = false;
  let bestPoint: { x: number; z: number } | undefined = undefined;

  for (const wall of walls) {
    const denom = (z2 - z1) * (wall.x2 - wall.x1) - (x2 - x1) * (wall.z2 - wall.z1);
    if (Math.abs(denom) < 0.00001) continue;

    const ua = ((wall.x2 - wall.x1) * (z1 - wall.z1) - (wall.z2 - wall.z1) * (x1 - wall.x1)) / denom;
    const ub = ((x2 - x1) * (z1 - wall.z1) - (z2 - z1) * (x1 - wall.x1)) / denom;

    if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
      if (ua < closestRatio) {
        closestRatio = ua;
        didHit = true;
        bestPoint = {
          x: x1 + ua * (x2 - x1),
          z: z1 + ua * (z2 - z1),
        };
      }
    }
  }

  return { hit: didHit, distanceRatio: closestRatio, hitPoint: bestPoint };
}
