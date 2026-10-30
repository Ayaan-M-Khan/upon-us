/**
 * Impostor Protocol - Full Sabotage System
 */

import { SabotageType, SabotagePartState, SabotageStateView } from '../../shared/events';

export const SABOTAGE_LOCATIONS = {
  reactor_upper: { id: 1, name: 'Reactor Upper Manifold', room: 'reactor', x: -43, z: -5 },
  reactor_lower: { id: 2, name: 'Reactor Lower Manifold', room: 'reactor', x: -43, z: 5 },
  o2_scrubber: { id: 1, name: 'O2 Life Support Keypad', room: 'o2', x: 23, z: -8 },
  o2_admin: { id: 2, name: 'Admin Life Support Keypad', room: 'admin', x: 13, z: -2.5 },
  electrical_breakers: { id: 1, name: 'Electrical Breaker Switches', room: 'electrical', x: -16, z: 14 },
  comms_terminal: { id: 1, name: 'Communications Relay', room: 'communications', x: 21, z: 22 },
};

export const SABOTAGE_COOLDOWN_MS = 25000;
export const DOOR_LOCK_MS = 10000;
export const CRITICAL_SABOTAGE_SECS = 45;

export interface InternalActiveSabotage {
  type: SabotageType;
  room?: string;
  activatedAt: number;
  endsAt: number;
  totalSecs: number;
  isCritical: boolean;
  parts: SabotagePartState[];
}

export class SabotageManager {
  private activeSabotage: InternalActiveSabotage | null = null;
  private doorLocks: Map<string, number> = new Map(); // room -> expiresAt
  private cooldownUntil: number = 0;

  constructor() {
    this.cooldownUntil = Date.now() + 15000; // 15s grace at match start
  }

  public getCooldownRemainingSecs(now: number = Date.now()): number {
    return Math.max(0, Math.ceil((this.cooldownUntil - now) / 1000));
  }

  public getActiveSabotage(): InternalActiveSabotage | null {
    return this.activeSabotage;
  }

  public isLightsOut(): boolean {
    return this.activeSabotage?.type === 'lights';
  }

  public isCommsDisabled(): boolean {
    return this.activeSabotage?.type === 'comms';
  }

  public isDoorLocked(room: string, now: number = Date.now()): boolean {
    const exp = this.doorLocks.get(room);
    return !!exp && exp > now;
  }

  public getLockedRooms(now: number = Date.now()): string[] {
    const locked: string[] = [];
    for (const [room, exp] of this.doorLocks.entries()) {
      if (exp > now) locked.push(room);
    }
    return locked;
  }

  public triggerSabotage(type: SabotageType, room?: string, now: number = Date.now()): boolean {
    // If doors sabotage:
    if (type === 'doors') {
      const targetRoom = room || 'cafeteria';
      this.doorLocks.set(targetRoom, now + DOOR_LOCK_MS);
      this.cooldownUntil = Math.max(this.cooldownUntil, now + 12000);
      return true;
    }

    // For shipwide systems: cannot trigger if already active or on cooldown
    if (this.activeSabotage || now < this.cooldownUntil) {
      return false;
    }

    let parts: SabotagePartState[] = [];
    let isCritical = false;
    let totalSecs = 0;

    switch (type) {
      case 'reactor':
        isCritical = true;
        totalSecs = CRITICAL_SABOTAGE_SECS;
        parts = [
          { ...SABOTAGE_LOCATIONS.reactor_upper, resolved: false },
          { ...SABOTAGE_LOCATIONS.reactor_lower, resolved: false },
        ];
        break;

      case 'o2':
        isCritical = true;
        totalSecs = CRITICAL_SABOTAGE_SECS;
        parts = [
          { ...SABOTAGE_LOCATIONS.o2_scrubber, resolved: false },
          { ...SABOTAGE_LOCATIONS.o2_admin, resolved: false },
        ];
        break;

      case 'lights':
        isCritical = false;
        totalSecs = 0;
        parts = [{ ...SABOTAGE_LOCATIONS.electrical_breakers, resolved: false }];
        break;

      case 'comms':
        isCritical = false;
        totalSecs = 0;
        parts = [{ ...SABOTAGE_LOCATIONS.comms_terminal, resolved: false }];
        break;

      default:
        return false;
    }

    this.activeSabotage = {
      type,
      room,
      activatedAt: now,
      endsAt: isCritical ? now + totalSecs * 1000 : 0,
      totalSecs,
      isCritical,
      parts,
    };

    return true;
  }

  public fixPart(partId: number, playerPos: { x: number; z: number }, now: number = Date.now()): boolean {
    if (!this.activeSabotage) return false;

    const part = this.activeSabotage.parts.find((p) => p.id === partId);
    if (!part || part.resolved) return false;

    // Verify proximity to the station
    const dist = Math.hypot(playerPos.x - part.x, playerPos.z - part.z);
    if (dist > 3.8) return false;

    part.resolved = true;

    // Check if all parts are resolved
    if (this.activeSabotage.parts.every((p) => p.resolved)) {
      this.resolve(now);
      return true;
    }

    return true;
  }

  public resolve(now: number = Date.now()): void {
    if (!this.activeSabotage) return;
    this.activeSabotage = null;
    this.cooldownUntil = now + SABOTAGE_COOLDOWN_MS;
  }

  public clearOnMeeting(now: number = Date.now()): void {
    this.activeSabotage = null;
    this.doorLocks.clear();
    this.cooldownUntil = now + 15000;
  }

  public tick(now: number = Date.now()): { criticalTimeout: boolean; reason?: string } {
    // Purge expired door locks
    for (const [room, exp] of this.doorLocks.entries()) {
      if (exp <= now) this.doorLocks.delete(room);
    }

    if (!this.activeSabotage) return { criticalTimeout: false };

    if (this.activeSabotage.isCritical && now >= this.activeSabotage.endsAt) {
      const type = this.activeSabotage.type;
      this.activeSabotage = null;
      return {
        criticalTimeout: true,
        reason:
          type === 'reactor'
            ? 'Reactor meltdown destroyed the Skeld!'
            : 'Oxygen supply was completely depleted!',
      };
    }

    return { criticalTimeout: false };
  }

  public getView(now: number = Date.now()): SabotageStateView | null {
    if (!this.activeSabotage) return null;

    const remainingSecs = this.activeSabotage.isCritical
      ? Math.max(0, Math.ceil((this.activeSabotage.endsAt - now) / 1000))
      : 0;

    return {
      type: this.activeSabotage.type,
      room: this.activeSabotage.room,
      remainingSecs,
      totalSecs: this.activeSabotage.totalSecs,
      parts: this.activeSabotage.parts,
      isCritical: this.activeSabotage.isCritical,
      lightsOut: this.activeSabotage.type === 'lights',
      commsDisabled: this.activeSabotage.type === 'comms',
    };
  }
}
