/**
 * Impostor Protocol - Shared Physics & Wall Collision
 * Circle vs Line Segment collision detection with smooth sliding and zero corner snagging.
 */

import { ALL_OBSTACLE_WALLS, WallSegment } from './mapData';

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
  walls: WallSegment[] = ALL_OBSTACLE_WALLS
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

export interface CircleObstacle {
  x: number;
  z: number;
  radius: number;
}

export interface BoxObstacle {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// Interior furniture and prop colliders matching 3D models in map3D
export const PROP_CIRCLE_OBSTACLES: CircleObstacle[] = [
  // Cafeteria emergency meeting main table
  { x: 0, z: -22, radius: 2.65 },
  // 4 Cafeteria dining tables
  { x: -8, z: -26, radius: 1.35 },
  { x: 8, z: -26, radius: 1.35 },
  { x: -8, z: -18, radius: 1.35 },
  { x: 8, z: -18, radius: 1.35 },
  // Reactor core column
  { x: -49, z: -3, radius: 1.85 },
];

export const PROP_BOX_OBSTACLES: BoxObstacle[] = [
  // Admin hologram table
  { minX: 13.2, maxX: 16.8, minZ: -1.1, maxZ: 1.1 },
  // Upper Engine block
  { minX: -41, maxX: -37, minZ: -27, maxZ: -23 },
  // Lower Engine block
  { minX: -41, maxX: -37, minZ: 15, maxZ: 19 },
  // Navigation console
  { minX: 51.2, maxX: 52.8, minZ: -7.5, maxZ: -2.5 },
  // Storage crates
  { minX: -2.5, maxX: 0.5, minZ: 21.5, maxZ: 24.5 },
];

/**
 * Resolves player collision against circular and rectangular interior props
 */
export function resolvePropCollisions(
  px: number,
  pz: number,
  radius: number = PLAYER_RADIUS,
  circles: CircleObstacle[] = PROP_CIRCLE_OBSTACLES,
  boxes: BoxObstacle[] = PROP_BOX_OBSTACLES
): { x: number; z: number; collided: boolean } {
  let resolvedX = px;
  let resolvedZ = pz;
  let collided = false;

  // Circular props (tables, reactor core)
  for (const c of circles) {
    const dx = resolvedX - c.x;
    const dz = resolvedZ - c.z;
    const distSq = dx * dx + dz * dz;
    const minDist = radius + c.radius;

    if (distSq < minDist * minDist && distSq > 0.00001) {
      collided = true;
      const dist = Math.sqrt(distSq);
      const overlap = minDist - dist;
      resolvedX += (dx / dist) * overlap;
      resolvedZ += (dz / dist) * overlap;
    }
  }

  // Rectangular AABB props (Admin table, engines, consoles)
  for (const b of boxes) {
    const closestX = Math.max(b.minX, Math.min(resolvedX, b.maxX));
    const closestZ = Math.max(b.minZ, Math.min(resolvedZ, b.maxZ));

    const dx = resolvedX - closestX;
    const dz = resolvedZ - closestZ;
    const distSq = dx * dx + dz * dz;

    if (distSq < radius * radius && distSq > 0.00001) {
      collided = true;
      const dist = Math.sqrt(distSq);
      const overlap = radius - dist;
      resolvedX += (dx / dist) * overlap;
      resolvedZ += (dz / dist) * overlap;
    } else if (distSq <= 0.00001 && resolvedX >= b.minX && resolvedX <= b.maxX && resolvedZ >= b.minZ && resolvedZ <= b.maxZ) {
      // Inside box: push toward nearest edge
      collided = true;
      const leftDist = resolvedX - b.minX;
      const rightDist = b.maxX - resolvedX;
      const topDist = resolvedZ - b.minZ;
      const bottomDist = b.maxZ - resolvedZ;
      const minEdge = Math.min(leftDist, rightDist, topDist, bottomDist);

      if (minEdge === leftDist) resolvedX = b.minX - radius;
      else if (minEdge === rightDist) resolvedX = b.maxX + radius;
      else if (minEdge === topDist) resolvedZ = b.minZ - radius;
      else resolvedZ = b.maxZ + radius;
    }
  }

  return { x: resolvedX, z: resolvedZ, collided };
}

/**
 * Combined collision solver: Wall geometry + interior room props.
 * If isGhost is true, wall & prop collisions are bypassed (wall noclip).
 */
export function resolveMovementCollisions(
  px: number,
  pz: number,
  radius: number = PLAYER_RADIUS,
  isGhost: boolean = false,
  walls: WallSegment[] = ALL_OBSTACLE_WALLS
): { x: number; z: number; collided: boolean } {
  if (isGhost) {
    // Ghosts bypass physical boundaries completely
    return { x: px, z: pz, collided: false };
  }

  const wallRes = resolveWallCollisions(px, pz, radius, walls);
  const propRes = resolvePropCollisions(wallRes.x, wallRes.z, radius);

  return {
    x: propRes.x,
    z: propRes.z,
    collided: wallRes.collided || propRes.collided,
  };
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
  walls: WallSegment[] = ALL_OBSTACLE_WALLS
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

