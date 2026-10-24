/**
 * Impostor Protocol - Game View
 * Connects the 3D game scene, server snapshots, the HUD and the full-screen overlays
 * (role reveal, meetings, ejection, game over). All actions go through the server.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GAME_STATES, GameSettings } from '../../shared/constants';
import { GameOverInfo, GameStateSnapshot } from '../../shared/events';
import { net } from '../net';
import { CameraViewMode } from '../render/cameraController';
import { GameScene, InteractionContext } from '../render/gameScene';
import { GameHud } from './gameHud';
import { GameOverOverlay, MeetingOverlay, RoleReveal } from './gameOverlays';

interface GameViewProps {
  settings: GameSettings;
  onLeave: () => void;
}

const EMPTY_CTX: InteractionContext = {
  taskId: null,
  taskName: null,
  taskHold: 0,
  killTargetId: null,
  reportBodyId: null,
  ventId: null,
  emergency: false,
};

export interface WorkState {
  taskId: string;
  name: string;
  hold: number;
  startedAt: number;
}

export const GameView: React.FC<GameViewProps> = ({ settings, onLeave }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<GameScene | null>(null);
  // The lobby re-sends its settings object often; keep it in a ref so the 3D scene is built once.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const [currentRoom, setCurrentRoom] = useState<string>('Cafeteria');
  const [cameraMode, setCameraMode] = useState<CameraViewMode>('third_person');
  const [playerPos, setPlayerPos] = useState<{ x: number; z: number }>({ x: 0, z: -22 });
  const [snapshot, setSnapshot] = useState<GameStateSnapshot | null>(null);
  const [ctx, setCtx] = useState<InteractionContext>(EMPTY_CTX);
  const [work, setWork] = useState<WorkState | null>(null);
  const [gameOver, setGameOver] = useState<GameOverInfo | null>(null);
  const workRef = useRef<WorkState | null>(null);
  workRef.current = work;

  const socketId = net.getSocketId() || '';

  useEffect(() => {
    if (!mountRef.current) return;
    const scene = new GameScene(mountRef.current, settingsRef.current, socketId, (room) => setCurrentRoom(room));
    sceneRef.current = scene;

    let lastReact = 0;
    const unsubSnapshot = net.onSnapshot((s: GameStateSnapshot) => {
      scene.handleSnapshot(s);
      const now = performance.now();
      // React re-renders at ~10 Hz; the 3D scene gets every snapshot.
      if (now - lastReact > 90 || s.state !== GAME_STATES.PLAYING) {
        lastReact = now;
        setSnapshot(s);
      }
    });
    const unsubOver = net.onGameOver((g) => setGameOver(g));

    const timer = setInterval(() => {
      setPlayerPos({ x: scene.localPos.x, z: scene.localPos.z });
      setCtx(scene.computeContext());
    }, 100);

    return () => {
      unsubSnapshot();
      unsubOver();
      clearInterval(timer);
      scene.dispose();
      sceneRef.current = null;
    };
  }, [socketId]);

  // ---- Task work (hold at a station) ----
  const stopWork = useCallback((notifyServer: boolean) => {
    if (notifyServer) net.cancelTask();
    setWork(null);
    if (sceneRef.current) sceneRef.current.movementLocked = false;
  }, []);

  useEffect(() => {
    if (!work) return;
    const id = setInterval(() => {
      const w = workRef.current;
      if (!w) return;
      if (performance.now() - w.startedAt >= w.hold * 1000) {
        net.completeTaskStep(w.taskId);
        stopWork(false);
      }
    }, 50);
    return () => clearInterval(id);
  }, [work, stopWork]);

  // Meetings, game over or leaving the station cancel any task in progress.
  useEffect(() => {
    if (work && snapshot && snapshot.state !== GAME_STATES.PLAYING) stopWork(false);
    if (snapshot && snapshot.state !== GAME_STATES.PLAYING) sceneRef.current?.clearInput();
  }, [snapshot, work, stopWork]);

  const you = snapshot?.you;
  const me = snapshot?.players[socketId];
  const playing = snapshot?.state === GAME_STATES.PLAYING;

  // ---- Actions ----
  const doUse = useCallback(() => {
    if (!playing || !you || you.ventId) return;
    if (ctx.emergency) {
      net.callEmergency();
      return;
    }
    if (ctx.taskId && !workRef.current) {
      net.useTask(ctx.taskId);
      setWork({ taskId: ctx.taskId, name: ctx.taskName || 'Task', hold: ctx.taskHold, startedAt: performance.now() });
      if (sceneRef.current) sceneRef.current.movementLocked = true;
    }
  }, [playing, you, ctx]);

  const doReport = useCallback(() => {
    if (playing && ctx.reportBodyId) net.reportBody(ctx.reportBodyId);
  }, [playing, ctx.reportBodyId]);

  const doKill = useCallback(() => {
    if (playing && you && you.killCooldownMs <= 0 && ctx.killTargetId) net.kill(ctx.killTargetId);
  }, [playing, you, ctx.killTargetId]);

  const doVent = useCallback(() => {
    if (!playing || !you || you.role !== 'impostor') return;
    if (you.ventId) net.ventExit();
    else if (ctx.ventId) net.ventEnter(ctx.ventId);
  }, [playing, you, ctx.ventId]);

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (e.repeat) return;
      if (e.code === 'KeyE' || e.code === 'Space') {
        if (e.code === 'Space') e.preventDefault();
        doUse();
      } else if (e.code === 'KeyR') doReport();
      else if (e.code === 'KeyQ') doKill();
      else if (e.code === 'KeyF') doVent();
      else if (e.code === 'Escape' && workRef.current) stopWork(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doUse, doReport, doKill, doVent, stopWork]);

  const handleToggleCamera = () => {
    if (sceneRef.current) setCameraMode(sceneRef.current.cameraController.toggleViewMode());
  };

  const handleLeaveMatch = () => {
    net.leaveLobby();
    onLeave();
  };

  const handleCameraSettings = useCallback((sensitivityPct: number, headBob: boolean) => {
    const cam = sceneRef.current?.cameraController;
    if (!cam) return;
    cam.sensitivity = 0.005 * (sensitivityPct / 50);
    cam.enableHeadBob = headBob;
  }, []);

  const handleJoystick = (x: number, y: number) => sceneRef.current?.setJoystick(x, y);

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950">
      {/* 3D WebGL Canvas */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      <GameHud
        currentRoom={currentRoom}
        cameraMode={cameraMode}
        onToggleCamera={handleToggleCamera}
        onLeave={handleLeaveMatch}
        playerPos={playerPos}
        snapshot={snapshot}
        ctx={ctx}
        work={work}
        onUse={doUse}
        onReport={doReport}
        onKill={doKill}
        onVent={doVent}
        onVentMove={(id) => net.ventMove(id)}
        onCancelWork={() => stopWork(true)}
        onJoystick={handleJoystick}
        onCameraSettings={handleCameraSettings}
      />

      {snapshot?.state === GAME_STATES.ROLE_REVEAL && <RoleReveal snapshot={snapshot} />}
      {snapshot?.state === GAME_STATES.MEETING && <MeetingOverlay snapshot={snapshot} />}
      {gameOver && snapshot?.state === GAME_STATES.GAME_OVER && <GameOverOverlay info={gameOver} />}
      {me && !me.isAlive && playing && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 px-4 py-1.5 rounded-full bg-slate-800/80 text-slate-300 text-xs font-black tracking-widest pointer-events-none">
          {you?.role === 'impostor' ? '👻 YOU ARE A GHOST' : '👻 YOU ARE A GHOST — FINISH YOUR TASKS TO HELP THE CREW'}
        </div>
      )}
    </div>
  );
};
