/**
 * Impostor Protocol - Role Assignment
 */

import type { Role } from '../../shared/events';
import { maxImpostorsFor } from '../../shared/constants';

export type { Role };

export interface PlayerRoleAssignment {
  playerId: string;
  role: Role;
  isAlive: boolean;
}

export { maxImpostorsFor };

export function assignRoles(playerIds: string[], impostorCount: number): Map<string, PlayerRoleAssignment> {
  const assignments = new Map<string, PlayerRoleAssignment>();
  const shuffled = [...playerIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const actual = Math.max(1, Math.min(impostorCount, maxImpostorsFor(playerIds.length)));
  const impostorIds = new Set(shuffled.slice(0, actual));
  const engineerId = playerIds.length >= 5 ? shuffled.find((id) => !impostorIds.has(id)) : undefined;

  for (const id of playerIds) {
    const role = impostorIds.has(id) ? 'impostor' : id === engineerId ? 'engineer' : 'crewmate';
    assignments.set(id, { playerId: id, role, isAlive: true });
  }
  return assignments;
}
