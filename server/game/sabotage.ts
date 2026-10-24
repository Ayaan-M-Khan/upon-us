/**
 * Impostor Protocol - Sabotage System
 */

export type SabotageType = 'reactor' | 'o2' | 'lights' | 'comms' | 'doors';

export interface ActiveSabotage {
  type: SabotageType;
  countdown: number;
  isResolved: boolean;
  affectedRoom?: string;
  activatedAt: number;
}
