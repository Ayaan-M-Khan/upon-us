/**
 * Impostor Protocol - Impostor Sabotage Tactical Modal
 * Allows Impostors to trigger Reactor Meltdown, O2 Depletion, Lights Out, Comms Jamming, and Door Locks.
 */

import React from 'react';
import { AlertTriangle, DoorClosed, Flame, Lock, Radio, Shield, Wind, X, Zap, ZapOff } from 'lucide-react';
import { SabotageType } from '../../shared/events';
import { soundEngine } from '../audio';
import { net } from '../net';

interface SabotageModalProps {
  cooldownSecs: number;
  activeSabotageType?: SabotageType | null;
  lockedRooms?: string[];
  onClose: () => void;
}

export const SabotageModal: React.FC<SabotageModalProps> = ({
  cooldownSecs,
  activeSabotageType,
  lockedRooms = [],
  onClose,
}) => {
  const canSabotageSystems = cooldownSecs <= 0 && !activeSabotageType;

  const trigger = (type: SabotageType, room?: string) => {
    soundEngine.playClick();
    net.sabotage(type, room);
    onClose();
  };

  const doorRooms = [
    { id: 'cafeteria', name: 'Cafeteria' },
    { id: 'medbay', name: 'Medbay' },
    { id: 'electrical', name: 'Electrical' },
    { id: 'storage', name: 'Storage' },
    { id: 'reactor', name: 'Reactor' },
    { id: 'security', name: 'Security' },
    { id: 'admin', name: 'Admin' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 pointer-events-auto select-none">
      <div className="relative w-full max-w-2xl bg-slate-950 border-4 border-rose-600/90 rounded-3xl p-6 shadow-[0_0_60px_rgba(225,29,72,0.35)] flex flex-col space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-rose-950/80 pb-3">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-2xl bg-rose-950 border border-rose-700/80 text-rose-400">
              <AlertTriangle className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-rose-300 tracking-wider">
                IMPOSTOR SABOTAGE GRID
              </h2>
              <p className="text-xs text-rose-400/80 font-bold">
                Deploy shipwide emergencies or lock room blast doors
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cooldown or Active Warning */}
        {activeSabotageType ? (
          <div className="bg-rose-950/80 border-2 border-rose-600 rounded-2xl p-3 flex items-center space-x-3 text-rose-200">
            <div className="w-3 h-3 rounded-full bg-rose-500 animate-ping shrink-0" />
            <span className="text-xs sm:text-sm font-black tracking-wide">
              EMERGENCY IN PROGRESS: {activeSabotageType.toUpperCase()} SABOTAGE ACTIVE!
            </span>
          </div>
        ) : cooldownSecs > 0 ? (
          <div className="bg-slate-900 border-2 border-slate-700 rounded-2xl p-3 flex items-center justify-between text-slate-300">
            <span className="text-xs font-bold">SYSTEM SABOTAGE RECHARGING...</span>
            <span className="text-sm font-mono font-black text-rose-400 bg-rose-950/80 px-2.5 py-0.5 rounded-full border border-rose-800">
              {cooldownSecs}s
            </span>
          </div>
        ) : null}

        {/* Primary Systems Sabotages (4 main choices) */}
        <div>
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 block">
            Shipwide System Sabotages
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 1. Reactor Meltdown */}
            <button
              disabled={!canSabotageSystems}
              onClick={() => trigger('reactor')}
              className={`p-4 rounded-2xl border-2 text-left transition-all flex items-start space-x-3 ${
                canSabotageSystems
                  ? 'bg-gradient-to-br from-red-950/80 to-slate-900 border-red-600/80 hover:border-red-400 cursor-pointer active:scale-98 shadow-lg'
                  : 'bg-slate-900/50 border-slate-800 opacity-60 cursor-not-allowed'
              }`}
            >
              <div className="p-2.5 rounded-xl bg-red-900/60 border border-red-500 text-red-400 shrink-0">
                <Flame className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-white text-base">Reactor Meltdown</h4>
                  <span className="text-[10px] font-black bg-red-900 text-red-300 px-2 py-0.5 rounded-full">
                    CRITICAL
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 leading-snug">
                  Forces 45s countdown timer. Requires two players holding scanners simultaneously to fix.
                </p>
              </div>
            </button>

            {/* 2. O2 Depletion */}
            <button
              disabled={!canSabotageSystems}
              onClick={() => trigger('o2')}
              className={`p-4 rounded-2xl border-2 text-left transition-all flex items-start space-x-3 ${
                canSabotageSystems
                  ? 'bg-gradient-to-br from-emerald-950/80 to-slate-900 border-emerald-600/80 hover:border-emerald-400 cursor-pointer active:scale-98 shadow-lg'
                  : 'bg-slate-900/50 border-slate-800 opacity-60 cursor-not-allowed'
              }`}
            >
              <div className="p-2.5 rounded-xl bg-emerald-900/60 border border-emerald-500 text-emerald-400 shrink-0">
                <Wind className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-white text-base">O2 Depletion</h4>
                  <span className="text-[10px] font-black bg-emerald-900 text-emerald-300 px-2 py-0.5 rounded-full">
                    CRITICAL
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 leading-snug">
                  Cuts life support. 45s countdown. Requires numeric PIN override in O2 and Admin.
                </p>
              </div>
            </button>

            {/* 3. Lights Out */}
            <button
              disabled={!canSabotageSystems}
              onClick={() => trigger('lights')}
              className={`p-4 rounded-2xl border-2 text-left transition-all flex items-start space-x-3 ${
                canSabotageSystems
                  ? 'bg-gradient-to-br from-yellow-950/80 to-slate-900 border-yellow-600/80 hover:border-yellow-400 cursor-pointer active:scale-98 shadow-lg'
                  : 'bg-slate-900/50 border-slate-800 opacity-60 cursor-not-allowed'
              }`}
            >
              <div className="p-2.5 rounded-xl bg-yellow-900/60 border border-yellow-500 text-yellow-400 shrink-0">
                <ZapOff className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-white text-base">Lights Out</h4>
                  <span className="text-[10px] font-black bg-yellow-900 text-yellow-300 px-2 py-0.5 rounded-full">
                    VISIBILITY
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 leading-snug">
                  Blinds crewmates while giving Impostors full night-vision. Fixed via electrical switches.
                </p>
              </div>
            </button>

            {/* 4. Comms Out */}
            <button
              disabled={!canSabotageSystems}
              onClick={() => trigger('comms')}
              className={`p-4 rounded-2xl border-2 text-left transition-all flex items-start space-x-3 ${
                canSabotageSystems
                  ? 'bg-gradient-to-br from-cyan-950/80 to-slate-900 border-cyan-600/80 hover:border-cyan-400 cursor-pointer active:scale-98 shadow-lg'
                  : 'bg-slate-900/50 border-slate-800 opacity-60 cursor-not-allowed'
              }`}
            >
              <div className="p-2.5 rounded-xl bg-cyan-900/60 border border-cyan-500 text-cyan-400 shrink-0">
                <Radio className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-white text-base">Comms Jamming</h4>
                  <span className="text-[10px] font-black bg-cyan-900 text-cyan-300 px-2 py-0.5 rounded-full">
                    INTEL
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 leading-snug">
                  Hides task progress / list from crewmates and takes security cameras offline.
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Door Lockdown Controls */}
        <div>
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 block">
            Room Door Locks (10s Lockdown)
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {doorRooms.map((rm) => {
              const isLocked = lockedRooms.includes(rm.id);
              return (
                <button
                  key={rm.id}
                  disabled={isLocked}
                  onClick={() => trigger('doors', rm.id)}
                  className={`p-2.5 rounded-xl border-2 flex items-center justify-between font-bold text-xs transition-all ${
                    isLocked
                      ? 'bg-rose-950/90 border-rose-600 text-rose-300 opacity-80 cursor-not-allowed'
                      : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-white cursor-pointer active:scale-95'
                  }`}
                >
                  <span>{rm.name}</span>
                  {isLocked ? <Lock className="w-4 h-4 text-rose-400" /> : <DoorClosed className="w-4 h-4 text-slate-400" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
