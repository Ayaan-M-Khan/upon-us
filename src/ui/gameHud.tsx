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
  Boxes,
  Wrench,
} from 'lucide-react';
import { GAME_STATES } from '../../shared/constants';
import { GameStateSnapshot } from '../../shared/events';
import { MAP_BOUNDS, MAP_CORRIDORS, MAP_ROOMS_DETAIL, MAP_VENTS, SECURITY_CAMERAS } from '../../shared/mapData';
import { soundEngine } from '../audio';
import { net } from '../net';
import { CameraViewMode } from '../render/cameraController';
import { InteractionContext } from '../render/gameScene';
import { SabotageModal } from './sabotageModal';
import type { WorkState } from './gameView';

interface GameHudProps {
  currentRoom: string;
  cameraMode: CameraViewMode;
  onToggleCamera: () => void;
  showHitboxes?: boolean;
  onToggleHitboxes?: () => void;
  isViewingCameras?: boolean;
  activeCameraIndex?: number;
  onToggleSecurityCameras?: () => void;
  onSelectCameraFeed?: (index: number) => void;
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
  onRepairSabotage?: () => void;
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

const SecurityCCTVOverlay: React.FC<{
  activeCameraIndex: number;
  onSelectFeed: (idx: number) => void;
  onClose: () => void;
  snapshot: GameStateSnapshot | null;
}> = ({ activeCameraIndex, onSelectFeed, onClose, snapshot }) => {
  const [recTimer, setRecTimer] = useState(0);
  const currentCam = SECURITY_CAMERAS[activeCameraIndex] || SECURITY_CAMERAS[0];

  useEffect(() => {
    const interval = setInterval(() => {
      setRecTimer((t) => t + 0.1);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Find living crewmates and corpses currently in this camera's coverage sector
  const detectedActors: Array<{ name: string; isAlive: boolean }> = [];
  if (snapshot?.players) {
    for (const p of Object.values(snapshot.players)) {
      if (!p.inVent && p.x >= currentCam.zone.minX && p.x <= currentCam.zone.maxX &&
          p.z >= currentCam.zone.minZ && p.z <= currentCam.zone.maxZ) {
        detectedActors.push({ name: p.name, isAlive: p.isAlive });
      }
    }
  }

  const mins = Math.floor(recTimer / 60).toString().padStart(2, '0');
  const secs = Math.floor(recTimer % 60).toString().padStart(2, '0');
  const tenths = Math.floor((recTimer * 10) % 10);

  return (
    <div className="fixed inset-0 z-50 pointer-events-auto flex flex-col justify-between p-3 sm:p-6 bg-transparent select-none">
      {/* CRT Scanline & Phosphor Vignette Filter */}
      <div
        className="absolute inset-0 pointer-events-none z-10 opacity-35"
        style={{
          background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.45) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.04), rgba(0, 255, 0, 0.01), rgba(0, 0, 255, 0.04))',
          backgroundSize: '100% 4px, 6px 100%',
        }}
      />
      <div className="absolute inset-0 pointer-events-none z-10 shadow-[inset_0_0_120px_rgba(0,0,0,0.85)] border-4 border-slate-900/90 rounded-2xl" />

      {/* TOP CCTV BAR */}
      <div className="relative z-20 flex items-center justify-between bg-slate-950/85 backdrop-blur-md border border-slate-800 rounded-2xl px-4 py-3 shadow-2xl">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 bg-red-950/80 border border-red-700/60 px-3 py-1 rounded-full">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-mono font-bold text-red-300">REC [{mins}:{secs}.{tenths}]</span>
          </div>
          <div className="hidden sm:flex items-center space-x-2 text-slate-400 font-mono text-xs">
            <span className="text-emerald-400 font-bold">● LIVE FEED</span>
            <span>// THE SKELD CCTV SURVEILLANCE</span>
          </div>
        </div>

        {/* Camera Switcher Tabs */}
        <div className="flex items-center space-x-1.5 overflow-x-auto max-w-[55vw] py-1">
          {SECURITY_CAMERAS.map((cam, idx) => (
            <button
              key={cam.id}
              onClick={() => onSelectFeed(idx)}
              className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center space-x-1.5 ${
                activeCameraIndex === idx
                  ? 'bg-emerald-500 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.5)] scale-105'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>{cam.name}</span>
            </button>
          ))}
        </div>

        {/* Exit Button */}
        <button
          onClick={onClose}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-red-600/90 hover:bg-red-500 text-white font-black text-xs transition-all cursor-pointer shadow-lg active:scale-95"
        >
          <X className="w-4 h-4" />
          <span className="hidden sm:inline">EXIT [ESC]</span>
        </button>
      </div>

      {/* Comms Sabotage Static Signal Loss Overlay */}
      {snapshot?.sabotage?.commsDisabled && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md text-center p-6 select-none pointer-events-none">
          <AlertTriangle className="w-16 h-16 text-red-500 animate-pulse mb-3" />
          <h2 className="text-2xl sm:text-3xl font-mono font-black text-red-400 tracking-widest uppercase">
            COMMUNICATIONS OFFLINE
          </h2>
          <p className="text-xs sm:text-sm font-mono text-slate-300 mt-2 max-w-md">
            SURVEILLANCE SATELLITE DOWNLINK JAMMED. REPAIR COMMUNICATIONS RELAY TO RESTORE VIDEO FEEDS.
          </p>
        </div>
      )}

      {/* CENTER HUD RETICLE & CAMERA WATERMARK */}
      <div className="relative z-20 flex-1 flex flex-col justify-between py-6 pointer-events-none">
        <div className="flex items-center justify-between px-4">
          <div className="bg-slate-950/75 border border-emerald-500/40 px-3 py-1.5 rounded-xl text-emerald-400 font-mono text-xs space-y-0.5">
            <div className="font-bold tracking-wider">{currentCam.name} // {currentCam.sector.toUpperCase()}</div>
            <div className="text-[10px] text-slate-400">FPS: 30.0 • OPTICAL ZOOM: 1.0X • NIGHTVISION ACTIVE</div>
          </div>
          <div className="text-right text-[11px] font-mono text-slate-400 bg-slate-950/75 border border-slate-800 px-3 py-1 rounded-xl">
            CORRIDOR SECURITY FEED
          </div>
        </div>

        {/* Crosshair / Viewfinder Corner Brackets */}
        <div className="relative w-48 h-48 sm:w-64 sm:h-64 mx-auto border-2 border-emerald-500/20 rounded-3xl flex items-center justify-center">
          <div className="w-6 h-6 border-t-2 border-l-2 border-emerald-400 absolute -top-1 -left-1" />
          <div className="w-6 h-6 border-t-2 border-r-2 border-emerald-400 absolute -top-1 -right-1" />
          <div className="w-6 h-6 border-b-2 border-l-2 border-emerald-400 absolute -bottom-1 -left-1" />
          <div className="w-6 h-6 border-b-2 border-r-2 border-emerald-400 absolute -bottom-1 -right-1" />
          <span className="text-[10px] font-mono text-emerald-500/60 uppercase tracking-widest">+ MONITORING +</span>
        </div>

        {/* Sector Detection Readout */}
        <div className="px-4">
          <div className="inline-flex flex-col bg-slate-950/80 border border-slate-800 rounded-2xl p-3 min-w-[240px] pointer-events-auto">
            <div className="flex items-center space-x-2 text-xs font-mono font-bold text-slate-300 pb-1.5 border-b border-slate-800">
              <span className={`w-2 h-2 rounded-full ${detectedActors.length > 0 ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`} />
              <span>SECTOR RADAR DETECTION</span>
            </div>
            {detectedActors.length === 0 ? (
              <div className="text-[11px] font-mono text-slate-500 pt-2 flex items-center space-x-1.5">
                <span>SECTOR SECURE • NO CREWMATE MOVEMENT</span>
              </div>
            ) : (
              <div className="space-y-1.5 pt-2">
                {detectedActors.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs font-mono">
                    <span className="text-white font-bold">{p.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-700/60 text-emerald-300 font-bold">
                      {p.isAlive ? 'IN SECTOR' : 'CORPSE DETECTED'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BOTTOM CCTV CONTROLS BAR */}
      <div className="relative z-20 flex items-center justify-between bg-slate-950/85 backdrop-blur-md border border-slate-800 rounded-2xl px-4 py-2.5 shadow-2xl">
        <div className="text-xs font-mono text-slate-400">
          SHORTCUTS: <span className="text-cyan-300 font-bold">[1-4]</span> SELECT CAM • <span className="text-cyan-300 font-bold">[A / D]</span> CYCLE • <span className="text-cyan-300 font-bold">[ESC]</span> EXIT
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => onSelectFeed((activeCameraIndex - 1 + SECURITY_CAMERAS.length) % SECURITY_CAMERAS.length)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs cursor-pointer"
          >
            ◀ PREV CAM
          </button>
          <button
            onClick={() => onSelectFeed((activeCameraIndex + 1) % SECURITY_CAMERAS.length)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs cursor-pointer"
          >
            NEXT CAM ▶
          </button>
        </div>
      </div>
    </div>
  );
};

const ventLabel = (id: string): string => MAP_VENTS.find((v) => v.id === id)?.room || id;

export const GameHud: React.FC<GameHudProps> = ({
  currentRoom,
  cameraMode,
  onToggleCamera,
  showHitboxes = false,
  onToggleHitboxes,
  isViewingCameras = false,
  activeCameraIndex = 0,
  onToggleSecurityCameras,
  onSelectCameraFeed,
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
  onRepairSabotage,
  onJoystick,
  onCameraSettings,
}) => {
  const [showMap, setShowMap] = useState(false);
  const [showSabotageModal, setShowSabotageModal] = useState(false);
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

  // Key listeners for Map (M/Tab), Sabotage (C), Camera Toggle (V), and Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (e.code === 'KeyM' || e.code === 'Tab') {
        e.preventDefault();
        soundEngine.playClick();
        setShowMap((prev) => !prev);
      } else if (e.code === 'KeyC') {
        if (isImpostor && playing && alive && !inVent) {
          e.preventDefault();
          soundEngine.playClick();
          setShowSabotageModal((prev) => !prev);
        }
      } else if (e.code === 'KeyV') {
        e.preventDefault();
        soundEngine.playClick();
        onToggleCamera();
      } else if (e.code === 'Escape') {
        setShowMap(false);
        setShowSettings(false);
        setShowSabotageModal(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isImpostor, playing, alive, inVent, onToggleCamera]);

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
                {snapshot?.sabotage?.commsDisabled && !isImpostor ? (
                  <div className="text-red-400 font-mono text-xs py-1.5 flex items-center space-x-1.5 animate-pulse">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>COMMS OFFLINE: SENSORS BLIND</span>
                  </div>
                ) : (
                  <>
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
                  </>
                )}
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

        {/* ACTIVE SABOTAGE TOP ALERT BANNER */}
        {snapshot?.sabotage && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 w-[92vw] max-w-xl bg-red-950/95 border-2 border-red-500 px-4 py-2 rounded-2xl shadow-[0_0_35px_rgba(239,68,68,0.6)] flex items-center justify-between text-white pointer-events-auto">
            <div className="flex items-center space-x-2.5">
              <AlertTriangle className="w-6 h-6 text-red-400 shrink-0 animate-pulse" />
              <div className="text-left">
                <div className="text-xs sm:text-sm font-black tracking-wider uppercase text-red-200">
                  {snapshot.sabotage.type === 'reactor' && 'CRITICAL: REACTOR MELTDOWN!'}
                  {snapshot.sabotage.type === 'o2' && 'CRITICAL: O2 DEPLETION!'}
                  {snapshot.sabotage.type === 'lights' && 'POWER FAILURE: SHIP LIGHTS OFFLINE!'}
                  {snapshot.sabotage.type === 'comms' && 'COMMUNICATIONS JAMMED!'}
                </div>
                <div className="text-[10px] text-red-300/80 font-bold">
                  {snapshot.sabotage.type === 'reactor' && 'Stabilize manifolds in Reactor room'}
                  {snapshot.sabotage.type === 'o2' && 'Enter emergency PIN in O2 & Admin'}
                  {snapshot.sabotage.type === 'lights' && 'Reset breaker switches in Electrical'}
                  {snapshot.sabotage.type === 'comms' && 'Realign radio frequency in Comms'}
                </div>
              </div>
            </div>
            {snapshot.sabotage.isCritical && (
              <div className="text-xl sm:text-2xl font-mono font-black text-red-400 bg-red-900/80 border border-red-500 px-3 py-1 rounded-xl shrink-0">
                {snapshot.sabotage.remainingSecs}s
              </div>
            )}
          </div>
        )}

        {/* Right: Hitbox wireframe, Map, camera, settings, exit */}
        <div className="flex items-center space-x-2 pointer-events-auto">
          <button
            onClick={() => {
              soundEngine.playClick();
              onToggleHitboxes?.();
            }}
            className={`p-2.5 rounded-2xl backdrop-blur-md border-2 transition-all cursor-pointer shadow-xl flex items-center space-x-1.5 ${
              showHitboxes
                ? 'bg-emerald-500 border-emerald-300 text-slate-950 font-black shadow-[0_0_15px_rgba(52,211,153,0.5)]'
                : 'bg-slate-900/85 hover:bg-slate-800 border-slate-700/80 text-emerald-400'
            }`}
            title="Toggle Visual Hitbox Wireframes (H key)"
          >
            <Boxes className="w-5 h-5" />
            <span className="text-xs font-black tracking-wider hidden sm:inline">
              {showHitboxes ? 'HITBOX: ON' : 'HITBOX'}
            </span>
          </button>
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

      {/* Floating Hitbox Wireframe Debug Telemetry Bar */}
      {showHitboxes && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 border-2 border-emerald-500/80 px-4 py-1.5 rounded-full shadow-[0_4px_25px_rgba(16,185,129,0.35)] flex items-center space-x-3 text-xs font-black tracking-wider text-emerald-300 animate-fadeIn pointer-events-auto">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
          <span className="shrink-0">WIREFRAME HITBOXES ACTIVE</span>
          <span className="text-slate-500 font-bold">•</span>
          <span className="text-white font-mono shrink-0">
            [{playerPos.x.toFixed(1)}, {playerPos.z.toFixed(1)}]
          </span>
          <span className="text-slate-500 font-bold hidden md:inline">•</span>
          <span className="text-emerald-400 font-bold hidden md:inline">WALLS</span>
          <span className="text-yellow-400 font-bold hidden md:inline">MACHINERY</span>
          <span className="text-cyan-400 font-bold hidden md:inline">PLAYER</span>
          <span className="px-2 py-0.5 rounded-md bg-slate-800 text-[10px] text-slate-300 font-bold shrink-0">
            [H] TOGGLE
          </span>
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
            <div><strong className="text-cyan-300">WASD / Arrows:</strong> Walk • <strong className="text-yellow-300">Shift:</strong> Sprint</div>
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
                hint="[C]"
                enabled={!!playing && alive && !inVent && (snapshot?.you?.sabotageCooldownSecs ?? 0) <= 0 && !snapshot?.sabotage}
                badge={(snapshot?.you?.sabotageCooldownSecs ?? 0) > 0 ? String(snapshot?.you?.sabotageCooldownSecs) : undefined}
                onClick={() => setShowSabotageModal(true)}
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
            {ctx.sabotagePartId ? (
              <ActionButton
                tone="report"
                label="REPAIR"
                hint="[E]"
                enabled={!!playing && alive && !inVent}
                onClick={onRepairSabotage || onUse}
                icon={<Wrench className="w-7 h-7 mb-0.5 text-yellow-300 animate-bounce" />}
              />
            ) : (
              <ActionButton
                tone="use"
                label={ctx.emergency ? 'EMERGENCY' : (ctx.canUseCameras ? 'CAMERAS' : 'USE')}
                hint="[E]"
                enabled={!!playing && !inVent && !work && (ctx.emergency || !!ctx.taskId || !!ctx.canUseCameras)}
                onClick={() => {
                  if (ctx.canUseCameras) {
                    onToggleSecurityCameras?.();
                  } else {
                    onUse();
                  }
                }}
                icon={ctx.canUseCameras ? <Video className="w-7 h-7 mb-0.5 text-emerald-400" /> : <Hand className="w-7 h-7 mb-0.5" />}
              />
            )}
          </div>
        </div>
      </div>

      {/* SECURITY CCTV SURVEILLANCE OVERLAY */}
      {isViewingCameras && (
        <SecurityCCTVOverlay
          activeCameraIndex={activeCameraIndex}
          onSelectFeed={onSelectCameraFeed || (() => {})}
          onClose={onToggleSecurityCameras || (() => {})}
          snapshot={snapshot}
        />
      )}

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
                    {/* outline pass, then fill pass, so chamfered rooms have no inner seams */}
                    {r.rects.map((b, i) => (
                      <rect key={`o${i}`} x={b.minX - 0.3} y={b.minZ - 0.3} width={b.maxX - b.minX + 0.6} height={b.maxZ - b.minZ + 0.6} fill={r.color} />
                    ))}
                    {r.rects.map((b, i) => (
                      <rect key={`f${i}`} x={b.minX} y={b.minZ} width={b.maxX - b.minX} height={b.maxZ - b.minZ} fill={r.floorHex} />
                    ))}
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

      {/* Impostor Sabotage Grid Modal */}
      {showSabotageModal && (
        <SabotageModal
          cooldownSecs={snapshot?.you?.sabotageCooldownSecs ?? 0}
          activeSabotageType={snapshot?.sabotage?.type}
          lockedRooms={snapshot?.doorLocks}
          onClose={() => setShowSabotageModal(false)}
        />
      )}
    </div>
  );
};
