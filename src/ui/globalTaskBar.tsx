/**
 * Impostor Protocol - Shared Global Task Completion Bar
 * Displays the authentic collective crew task progress in the HUD with
 * segmented divisions, progress surge animations, audio feedback, and
 * exact completion counters.
 */

import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Sparkles, Trophy, Users } from 'lucide-react';
import { GameStateSnapshot } from '../../shared/events';
import { soundEngine } from '../audio';

interface GlobalTaskBarProps {
  snapshot: GameStateSnapshot | null;
  isImpostor: boolean;
  className?: string;
}

export const GlobalTaskBar: React.FC<GlobalTaskBarProps> = ({
  snapshot,
  isImpostor,
  className = '',
}) => {
  const [isSurging, setIsSurging] = useState<boolean>(false);
  const [recentTaskAlert, setRecentTaskAlert] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState<boolean>(false);

  const prevProgressRef = useRef<number>(snapshot?.taskProgress ?? 0);
  const prevCompletedRef = useRef<number>(snapshot?.tasksCompleted ?? 0);

  const rawProgress = snapshot?.taskProgress ?? 0;
  const progressPct = Math.round(Math.min(100, Math.max(0, rawProgress * 100)));
  const completed = snapshot?.tasksCompleted ?? 0;
  const total = snapshot?.totalTasks ?? (completed > 0 ? Math.round(completed / Math.max(0.01, rawProgress)) : 0);
  const remaining = Math.max(0, total - completed);

  // Trigger surge flash and sound when tasks progress advances
  useEffect(() => {
    const prevCompleted = prevCompletedRef.current;
    const prevProgress = prevProgressRef.current;

    if (completed > prevCompleted || (rawProgress > prevProgress + 0.005 && prevProgress > 0)) {
      setIsSurging(true);
      const diff = completed > prevCompleted ? completed - prevCompleted : 1;
      setRecentTaskAlert(`+${diff} Task Finished!`);

      try {
        soundEngine.playMiniGameBeep(880);
      } catch {
        // Fallback if audio context is locked
      }

      const timer = setTimeout(() => {
        setIsSurging(false);
      }, 1200);

      const alertTimer = setTimeout(() => {
        setRecentTaskAlert(null);
      }, 2400);

      prevCompletedRef.current = completed;
      prevProgressRef.current = rawProgress;

      return () => {
        clearTimeout(timer);
        clearTimeout(alertTimer);
      };
    }

    prevCompletedRef.current = completed;
    prevProgressRef.current = rawProgress;
  }, [completed, rawProgress]);

  // 10 Segment markers (10% increments)
  const segments = Array.from({ length: 9 }, (_, i) => (i + 1) * 10);

  return (
    <div className={`relative pointer-events-auto select-none font-sans ${className}`}>
      {/* Floating surge alert notification */}
      {recentTaskAlert && (
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 z-30 pointer-events-none animate-bounce">
          <div className="px-2.5 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-black text-[10px] tracking-wider uppercase shadow-[0_0_15px_rgba(16,185,129,0.8)] flex items-center space-x-1 border border-emerald-300">
            <Sparkles className="w-3 h-3" />
            <span>{recentTaskAlert}</span>
          </div>
        </div>
      )}

      {/* Main Outer Beveled Housing */}
      <div
        onClick={() => setShowDetails(!showDetails)}
        className={`relative p-1 rounded-xl backdrop-blur-md border-2 transition-all duration-300 cursor-pointer shadow-xl ${
          isSurging
            ? 'bg-emerald-950/95 border-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.5)] scale-[1.02]'
            : progressPct >= 100
            ? 'bg-emerald-950/95 border-yellow-400 shadow-[0_0_25px_rgba(234,179,8,0.5)]'
            : 'bg-slate-900/90 hover:bg-slate-900/95 border-slate-600 hover:border-slate-500'
        }`}
        title="Shared Global Task Bar (Click to view crew progress details)"
      >
        {/* Recessed Gauge Track */}
        <div className="relative h-6 sm:h-7 rounded-lg bg-slate-950/95 border border-slate-700/80 overflow-hidden shadow-inner">
          {/* Progress Fill Bar */}
          <div
            className={`h-full transition-all duration-700 ease-out relative ${
              progressPct >= 100
                ? 'bg-gradient-to-r from-emerald-500 via-green-400 to-yellow-300'
                : 'bg-gradient-to-r from-emerald-600 via-emerald-400 to-cyan-300'
            }`}
            style={{ width: `${progressPct}%` }}
          >
            {/* Animated scanning sheen effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-[pulse_2s_infinite]" />
          </div>

          {/* Segment Dividers (authentic Among Us notched gauge) */}
          <div className="absolute inset-0 flex justify-between pointer-events-none px-[10%]">
            {segments.map((pos) => (
              <div
                key={pos}
                className="w-[1.5px] h-full bg-slate-900/80 border-r border-slate-700/50"
              />
            ))}
          </div>

          {/* Centered High-Contrast Status Overlay */}
          <div className="absolute inset-0 flex items-center justify-between px-3 text-[10px] sm:text-[11px] font-black tracking-widest text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
            <span className="flex items-center space-x-1.5 truncate">
              {progressPct >= 100 ? (
                <Trophy className="w-3.5 h-3.5 text-yellow-300 animate-spin" />
              ) : (
                <Users className="w-3.5 h-3.5 text-emerald-300" />
              )}
              <span className="uppercase">
                {progressPct >= 100 ? 'CREW TASKS COMPLETED' : 'TOTAL TASKS COMPLETED'}
              </span>
            </span>

            <span className="tabular-nums font-extrabold text-emerald-200 ml-2">
              {total > 0 ? `${completed} / ${total} (${progressPct}%)` : `${progressPct}%`}
            </span>
          </div>
        </div>

        {/* Sub-bar Quick Status Indicator */}
        <div className="flex items-center justify-between px-1.5 pt-1 text-[9px] font-bold tracking-wider text-slate-400">
          <span className="flex items-center space-x-1">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                progressPct >= 100
                  ? 'bg-yellow-400 animate-ping'
                  : isSurging
                  ? 'bg-emerald-400 animate-ping'
                  : 'bg-emerald-500'
              }`}
            />
            <span>
              {progressPct >= 100
                ? 'VICTORY CONDITION MET'
                : isImpostor
                ? 'CREW PROGRESS · PREVENT COMPLETION'
                : `${remaining} TASK${remaining === 1 ? '' : 'S'} REMAINING TO WIN`}
            </span>
          </span>

          <span className="flex items-center space-x-0.5 text-slate-400 hover:text-slate-200">
            <span>{showDetails ? 'LESS' : 'DETAILS'}</span>
            {showDetails ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
          </span>
        </div>
      </div>

      {/* Expandable Collective Task Breakdown Drawer */}
      {showDetails && (
        <div className="mt-1.5 p-2.5 rounded-xl bg-slate-900/95 backdrop-blur-md border border-slate-700 shadow-2xl text-xs text-slate-300 space-y-2 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center justify-between text-[11px] font-black border-b border-slate-800 pb-1.5">
            <span className="text-white uppercase tracking-wider flex items-center space-x-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Collective Crew Progress</span>
            </span>
            <span className="text-emerald-400 font-extrabold tabular-nums">
              {progressPct}% Done
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="p-2 rounded-lg bg-slate-800/60 border border-slate-700/60 flex flex-col">
              <span className="text-slate-400 font-medium">Completed Tasks</span>
              <span className="text-base font-black text-white tabular-nums">{completed}</span>
            </div>
            <div className="p-2 rounded-lg bg-slate-800/60 border border-slate-700/60 flex flex-col">
              <span className="text-slate-400 font-medium">Remaining to Win</span>
              <span className="text-base font-black text-emerald-400 tabular-nums">
                {remaining}
              </span>
            </div>
          </div>

          <div className="text-[10px] text-slate-400 pt-1 leading-relaxed border-t border-slate-800/80">
            {isImpostor ? (
              <span className="text-rose-300">
                &bull; Impostor intel: Eliminate crewmates or execute critical sabotages before this bar fills to 100%. Fake tasks do not advance this bar.
              </span>
            ) : (
              <span className="text-cyan-300">
                &bull; Crewmate directive: Every finished mini-game or task step advances this shared gauge. When 100% is reached, the Crew immediately wins the match.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
