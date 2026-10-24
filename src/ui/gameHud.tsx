/**
 * Impostor Protocol - In-Game HUD & Map Overlay
 * Floating room banner, camera view toggle (V key), schematic map (Tab/M), and action buttons.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Map as MapIcon,
  Video,
  Settings,
  Eye,
  LogOut,
  Hand,
  Megaphone,
  Skull,
  Wind,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { GAME_STATES } from '../../shared/constants';
import { GameStateSnapshot } from '../../shared/events';
import { MAP_BOUNDS, MAP_CORRIDORS, MAP_ROOMS_DETAIL, MAP_VENTS } from '../../shared/mapData';
import { soundEngine } from '../audio';
import { net } from '../net';
import { CameraViewMode } from '../render/cameraController';
import { InteractionContext } from '../render/gameScene';
import type { WorkState } from './gameView';

interface GameHudProps {
  currentRoom: string;
  cameraMode: CameraViewMode;
  onToggleCamera: () => void;
  onLeave: () => void;
  playerPos: { x: number; z: number };
  snapshot: GameStateSnapshot | null;
  ctx: InteractionContext;
  work: WorkState | null;
  onUse: () => void;
  onReport: () => void;
  onKill: () => void;
  onVent: () => void;
  onVentMove: (ventId: string) => void;
  onCancelWork: () => void;
  onJoystick: (x: number, y: number) => void;
  onCameraSettings?: (sensitivityPct: number, headBob: boolean) => void;
}

/** Round Among-Us-style action button. */
const ActionButton: React.FC<{
  label: string;
  hint?: string;
  enabled: boolean;
  onClick: () => void;
  tone: 'use' | 'report' | 'kill' | 'vent' | 'sabotage';
  icon: React.ReactNode;
  badge?: string;
  title?: string;
}> = ({ label, hint, enabled, onClick, tone, icon, badge, title }) => {
  const tones: Record<string, string> = {
    use: 'from-cyan-500 to-blue-600 border-cyan-300 shadow-[0_8px_20px_rgba(6,182,212,0.4)]',
    report: 'from-amber-400 to-orange-500 border-amber-200 shadow-[0_8px_20px_rgba(245,158,11,0.4)]',
    kill: 'from-red-500 to-red-700 border-red-300 shadow-[0_8px_20px_rgba(239,68,68,0.45)]',
    vent: 'from-slate-500 to-slate-700 border-slate-300 shadow-[0_8px_20px_rgba(100,116,139,0.4)]',
    sabotage: 'from-rose-600 to-red-900 border-rose-300 shadow-[0_8px_20px_rgba(190,18,60,0.4)]',
  };
  return (
    <button
      disabled={!enabled}
      title={title}
      onClick={() => {
        soundEngine.playClick();
        onClick();
      }}
      className={`relative flex flex-col items-center justify-center w-[4.5rem] h-[4.5rem] sm:w-20 sm:h-20 rounded-3xl font-black border-2 transition-all ${
        enabled
          ? `bg-gradient-to-br ${tones[tone]} text-white cursor-pointer active:scale-95`
          : 'bg-slate-900/80 border-slate-700 text-slate-500 cursor-not-allowed opacity-70'
      }`}
    >
      {icon}
      <span className="text-[11px] tracking-wider leading-tight">{label}</span>
      {hint && <span className="text-[9px] opacity-70 leading-none">{hint}</span>}
      {badge && (
        <span className="absolute -top-2 -right-2 min-w-[1.4rem] h-6 px-1 rounded-full bg-slate-950 border-2 border-slate-600 text-[11px] text-white flex items-center justify-center">
          {badge}
        </span>
      )}
    </button>
  );
};

