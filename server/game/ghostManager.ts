/**
 * Impostor Protocol - Server-Authoritative Ghost Manager
 * Manages eliminated players, noclip physics bypass, and dedicated Ghost-only Haunt chat channel.
 */

import { Server } from 'socket.io';
import { ChatBroadcastMessage, EVENTS, Role } from '../../shared/events';

export interface GhostRecord {
  id: string;
  name: string;
  colorId: string;
  hatId: string;
  role: Role;
  eliminatedAt: number;
  cause: 'killed' | 'ejected';
  killerId?: string;
}

export class GhostManager {
  private ghosts: Map<string, GhostRecord> = new Map();

  /**
   * Registers a player as eliminated/ghost
   */
  public eliminatePlayer(
    player: { id: string; name: string; colorId: string; hatId: string; role: Role },
    cause: 'killed' | 'ejected',
    killerId?: string
  ): GhostRecord {
    const record: GhostRecord = {
      id: player.id,
      name: player.name,
      colorId: player.colorId,
      hatId: player.hatId,
      role: player.role,
      eliminatedAt: Date.now(),
      cause,
      killerId,
    };
    this.ghosts.set(player.id, record);
    return record;
  }

  /**
   * Checks if a player has been eliminated and is in ghost state
   */
  public isGhost(playerId: string): boolean {
    return this.ghosts.has(playerId);
  }

  /**
   * Noclip permission check: Eliminated ghosts bypass physical walls & prop barriers
   */
  public canNoclip(playerId: string): boolean {
    return this.ghosts.has(playerId);
  }

  /**
   * Returns whether player has access to the dedicated Ghost-only haunt channel
   */
  public hasHauntAccess(playerId: string): boolean {
    return this.ghosts.has(playerId);
  }

  /**
   * Returns ghost record for a given player ID
   */
  public getGhost(playerId: string): GhostRecord | undefined {
    return this.ghosts.get(playerId);
  }

  /**
   * Returns all currently active ghosts
   */
  public getAllGhosts(): GhostRecord[] {
    return Array.from(this.ghosts.values());
  }

  /**
   * Dispatches a Ghost-only chat message strictly to other eliminated players.
   * Living crewmates never receive these messages, preventing spoiler leakage.
   */
  public broadcastGhostChat(
    sender: { id: string; name: string; colorId: string; hatId?: string; room?: string },
    text: string,
    humans: { id: string; isAlive: boolean }[],
    io: Server
  ): void {
    const messageId = `ghost_msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const ghostPayload: ChatBroadcastMessage = {
      id: messageId,
      senderId: sender.id,
      senderName: sender.name,
      senderColorId: sender.colorId,
      senderHatId: sender.hatId || 'none',
      text,
      scope: 'haunt',
      timestamp: Date.now(),
      senderRoom: sender.room || 'Spectral Plane',
    };

    // Filter strictly to dead players
    for (const h of humans) {
      if (!h.isAlive || this.isGhost(h.id)) {
        io.to(h.id).emit(EVENTS.CHAT_BROADCAST, ghostPayload);
      }
    }
  }

  /**
   * Resets all ghost records for a fresh match
   */
  public reset(): void {
    this.ghosts.clear();
  }
}
