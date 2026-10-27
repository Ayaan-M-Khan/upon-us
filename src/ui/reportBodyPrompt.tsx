/**
 * Impostor Protocol - Dedicated Report Body Proximity UI Component
 * Prominently alerts the player when standing within range of a dead crewmate body.
 * Features victim identification, room detection, [R] key prompt, and direct touch/click trigger.
 */

import React, { useEffect, useRef } from 'react';
import { Megaphone, AlertOctagon, Skull } from 'lucide-react';
import { PLAYER_COLORS } from '../../shared/constants';
import { GameStateSnapshot, BodyView } from '../../shared/events';
import { detectRoom } from '../../shared/mapData';
import { soundEngine } from '../audio';
import { Bean } from './gameOverlays';

interface ReportBodyPromptProps {
  reportBodyId?: string | null;
  snapshot: GameStateSnapshot | null;
  playerPos: { x: number; z: number };
  onReport: () => void;
  alive: boolean;
  playing: boolean;
  inVent: boolean;
}

export const ReportBodyPrompt: React.FC<ReportBodyPromptProps> = ({
  reportBodyId,
  snapshot,
  playerPos,
  onReport,
  alive,
  playing,
  inVent,
}) => {
  const prevReportIdRef = useRef<string | null>(null);

  // Play a brief proximity cue when a dead body first enters report range
  useEffect(() => {
    if (reportBodyId && reportBodyId !== prevReportIdRef.current && alive && playing && !inVent) {
      soundEngine.playChatMessage('proximity');
    }
    prevReportIdRef.current = reportBodyId || null;
  }, [reportBodyId, alive, playing, inVent]);

  if (!reportBodyId || !alive || !playing || inVent || !snapshot) {
    return null;
  }

  const targetBody: BodyView | undefined = snapshot.bodies?.find((b) => b.id === reportBodyId);
  const colorId = targetBody?.colorId || 'red';
  const colorMeta = PLAYER_COLORS.find((c) => c.id === colorId);
  const colorName = colorMeta?.name || 'Crewmate';

  const victimPlayer = snapshot.players[reportBodyId];
  const victimDisplayName = victimPlayer?.name ? `${victimPlayer.name} (${colorName})` : `${colorName} Crewmate`;

  const roomName = targetBody?.room || (targetBody ? detectRoom(targetBody.x, targetBody.z) : 'Corridor');
  const distance = targetBody
    ? Math.hypot(playerPos.x - targetBody.x, playerPos.z - targetBody.z).toFixed(1)
    : '0.0';

  const handleTrigger = (e: React.MouseEvent) => {
    e.stopPropagation();
    soundEngine.playClick();
    onReport();
  };

  return (
    <div className="fixed bottom-28 sm:bottom-32 left-1/2 -translate-x-1/2 pointer-events-auto z-30 select-none animate-in fade-in zoom-in-95 duration-200">
      <div className="relative flex flex-col sm:flex-row items-center gap-3 sm:gap-4 px-4 py-3 sm:px-5 sm:py-3 bg-gradient-to-r from-red-950/95 via-slate-900/95 to-red-950/95 border-2 border-red-500 rounded-3xl shadow-[0_0_35px_rgba(239,68,68,0.7)] backdrop-blur-xl">
        {/* Pulsing warning aura beacon */}
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-red-600 border border-red-300 text-white text-[10px] font-black tracking-widest uppercase flex items-center space-x-1.5 shadow-[0_0_15px_rgba(239,68,68,0.9)] animate-pulse">
          <AlertOctagon className="w-3 h-3" />
          <span>CORPSE DISCOVERED</span>
        </div>

        {/* Victim Bean Avatar & Skull Icon */}
        <div className="flex items-center space-x-2 pt-1 sm:pt-0">
          <div className="relative">
            <Bean colorId={colorId} size={42} dead />
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-red-600 border border-red-300 flex items-center justify-center text-white">
              <Skull className="w-3 h-3" />
            </div>
          </div>

          {/* Details */}
          <div className="flex flex-col text-left">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-black text-white tracking-wide">{victimDisplayName}</span>
              <span className="text-[11px] font-bold text-red-400 bg-red-950/80 px-2 py-0.5 rounded-full border border-red-800">
                {distance}m
              </span>
            </div>
            <div className="text-xs font-semibold text-slate-300">
              Location: <span className="text-amber-300 font-bold">{roomName}</span>
            </div>
          </div>
        </div>

        {/* Interactive Action Trigger Button */}
        <button
          onClick={handleTrigger}
          className="w-full sm:w-auto mt-1 sm:mt-0 flex items-center justify-center space-x-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:from-red-500 hover:to-amber-500 active:scale-95 text-white font-black text-sm tracking-wider border-2 border-red-300 shadow-[0_0_20px_rgba(239,68,68,0.6)] cursor-pointer transition-all"
        >
          <Megaphone className="w-5 h-5 animate-bounce" />
          <span>REPORT BODY</span>
          <kbd className="hidden sm:inline-block px-2 py-0.5 rounded bg-black/40 border border-white/30 text-xs font-mono font-black text-amber-200 shadow-inner">
            [R]
          </kbd>
        </button>
      </div>
    </div>
  );
};