/** Touch joystick (only shown on coarse pointers). */
const Joystick: React.FC<{ onChange: (x: number, y: number) => void }> = ({ onChange }) => {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef(false);

  const update = (clientX: number, clientY: number) => {
    const rect = baseRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = (clientX - cx) / (rect.width / 2);
    let dy = (clientY - cy) / (rect.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    setKnob({ x: dx, y: dy });
    onChange(dx, dy);
  };
  const end = () => {
    active.current = false;
    setKnob({ x: 0, y: 0 });
    onChange(0, 0);
  };
  // Make sure a joystick can never stay "held" if the component unmounts or focus is lost.
  useEffect(() => {
    window.addEventListener('blur', end);
    return () => {
      window.removeEventListener('blur', end);
      onChange(0, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={baseRef}
      className="relative w-28 h-28 rounded-full bg-slate-900/50 border-2 border-slate-600/70 touch-none pointer-events-auto"
      onPointerDown={(e) => {
        active.current = true;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => active.current && update(e.clientX, e.clientY)}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      <div
        className="absolute w-12 h-12 rounded-full bg-cyan-400/70 border-2 border-cyan-200"
        style={{ left: `calc(50% - 1.5rem + ${knob.x * 2}rem)`, top: `calc(50% - 1.5rem + ${knob.y * 2}rem)` }}
      />
    </div>
  );
};

const ventLabel = (id: string): string => MAP_VENTS.find((v) => v.id === id)?.room || id;

export const GameHud: React.FC<GameHudProps> = ({
  currentRoom,
  cameraMode,
  onToggleCamera,
  onLeave,
  playerPos,
  snapshot,
  ctx,
  work,
  onUse,
  onReport,
  onKill,
  onVent,
  onVentMove,
  onCancelWork,
  onJoystick,
  onCameraSettings,
}) => {
  const [showMap, setShowMap] = useState(false);
  const [showTasks, setShowTasks] = useState(true);
  const [now, setNow] = useState(performance.now());
  useEffect(() => {
    if (!work) return;
    const id = setInterval(() => setNow(performance.now()), 50);
    return () => clearInterval(id);
  }, [work]);

  const you = snapshot?.you;
  const isImpostor = you?.role === 'impostor';
  const playing = snapshot?.state === GAME_STATES.PLAYING;
  const alive = snapshot?.players[(net.getSocketId() || '')]?.isAlive ?? true;
  const inVent = !!you?.ventId;
  const killReady = !!you && you.killCooldownMs <= 0;
  const progress = Math.round((snapshot?.taskProgress || 0) * 100);
  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  const [showSettings, setShowSettings] = useState(false);

  // Settings
  const [sensitivity, setSensitivity] = useState(50);
  const [headBob, setHeadBob] = useState(true);
  useEffect(() => {
    onCameraSettings?.(sensitivity, headBob);
  }, [sensitivity, headBob, onCameraSettings]);

  // Key listeners for M/Tab (Map)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (e.code === 'KeyM' || e.code === 'Tab') {
        e.preventDefault();
        soundEngine.playClick();
        setShowMap((prev) => !prev);
      }
      if (e.code === 'Escape') {
        setShowMap(false);
        setShowSettings(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const workPct = work ? Math.min(100, ((now - work.startedAt) / (work.hold * 1000)) * 100) : 0;
  const myTasks = you?.tasks || [];
  const cooldownSecs = you ? Math.ceil(you.killCooldownMs / 1000) : 0;

  return (
    <div className="absolute inset-0 pointer-events-none select-none z-20 flex flex-col justify-between p-4">
      {/* TOP BAR */}
      <div className="w-full flex items-start justify-between">
        {/* Left: task progress bar + task list (like the original) */}
        <div className="pointer-events-auto w-60 sm:w-72">
          <div className="relative h-6 rounded-md bg-slate-900/85 border-2 border-slate-600 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-500" style={{ width: `${progress}%` }} />
            <div className="absolute inset-0 flex items-center justify-center text-[11px] font-black tracking-widest text-white drop-shadow">
              TOTAL TASKS COMPLETED
            </div>
          </div>
          <div className="mt-1.5 rounded-xl bg-slate-900/80 border border-slate-700 backdrop-blur-md overflow-hidden">
            <button
              onClick={() => setShowTasks((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-black tracking-widest text-slate-200 cursor-pointer"
            >
              <span>{isImpostor ? 'FAKE TASKS' : 'TASKS'}</span>
              {showTasks ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showTasks && (
              <div className="px-3 pb-2 space-y-0.5 text-[12px] font-bold">
                {myTasks.length === 0 && <div className="text-slate-500">No tasks</div>}
                {myTasks.map((t) => (
                  <div
                    key={t.taskId}
                    className={t.done ? 'text-green-400 line-through' : t.step > 0 ? 'text-yellow-300' : 'text-white'}
                  >
                    {t.room}: {t.name}
                    {t.totalSteps > 1 ? ` (${Math.min(t.step, t.totalSteps)}/${t.totalSteps})` : ''}
                  </div>
                ))}
              </div>
            )}
          </div>
          {you && (
            <div
              className={`mt-1.5 inline-block px-3 py-1 rounded-full text-[11px] font-black tracking-widest border ${
                isImpostor ? 'bg-red-950/80 border-red-500 text-red-300' : 'bg-cyan-950/80 border-cyan-500 text-cyan-300'
              }`}
            >
              {isImpostor ? 'IMPOSTOR' : 'CREWMATE'}
              {isImpostor && you.teammates.length > 0 ? ` • with ${you.teammates.map((t) => t.name).join(', ')}` : ''}
            </div>
          )}
        </div>

        {/* Center: room banner */}
        <div className="flex flex-col items-center">
          <div className="bg-slate-900/90 backdrop-blur-md px-6 py-2 rounded-2xl border-2 border-slate-700/90 shadow-2xl flex items-center space-x-2.5">
            <div className="w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(56,189,248,0.8)] animate-pulse" />
            <span className="text-base sm:text-lg font-black tracking-widest uppercase text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-sky-100">
              {currentRoom}
            </span>
          </div>
        </div>

        {/* Right: Map, camera, settings, exit */}
        <div className="flex items-center space-x-2 pointer-events-auto">
          <button
            onClick={() => {
              soundEngine.playClick();
              setShowMap((prev) => !prev);
            }}
            className={`p-2.5 rounded-2xl backdrop-blur-md border-2 transition-all cursor-pointer shadow-xl flex items-center space-x-2 ${
              showMap ? 'bg-cyan-500 border-cyan-300 text-slate-950 font-black' : 'bg-slate-900/85 hover:bg-slate-800 border-slate-700/80 text-cyan-300'
            }`}
            title="Toggle Map (Tab / M)"
          >
            <MapIcon className="w-5 h-5" />
            <span className="text-xs font-black tracking-wider hidden sm:inline">MAP</span>
          </button>
          <button
            onClick={() => {
              soundEngine.playClick();
              onToggleCamera();
            }}
            className="p-2.5 rounded-2xl bg-slate-900/85 hover:bg-slate-800 backdrop-blur-md border-2 border-slate-700/80 text-slate-200 hover:text-white transition-all cursor-pointer shadow-xl"
            title="Toggle First / Third Person (V key)"
          >
            {cameraMode === 'third_person' ? <Eye className="w-5 h-5 text-cyan-400" /> : <Video className="w-5 h-5 text-yellow-400" />}
          </button>
          <button
            onClick={() => {
              soundEngine.playClick();
              setShowSettings(true);
            }}
            className="p-2.5 rounded-2xl bg-slate-900/85 hover:bg-slate-800 backdrop-blur-md border-2 border-slate-700/80 text-slate-300 hover:text-white transition-all shadow-xl cursor-pointer"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
          <button
            onClick={onLeave}
            className="p-2.5 rounded-2xl bg-red-950/85 hover:bg-red-900 backdrop-blur-md border-2 border-red-700/80 text-red-200 hover:text-white transition-all shadow-xl cursor-pointer"
            title="Leave Match"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Task progress ("hold to work") */}
      {work && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-32 w-72 pointer-events-auto">
          <div className="bg-slate-900/90 border-2 border-yellow-400 rounded-2xl p-3 shadow-2xl">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-black text-yellow-300">{work.name}</span>
              <button onClick={onCancelWork} className="text-[11px] font-black text-slate-300 hover:text-white cursor-pointer">
                CANCEL [Esc]
              </button>
            </div>
            <div className="h-3 rounded-full bg-slate-700 overflow-hidden">
              <div className="h-full bg-yellow-400" style={{ width: `${workPct}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Vent navigation */}
      {inVent && you && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-32 pointer-events-auto">
          <div className="bg-slate-900/90 border-2 border-slate-500 rounded-2xl p-3 shadow-2xl flex items-center space-x-2">
            <span className="text-xs font-black text-slate-300 mr-1">IN VENT</span>
            {you.ventLinks.map((v) => (
              <button
                key={v.id}
                onClick={() => onVentMove(v.id)}
                className="px-3 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-xs font-black cursor-pointer"
              >
                → {ventLabel(v.id)}
              </button>
            ))}
            <button onClick={onVent} className="px-3 py-2 rounded-xl bg-red-700 hover:bg-red-600 text-white text-xs font-black cursor-pointer">
              EXIT [F]
            </button>
          </div>
        </div>
      )}

      {/* BOTTOM */}
      <div className="w-full flex items-end justify-between">
        <div className="flex flex-col items-start space-y-2">
          {coarse && <Joystick onChange={onJoystick} />}
          <div className="bg-slate-900/80 backdrop-blur-md p-3 rounded-2xl border border-slate-800 text-xs text-slate-400 font-medium hidden md:block">
            <div><strong className="text-cyan-300">WASD / Arrows:</strong> Walk</div>
            <div><strong className="text-cyan-300">Mouse Drag:</strong> Orbit Camera</div>
            <div><strong className="text-cyan-300">E / Space:</strong> Use • <strong className="text-cyan-300">R:</strong> Report</div>
            {isImpostor && <div><strong className="text-red-300">Q:</strong> Kill • <strong className="text-red-300">F:</strong> Vent</div>}
            <div><strong className="text-cyan-300">V:</strong> 1st/3rd Person • <strong className="text-cyan-300">Tab / M:</strong> Map</div>
          </div>
        </div>

        {/* Bottom-right action buttons, laid out like the original */}
        <div className="flex flex-col items-end space-y-3 pointer-events-auto ml-auto">
          <div className="flex items-center space-x-3">
            {isImpostor && (
              <ActionButton
                tone="sabotage"
                label="SABOTAGE"
                enabled={false}
                title="Sabotages are not implemented yet"
                onClick={() => {}}
                icon={<AlertTriangle className="w-7 h-7 mb-0.5" />}
              />
            )}
            <ActionButton
              tone="report"
              label="REPORT"
              hint="[R]"
              enabled={!!playing && alive && !!ctx.reportBodyId && !inVent}
              onClick={onReport}
              icon={<Megaphone className="w-7 h-7 mb-0.5" />}
            />
          </div>
          <div className="flex items-center space-x-3">
            {isImpostor && (
              <>
                <ActionButton
                  tone="vent"
                  label={inVent ? 'EXIT' : 'VENT'}
                  hint="[F]"
                  enabled={!!playing && alive && (inVent || !!ctx.ventId)}
                  onClick={onVent}
                  icon={<Wind className="w-7 h-7 mb-0.5" />}
                />
                <ActionButton
                  tone="kill"
                  label="KILL"
                  hint="[Q]"
                  enabled={!!playing && alive && !inVent && killReady && !!ctx.killTargetId}
                  badge={!killReady && cooldownSecs > 0 ? String(cooldownSecs) : undefined}
                  onClick={onKill}
                  icon={<Skull className="w-7 h-7 mb-0.5" />}
                />
              </>
            )}
            <ActionButton
              tone="use"
              label={ctx.emergency ? 'EMERGENCY' : 'USE'}
              hint="[E]"
              enabled={!!playing && !inVent && !work && (ctx.emergency || !!ctx.taskId)}
              onClick={onUse}
              icon={<Hand className="w-7 h-7 mb-0.5" />}
            />
          </div>
        </div>
      </div>

      {/* FULL SCHEMATIC MAP MODAL (Tab / M) */}
      {showMap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 pointer-events-auto">
          <div className="relative w-full max-w-5xl bg-slate-950 border-2 border-cyan-500/80 rounded-3xl p-5 shadow-2xl flex flex-col space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center space-x-2">
                <MapIcon className="w-6 h-6 text-cyan-400" />
                <h3 className="text-xl font-black text-cyan-300 tracking-wider">THE SKELD • SHIP MAP</h3>
              </div>
              <button
                onClick={() => setShowMap(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative w-full bg-slate-900/90 rounded-2xl border-2 border-slate-800 p-2 overflow-hidden">
              <svg
                viewBox={`${MAP_BOUNDS.minX} ${MAP_BOUNDS.minZ} ${MAP_BOUNDS.maxX - MAP_BOUNDS.minX} ${MAP_BOUNDS.maxZ - MAP_BOUNDS.minZ}`}
                className="w-full h-auto max-h-[70vh]"
              >
                {MAP_CORRIDORS.map((c) => (
                  <rect
                    key={c.id}
                    x={c.bounds.minX}
                    y={c.bounds.minZ}
                    width={c.bounds.maxX - c.bounds.minX}
                    height={c.bounds.maxZ - c.bounds.minZ}
                    fill="#334155"
                    opacity="0.9"
                  />
                ))}
                {MAP_ROOMS_DETAIL.map((r) => (
                  <g key={r.id}>
                    <rect
                      x={r.bounds.minX}
                      y={r.bounds.minZ}
                      width={r.bounds.maxX - r.bounds.minX}
                      height={r.bounds.maxZ - r.bounds.minZ}
                      fill={r.floorHex}
                      stroke={r.color}
                      strokeWidth="0.5"
                      opacity="0.95"
                    />
                    <text
                      x={r.labelPos.x}
                      y={r.labelPos.z}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="#ffffff"
                      fontSize="2.3"
                      fontWeight="bold"
                      fontFamily="Fredoka, sans-serif"
                    >
                      {r.name}
                    </text>
                  </g>
                ))}

                {/* Impostors can see vents on the map */}
                {isImpostor &&
                  MAP_VENTS.map((v) => <rect key={v.id} x={v.x - 0.8} y={v.z - 0.8} width="1.6" height="1.6" fill="#ef4444" opacity="0.9" />)}

                {/* Task locations (yellow) */}
                {myTasks
                  .filter((t) => !t.done)
                  .map((t) => (
                    <g key={t.taskId}>
                      <circle cx={t.x} cy={t.z} r="1.2" fill="#facc15" stroke="#422006" strokeWidth="0.3" />
                      <text x={t.x} y={t.z} textAnchor="middle" dominantBaseline="central" fontSize="1.6" fontWeight="bold" fill="#422006">!</text>
                    </g>
                  ))}

                {/* You */}
                <circle cx={playerPos.x} cy={playerPos.z} r="1.5" fill="#ffffff" stroke="#0ea5e9" strokeWidth="0.6" />
                <circle cx={playerPos.x} cy={playerPos.z} r="2.8" fill="none" stroke="#ffffff" strokeWidth="0.3" opacity="0.8" />
              </svg>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center space-x-4">
                <span className="flex items-center space-x-1.5"><span className="w-3 h-3 rounded-full bg-white inline-block" /><span className="font-bold text-white">You</span></span>
                <span className="flex items-center space-x-1.5"><span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" /><span className="font-bold text-yellow-300">Task</span></span>
                {isImpostor && <span className="flex items-center space-x-1.5"><span className="w-3 h-3 bg-red-500 inline-block" /><span className="font-bold text-red-300">Vent</span></span>}
              </div>
              <span>Press [Tab] or [M] to close</span>
            </div>
          </div>
        </div>
      )}

      {/* COMFORT & CAMERA SETTINGS MODAL */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 pointer-events-auto">
          <div className="w-full max-w-md bg-slate-900 border-2 border-slate-700 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-xl font-black text-white">CAMERA & COMFORT</h3>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs font-bold text-slate-300 mb-1">
                  <span>CAMERA SENSITIVITY</span>
                  <span>{sensitivity}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={sensitivity}
                  onChange={(e) => setSensitivity(parseInt(e.target.value))}
                  className="w-full accent-cyan-400"
                />
              </div>

              <div className="flex items-center justify-between bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-xs font-bold text-slate-300">
                <span>FIRST-PERSON HEAD BOB</span>
                <button
                  onClick={() => setHeadBob(!headBob)}
                  className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    headBob ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {headBob ? 'ENABLED' : 'DISABLED'}
                </button>
              </div>

              <div className="flex items-center justify-between bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-xs font-bold text-slate-300">
                <span>CAMERA MODE</span>
                <button
                  onClick={onToggleCamera}
                  className="px-3 py-1 rounded-lg font-bold bg-cyan-600 text-white cursor-pointer"
                >
                  {cameraMode === 'third_person' ? '3RD PERSON' : '1ST PERSON'}
                </button>
              </div>
            </div>

            <button
              onClick={() => setShowSettings(false)}
              className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl cursor-pointer"
            >
              APPLY & RESUME
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
