/**
 * Impostor Protocol - Game View
 * Connects the 3D game scene, server snapshots, the HUD and the full-screen overlays
 * (role reveal, meetings, ejection, game over). All actions go through the server.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GAME_STATES, GameSettings } from '../../shared/constants';
import { GameOverInfo, GameStateSnapshot, SabotageType } from '../../shared/events';
import { net } from '../net';
import { soundEngine } from '../audio';
import { CameraViewMode } from '../render/cameraController';
import { GameScene, InteractionContext } from '../render/gameScene';
import { GameHud } from './gameHud';
import { GameOverOverlay, MeetingOverlay, RoleReveal } from './gameOverlays';
import { CommsFixGame, LightsFixGame, O2FixGame, ReactorFixGame } from './sabotageGames';
import { TaskGame } from './taskGames';

interface GameViewProps {
  settings: GameSettings;
  onLeave: () => void;
}

const EMPTY_CTX: InteractionContext = {
  taskId: null,
  taskName: null,
  taskHold: 0,
  taskStep: 0,
  taskTotalSteps: 1,
  killTargetId: null,
  reportBodyId: null,
  ventId: null,
  emergency: false,
  canUseCameras: false,
  sabotagePartId: null,
  sabotageType: null,
};

export interface WorkState {
  taskId: string;
  name: string;
  hold: number; // minimum seconds before the server will accept completion
  step: number;
  totalSteps: number;
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
  const sabotageActive = !!snapshot?.sabotage;
  const [ctx, setCtx] = useState<InteractionContext>(EMPTY_CTX);
  const [work, setWork] = useState<WorkState | null>(null);
  const [showHitboxes, setShowHitboxes] = useState<boolean>(false);
  const [isViewingCameras, setIsViewingCameras] = useState<boolean>(false);
  const [activeCameraIndex, setActiveCameraIndex] = useState<number>(0);
  const [activeSabotageGame, setActiveSabotageGame] = useState<{ partId: number; type: SabotageType } | null>(null);
  const [gameOver, setGameOver] = useState<GameOverInfo | null>(null);
  const workRef = useRef<WorkState | null>(null);
  workRef.current = work;

  const socketId = net.getSocketId() || '';

  useEffect(() => {
    soundEngine.setSabotageAlarm(sabotageActive);
    return () => soundEngine.setSabotageAlarm(false);
  }, [sabotageActive]);

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

  // The 2D mini-game reports success; we still respect the server's minimum task time.
  const completeWork = useCallback(() => {
    const w = workRef.current;
    if (!w) return;
    soundEngine.playTaskComplete();
    const wait = Math.max(0, w.hold * 1000 - (performance.now() - w.startedAt) + 150);
    window.setTimeout(() => {
      net.completeTaskStep(w.taskId);
    }, wait);
    stopWork(false);
  }, [stopWork]);

  // Meetings, game over or leaving the station cancel any task in progress.
  useEffect(() => {
    if (work && snapshot && snapshot.state !== GAME_STATES.PLAYING) stopWork(false);
    if (snapshot && snapshot.state !== GAME_STATES.PLAYING) sceneRef.current?.clearInput();
  }, [snapshot, work, stopWork]);

  const you = snapshot?.you;
  const me = snapshot?.players[socketId];
  const playing = snapshot?.state === GAME_STATES.PLAYING;

  const handleToggleSecurityCameras = useCallback(() => {
    if (!sceneRef.current) return;
    const next = sceneRef.current.toggleSecurityCameras();
    setIsViewingCameras(next);
  }, []);

  const handleSelectCameraFeed = useCallback((idx: number) => {
    if (!sceneRef.current) return;
    sceneRef.current.setSecurityCameraFeed(idx);
    setActiveCameraIndex(idx);
  }, []);

  useEffect(() => {
    if (isViewingCameras && snapshot && snapshot.state !== GAME_STATES.PLAYING) {
      sceneRef.current?.toggleSecurityCameras(false);
      setIsViewingCameras(false);
    }
    if (activeSabotageGame && snapshot && snapshot.state !== GAME_STATES.PLAYING) {
      setActiveSabotageGame(null);
    }
  }, [snapshot, isViewingCameras, activeSabotageGame]);

  const handleRepairSabotage = useCallback(() => {
    if (ctx.sabotagePartId && ctx.sabotageType) {
      setActiveSabotageGame({ partId: ctx.sabotagePartId, type: ctx.sabotageType });
    }
  }, [ctx.sabotagePartId, ctx.sabotageType]);

  // ---- Actions ----
  const doUse = useCallback(() => {
    if (!playing || !you || you.ventId) return;
    if (ctx.sabotagePartId && ctx.sabotageType) {
      handleRepairSabotage();
      return;
    }
    if (ctx.emergency) {
      net.callEmergency();
      return;
    }
    if (ctx.canUseCameras) {
      handleToggleSecurityCameras();
      return;
    }
    if (ctx.taskId && !workRef.current) {
      net.useTask(ctx.taskId);
      setWork({
        taskId: ctx.taskId,
        name: ctx.taskName || 'Task',
        hold: ctx.taskHold,
        step: ctx.taskStep,
        totalSteps: ctx.taskTotalSteps,
        startedAt: performance.now(),
      });
      if (sceneRef.current) sceneRef.current.movementLocked = true;
    }
  }, [playing, you, ctx, handleRepairSabotage, handleToggleSecurityCameras]);

  const doReport = useCallback(() => {
    if (playing && ctx.reportBodyId) net.reportBody(ctx.reportBodyId);
  }, [playing, ctx.reportBodyId]);

  const doKill = useCallback(() => {
    if (playing && you && you.killCooldownMs <= 0 && ctx.killTargetId) net.kill(ctx.killTargetId);
  }, [playing, you, ctx.killTargetId]);

  const doVent = useCallback(() => {
    if (!playing || !you || (you.role !== 'impostor' && you.role !== 'engineer')) return;
    soundEngine.playVentClank();
    if (you.ventId) {
      net.ventExit();
    } else if (ctx.ventId) {
      net.ventEnter(ctx.ventId);
      sceneRef.current?.teleportToVent(ctx.ventId);
    }
  }, [playing, you, ctx.ventId]);

  const handleVentMove = useCallback((destId: string) => {
    if (!playing || !you || !you.ventId) return;
    soundEngine.playVentWhoosh();
    sceneRef.current?.teleportToVent(destId);
    net.ventMove(destId);
  }, [playing, you]);

  const handleToggleHitboxes = useCallback(() => {
    if (sceneRef.current) {
      const active = sceneRef.current.toggleWireframeHitboxes();
      setShowHitboxes(active);
    }
  }, []);

  const handleToggleCamera = useCallback(() => {
    if (sceneRef.current) setCameraMode(sceneRef.current.cameraController.toggleViewMode());
  }, []);

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (e.repeat) return;

      // In CCTV surveillance camera view
      if (isViewingCameras) {
        if (e.code === 'Escape' || e.code === 'KeyE') {
          e.preventDefault();
          handleToggleSecurityCameras();
          return;
        }
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          e.preventDefault();
          handleSelectCameraFeed((activeCameraIndex - 1 + 4) % 4);
          return;
        }
        if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          e.preventDefault();
          handleSelectCameraFeed((activeCameraIndex + 1) % 4);
          return;
        }
        if (e.code === 'Digit1') { e.preventDefault(); handleSelectCameraFeed(0); return; }
        if (e.code === 'Digit2') { e.preventDefault(); handleSelectCameraFeed(1); return; }
        if (e.code === 'Digit3') { e.preventDefault(); handleSelectCameraFeed(2); return; }
        if (e.code === 'Digit4') { e.preventDefault(); handleSelectCameraFeed(3); return; }
      }

      // In-vent fast traversal shortcuts

      // In-vent fast traversal shortcuts
      if (you?.ventId && you.ventLinks && you.ventLinks.length > 0) {
        if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
          e.preventDefault();
          handleVentMove(you.ventLinks[0].id);
          return;
        }
        if (e.code === 'KeyD' || e.code === 'ArrowRight') {
          e.preventDefault();
          const target = you.ventLinks.length > 1 ? you.ventLinks[1].id : you.ventLinks[0].id;
          handleVentMove(target);
          return;
        }
        if (e.code === 'Digit1' && you.ventLinks[0]) {
          e.preventDefault();
          handleVentMove(you.ventLinks[0].id);
          return;
        }
        if (e.code === 'Digit2' && you.ventLinks[1]) {
          e.preventDefault();
          handleVentMove(you.ventLinks[1].id);
          return;
        }
        if (e.code === 'Digit3' && you.ventLinks[2]) {
          e.preventDefault();
          handleVentMove(you.ventLinks[2].id);
          return;
        }
      }

      if (e.code === 'KeyE' || e.code === 'Space') {
        if (e.code === 'Space') e.preventDefault();
        if (ctx.sabotagePartId && ctx.sabotageType) {
          handleRepairSabotage();
        } else {
          doUse();
        }
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        doReport();
      } else if (e.code === 'KeyQ') {
        e.preventDefault();
        doKill();
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        doVent();
      } else if (e.code === 'KeyH') {
        e.preventDefault();
        handleToggleHitboxes();
      }
      // Escape is handled by the open task window itself
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doUse, doReport, doKill, doVent, handleRepairSabotage, handleToggleHitboxes, handleVentMove, stopWork, you, ctx.sabotagePartId, ctx.sabotageType]);

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
        showHitboxes={showHitboxes}
        onToggleHitboxes={handleToggleHitboxes}
        isViewingCameras={isViewingCameras}
        activeCameraIndex={activeCameraIndex}
        onToggleSecurityCameras={handleToggleSecurityCameras}
        onSelectCameraFeed={handleSelectCameraFeed}
        onLeave={handleLeaveMatch}
        playerPos={playerPos}
        snapshot={snapshot}
        ctx={ctx}
        work={work}
        onUse={doUse}
        onReport={doReport}
        onKill={doKill}
        onVent={doVent}
        onVentMove={handleVentMove}
        onSetWaypoint={(x, z) => sceneRef.current?.setWaypoint(x, z)}
        onCancelWork={() => stopWork(true)}
        onRepairSabotage={handleRepairSabotage}
        onJoystick={handleJoystick}
        onCameraSettings={handleCameraSettings}
      />

      {/* Interactive Sabotage Repair Minigame Modal */}
      {activeSabotageGame && playing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 pointer-events-auto">
          {activeSabotageGame.type === 'lights' && (
            <LightsFixGame
              partId={activeSabotageGame.partId}
              onResolve={() => {
                net.fixSabotage(activeSabotageGame.partId);
                setActiveSabotageGame(null);
              }}
              onClose={() => setActiveSabotageGame(null)}
            />
          )}
          {activeSabotageGame.type === 'reactor' && (
            <ReactorFixGame
              partId={activeSabotageGame.partId}
              onResolve={() => {
                net.fixSabotage(activeSabotageGame.partId);
                setActiveSabotageGame(null);
              }}
              onClose={() => setActiveSabotageGame(null)}
            />
          )}
          {activeSabotageGame.type === 'o2' && (
            <O2FixGame
              partId={activeSabotageGame.partId}
              onResolve={() => {
                net.fixSabotage(activeSabotageGame.partId);
                setActiveSabotageGame(null);
              }}
              onClose={() => setActiveSabotageGame(null)}
            />
          )}
          {activeSabotageGame.type === 'comms' && (
            <CommsFixGame
              partId={activeSabotageGame.partId}
              onResolve={() => {
                net.fixSabotage(activeSabotageGame.partId);
                setActiveSabotageGame(null);
              }}
              onClose={() => setActiveSabotageGame(null)}
            />
          )}
        </div>
      )}

      {work && playing && (
        <TaskGame
          taskId={work.taskId}
          name={work.name}
          step={work.step}
          totalSteps={work.totalSteps}
          onComplete={completeWork}
          onClose={() => stopWork(true)}
        />
      )}

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
