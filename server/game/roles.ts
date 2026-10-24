/**
 * Impostor Protocol - Role Assignment
 */

import type { Role } from '../../shared/events';

export type { Role };

export interface PlayerRoleAssignment {
  playerId: string;
  role: Role;
  isAlive: boolean;
}

/** Same limits as the lobby: 1 impostor under 7 players, 2 under 9, otherwise up to 3. */
export function maxImpostorsFor(playerCount: number): number {
  if (playerCount < 7) return 1;
  if (playerCount < 9) return 2;
  return 3;
}

export function assignRoles(playerIds: string[], impostorCount: number): Map<string, PlayerRoleAssignment> {
  const assignments = new Map<string, PlayerRoleAssignment>();
  const shuffled = [...playerIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const actual = Math.max(1, Math.min(impostorCount, maxImpostorsFor(playerIds.length)));
  const impostorIds = new Set(shuffled.slice(0, actual));

  for (const id of playerIds) {
    assignments.set(id, { playerId: id, role: impostorIds.has(id) ? 'impostor' : 'crewmate', isAlive: true });
  }
  return assignments;
}
