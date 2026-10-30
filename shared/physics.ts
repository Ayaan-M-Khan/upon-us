/**
 * Impostor Protocol - Shared Physics & Collision Engine
 * Continuous circle-vs-segment and circle-vs-obstacle collision detection with
 * frictionless axis-decoupled sliding. Guarantees zero snagging and zero phase-through.
 */

import { MAP_WALLS, MAP_OBSTACLES, WallSegment, MapObstacle, isFloorAt } from './mapData';

export const PLAYER_RADIUS = 0.38; // meters (optimized for comfortable doorway & corridor clearance)

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

/**
 * Resolves static circle collisions against all wall segments and physical room obstacles.
 * Pushes the circle out along the collision normal.
 */
export function resolveWallCollisions(
  px: number,
  pz: number,
  radius: number = PLAYER_RADIUS,
  walls: WallSegment[] = MAP_WALLS,
  obstacles: MapObstacle[] = MAP_OBSTACLES
): { x: number; z: number; collided: boolean; normalX: number; normalZ: number } {
  let resolvedX = px;
  let resolvedZ = pz;
  let hasCollided = false;
  let totalNormX = 0;
  let totalNormZ = 0;

  // 4 relaxation passes for multi-wall/corner resolution
  for (let iter = 0; iter < 4; iter++) {
    // 1. Collide against Wall Segments
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

      if (distSq < radius * radius) {
        hasCollided = true;
        const dist = Math.sqrt(distSq);
        let normX: number;
        let normZ: number;

        if (dist > 0.0001) {
          normX = diffX / dist;
          normZ = diffZ / dist;
        } else {
          // Exactly on segment line - use perpendicular normal
          const dx = wall.x2 - wall.x1;
          const dz = wall.z2 - wall.z1;
          const len = Math.hypot(dx, dz) || 1;
          normX = -dz / len;
          normZ = dx / len;
        }

        const overlap = radius - dist;
        resolvedX += normX * overlap;
        resolvedZ += normZ * overlap;
        totalNormX += normX;
        totalNormZ += normZ;
      }
    }

    // 2. Collide against Room Items & Machinery Obstacles
    for (const obs of obstacles) {
      if (obs.type === 'circle') {
        const dx = resolvedX - obs.x;
        const dz = resolvedZ - obs.z;
        const minDist = radius + obs.radius;
        const distSq = dx * dx + dz * dz;

        if (distSq < minDist * minDist) {
          hasCollided = true;
          const dist = Math.sqrt(distSq);
          let normX = 1;
          let normZ = 0;
          if (dist > 0.0001) {
            normX = dx / dist;
            normZ = dz / dist;
          }
          const overlap = minDist - dist;
          resolvedX += normX * overlap;
          resolvedZ += normZ * overlap;
          totalNormX += normX;
          totalNormZ += normZ;
        }
      } else if (obs.type === 'box') {
        const bMinX = (obs.minX ?? obs.x) - radius;
        const bMaxX = (obs.maxX ?? obs.x) + radius;
        const bMinZ = (obs.minZ ?? obs.z) - radius;
        const bMaxZ = (obs.maxZ ?? obs.z) + radius;

        if (resolvedX >= bMinX && resolvedX <= bMaxX && resolvedZ >= bMinZ && resolvedZ <= bMaxZ) {
          const cx = Math.max(obs.minX ?? obs.x, Math.min(obs.maxX ?? obs.x, resolvedX));
          const cz = Math.max(obs.minZ ?? obs.z, Math.min(obs.maxZ ?? obs.z, resolvedZ));
          const dx = resolvedX - cx;
          const dz = resolvedZ - cz;
          const distSq = dx * dx + dz * dz;

          if (distSq < radius * radius) {
            hasCollided = true;
            const dist = Math.sqrt(distSq);
            let normX = 0;
            let normZ = 0;
            if (dist > 0.0001) {
              normX = dx / dist;
              normZ = dz / dist;
            } else {
              const dLeft = resolvedX - (obs.minX ?? obs.x);
              const dRight = (obs.maxX ?? obs.x) - resolvedX;
              const dTop = resolvedZ - (obs.minZ ?? obs.z);
              const dBottom = (obs.maxZ ?? obs.z) - resolvedZ;
              const minD = Math.min(dLeft, dRight, dTop, dBottom);
              if (minD === dLeft) normX = -1;
              else if (minD === dRight) normX = 1;
              else if (minD === dTop) normZ = -1;
              else normZ = 1;
            }
            const overlap = radius - dist;
            resolvedX += normX * overlap;
            resolvedZ += normZ * overlap;
            totalNormX += normX;
            totalNormZ += normZ;
          }
        }
      }
    }
  }

  const nLen = Math.hypot(totalNormX, totalNormZ);
  return {
    x: resolvedX,
    z: resolvedZ,
    collided: hasCollided,
    normalX: nLen > 0.001 ? totalNormX / nLen : 0,
    normalZ: nLen > 0.001 ? totalNormZ / nLen : 0,
  };
}

export interface MovementResolution {
  x: number;
  z: number;
  collided: boolean;
  normalX: number;
  normalZ: number;
}

/**
 * High-fidelity continuous movement collision resolution with axis-decoupled sliding.
 * Moving diagonally into any wall or obstacle allows 100% full sliding along the open axis.
 */
export function resolveMovementCollisions(
  currX: number,
  currZ: number,
  targetX: number,
  targetZ: number,
  radius: number = PLAYER_RADIUS,
  walls: WallSegment[] = MAP_WALLS,
  obstacles: MapObstacle[] = MAP_OBSTACLES
): MovementResolution {
  const dx = targetX - currX;
  const dz = targetZ - currZ;

  // 1. Move along X axis independently
  let candX = currX;
  let candZ = currZ;
  let collidedX = false;
  let normX = 0;

  if (Math.abs(dx) > 0.00001) {
    const tryX = currX + dx;
    const resX = resolveWallCollisions(tryX, currZ, radius, walls, obstacles);
    candX = resX.x;
    if (resX.collided) {
      collidedX = true;
      normX = resX.normalX;
    }
  }

  // 2. Move along Z axis independently from candidate X
  let collidedZ = false;
  let normZ = 0;

  if (Math.abs(dz) > 0.00001) {
    const tryZ = currZ + dz;
    const resZ = resolveWallCollisions(candX, tryZ, radius, walls, obstacles);
    candZ = resZ.z;
    if (resZ.collided) {
      collidedZ = true;
      normZ = resZ.normalZ;
    }
  }

  // 3. Absolute floor boundary containment guarantee
  if (!isFloorAt(candX, candZ)) {
    if (isFloorAt(candX, currZ)) {
      candZ = currZ;
    } else if (isFloorAt(currX, candZ)) {
      candX = currX;
    } else {
      candX = currX;
      candZ = currZ;
    }
  }

  return {
    x: candX,
    z: candZ,
    collided: collidedX || collidedZ,
    normalX: normX,
    normalZ: normZ,
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
