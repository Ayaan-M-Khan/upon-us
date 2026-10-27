/**
 * Impostor Protocol - Authoritative Sabotage System
 * Handles Lights, Reactor Meltdown, O2 Depletion, and Cafeteria/Storage Door Locks.
 */

import { ActiveSabotageState, FixSabotagePayload, SabotageTriggerPayload, SabotageType } from '../../shared/events';

export const SABOTAGE_SHARED_COOLDOWN_MS = 30_000;
export const CRITICAL_SABOTAGE_DURATION_SEC = 45;
export const DOORS_LOCK_DURATION_MS = 10_000;

export class SabotageManager {
  private activeSabotage: ActiveSabotageState | null = null;
  private criticalEndsAt: number = 0;
  private cooldownEnd: number = 0;
  private doorsLockedUntil: number = 0;
  private lockedRoom: ('Cafeteria' | 'Storage') | null = null;

  constructor(initialCooldownMs: number = 10_000) {
    this.cooldownEnd = Date.now() + initialCooldownMs;
  }

  public getActiveSabotage(): ActiveSabotageState | null {
    return this.activeSabotage;
  }

  public getLockedDoors(): ('Cafeteria' | 'Storage')[] {
    return this.lockedRoom ? [this.lockedRoom] : [];
  }

  public getCooldownRemainingMs(now: number = Date.now()): number {
    return Math.max(0, this.cooldownEnd - now);
  }

  public isEmergencyBlocked(): boolean {
    return (
      this.activeSabotage !== null &&
      (this.activeSabotage.type === 'reactor' || this.activeSabotage.type === 'o2')
    );
  }

  public trigger(payload: SabotageTriggerPayload, now: number = Date.now()): { success: boolean; error?: string } {
    if (this.cooldownEnd > now) {
      return { success: false, error: 'Sabotage is on cooldown' };
    }

    if (payload.type === 'doors') {
      const room = payload.room;
      if (room !== 'Cafeteria' && room !== 'Storage') {
        return { success: false, error: 'Invalid room for door lock' };
      }
      this.lockedRoom = room;
      this.doorsLockedUntil = now + DOORS_LOCK_DURATION_MS;
      this.cooldownEnd = now + SABOTAGE_SHARED_COOLDOWN_MS;
      return { success: true };
    }

    // Lights, Reactor, O2 cannot stack with another active main sabotage
    if (this.activeSabotage) {
      return { success: false, error: 'A sabotage is already active' };
    }

    if (payload.type === 'lights') {
      // 5 electrical breaker switches. Start with 3 off, 2 on so crew must flip them all on.
      this.activeSabotage = {
        type: 'lights',
        countdown: 0,
        switches: [false, true, false, false, true],
        activatedAt: now,
      };
      this.cooldownEnd = now + SABOTAGE_SHARED_COOLDOWN_MS;
      return { success: true };
    }

    if (payload.type === 'reactor') {
      this.criticalEndsAt = now + CRITICAL_SABOTAGE_DURATION_SEC * 1000;
      this.activeSabotage = {
        type: 'reactor',
        countdown: CRITICAL_SABOTAGE_DURATION_SEC,
        reactorPads: { top: false, bottom: false },
        activatedAt: now,
      };
      this.cooldownEnd = now + SABOTAGE_SHARED_COOLDOWN_MS;
      return { success: true };
    }

    if (payload.type === 'o2') {
      this.criticalEndsAt = now + CRITICAL_SABOTAGE_DURATION_SEC * 1000;
      this.activeSabotage = {
        type: 'o2',
        countdown: CRITICAL_SABOTAGE_DURATION_SEC,
        o2Pads: { o2: false, admin: false },
        activatedAt: now,
      };
      this.cooldownEnd = now + SABOTAGE_SHARED_COOLDOWN_MS;
      return { success: true };
    }

    return { success: false, error: 'Unknown sabotage type' };
  }

  public fix(payload: FixSabotagePayload, now: number = Date.now()): { resolved: boolean; updated: boolean } {
    if (!this.activeSabotage || this.activeSabotage.type !== payload.type) {
      return { resolved: false, updated: false };
    }

    if (payload.type === 'lights' && typeof payload.switchIndex === 'number') {
      const idx = payload.switchIndex;
      if (idx >= 0 && idx < 5 && this.activeSabotage.switches) {
        this.activeSabotage.switches[idx] = !this.activeSabotage.switches[idx];
        const allOn = this.activeSabotage.switches.every((s) => s === true);
        if (allOn) {
          this.activeSabotage = null;
          this.cooldownEnd = now + SABOTAGE_SHARED_COOLDOWN_MS;
          return { resolved: true, updated: true };
        }
        return { resolved: false, updated: true };
      }
    }

    if (payload.type === 'reactor' && (payload.pad === 'top' || payload.pad === 'bottom')) {
      if (this.activeSabotage.reactorPads) {
        this.activeSabotage.reactorPads[payload.pad] = true;
        if (this.activeSabotage.reactorPads.top && this.activeSabotage.reactorPads.bottom) {
          this.activeSabotage = null;
          this.cooldownEnd = now + SABOTAGE_SHARED_COOLDOWN_MS;
          return { resolved: true, updated: true };
        }
        return { resolved: false, updated: true };
      }
    }

    if (payload.type === 'o2' && (payload.pad === 'o2' || payload.pad === 'admin')) {
      if (this.activeSabotage.o2Pads) {
        this.activeSabotage.o2Pads[payload.pad] = true;
        if (this.activeSabotage.o2Pads.o2 && this.activeSabotage.o2Pads.admin) {
          this.activeSabotage = null;
          this.cooldownEnd = now + SABOTAGE_SHARED_COOLDOWN_MS;
          return { resolved: true, updated: true };
        }
        return { resolved: false, updated: true };
      }
    }

    return { resolved: false, updated: false };
  }

  public tick(now: number = Date.now()): { criticalFailed: boolean; failedType?: 'Reactor Meltdown' | 'O2 Depleted' } {
    // Check doors expiration
    if (this.lockedRoom && now >= this.doorsLockedUntil) {
      this.lockedRoom = null;
    }

    // Check critical countdowns
    if (this.activeSabotage && (this.activeSabotage.type === 'reactor' || this.activeSabotage.type === 'o2')) {
      const remainingSec = Math.max(0, Math.ceil((this.criticalEndsAt - now) / 1000));
      this.activeSabotage.countdown = remainingSec;

      if (remainingSec <= 0) {
        const failureReason = this.activeSabotage.type === 'reactor' ? 'Reactor Meltdown' : 'O2 Depleted';
        this.activeSabotage = null;
        return { criticalFailed: true, failedType: failureReason };
      }
    }

    return { criticalFailed: false };
  }

  public clearAll(): void {
    this.activeSabotage = null;
    this.lockedRoom = null;
  }
}
