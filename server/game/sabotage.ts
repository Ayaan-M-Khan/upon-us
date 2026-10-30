/**
 * Impostor Protocol - Sabotage System
 */

import type { SabotageType } from '../../shared/events';

export type { SabotageType };

export interface ActiveSabotage {
  type: SabotageType;
  countdown: number;
  isResolved: boolean;
  affectedRoom?: string;
  activatedAt: number;
}
