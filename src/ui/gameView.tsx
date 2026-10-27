/**
 * Impostor Protocol - Game View
 * Connects the 3D game scene, server snapshots, the HUD and the full-screen overlays
 * (role reveal, meetings, ejection, game over). All actions go through the server.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GAME_STATES, GameSettings } from '../../shared/constants';
import { BodyDiscoveredPayload, GameOverInfo, GameStateSnapshot } from '../../shared/events';
import { soundEngine } from '../audio';
import { net } from '../net';
import { CameraViewMode } from '../render/cameraController';
import { GameScene, InteractionContext } from '../render/gameScene';
import { proximityVoice } from '../audio/proximityVoice';
import { GameHud } from './gameHud';
import { VoiceHud } from './voiceHud';
import {
  AdminMapOverlay,
  BreakerPanelOverlay,
  GameOverOverlay,
  MeetingOverlay,
  O2KeypadOverlay,
  ReactorPanelOverlay,
  RoleReveal,
  SabotageMapOverlay,
  SecurityCamerasOverlay,
} from './gameOverlays';
import {
  ClearAsteroidsModal,
  FixWiringModal,
  GenericTaskModal,
  SwipeCardModal,
  UnlockManifoldsModal,
} from './taskMiniGames';

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
  adminConsole: false,
  securityConsole: false,
  breakerPanel: false,
  reactorHandpad: null,
  o2Keypad: null,
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

  const [showSabotageMap, setShowSabotageMap] = useState(false);
  const [showAdminMap, setShowAdminMap] = useState(false);
  const [showSecurityCams, setShowSecurityCams] = useState(false);
  const [showBreakerPanel, setShowBreakerPanel] = useState(false);
  const [showReactorPanel, setShowReactorPanel] = useState<'top' | 'bottom' | null>(null);
  const [showO2Keypad, setShowO2Keypad] = useState<'o2' | 'admin' | null>(null);
  const [discoveredBodyAlert, setDiscoveredBodyAlert] = useState<BodyDiscoveredPayload | null>(null);

  const socketId = net.getSocketId() || '';

  useEffect(() => {
    if (!mountRef.current) return;
    const scene = new GameScene(mountRef.current, settingsRef.current, socketId, (room) => setCurrentRoom(room));
    sceneRef.current = scene;

    let lastReact = 0;
    const unsubSnapshot = net.onSnapshot((s: GameStateSnapshot) => {
      scene.handleSnapshot(s);
      proximityVoice.syncActivePeers(Object.keys(s.players));
      const myP = s.players[socketId];
      const amAlive = myP ? myP.isAlive : true;
      proximityVoice.updateSpatialPositions(
        { x: scene.localPos.x, z: scene.localPos.z },
        s.players,
        amAlive,
        s.state === GAME_STATES.MEETING
      );

      const now = performance.now();
      // React re-renders at ~10 Hz; the 3D scene gets every snapshot.
      if (now - lastReact > 90 || s.state !== GAME_STATES.PLAYING) {
        lastReact = now;
        setSnapshot(s);
      }
      if (s.state === GAME_STATES.MEETING || s.state === GAME_STATES.GAME_OVER) {
        setDiscoveredBodyAlert(null);
        soundEngine.setAmbientVolume?.(0.12);
      } else if (s.state === GAME_STATES.PLAYING) {
        soundEngine.setAmbientVolume?.(0.45);
      }
    });
    const unsubOver = net.onGameOver((g) => setGameOver(g));
    const unsubDiscovery = net.onBodyDiscovered((payload) => {
      setDiscoveredBodyAlert(payload);
      soundEngine.playBodyDiscoveredSting();
    });

    const timer = setInterval(() => {
      setPlayerPos({ x: scene.localPos.x, z: scene.localPos.z });
      setCtx(scene.computeContext());

      if (scene.latest) {
        const myP = scene.latest.players[socketId];
        const amAlive = myP ? myP.isAlive : true;
        proximityVoice.updateSpatialPositions(
          { x: scene.localPos.x, z: scene.localPos.z },
          scene.latest.players,
          amAlive,
          scene.latest.state === GAME_STATES.MEETING
        );
      }
    }, 100);

    return () => {
      unsubSnapshot();
      unsubOver();
      unsubDiscovery();
      clearInterval(timer);
      proximityVoice.dispose();
      scene.dispose();
      sceneRef.current = null;
    };
  }, [socketId]);

  // Auto-dismiss body discovery banner after 6.5s
  useEffect(() => {
    if (!discoveredBodyAlert) return;
    const t = setTimeout(() => setDiscoveredBodyAlert(null), 6500);
    return () => clearTimeout(t);
  }, [discoveredBodyAlert]);

  // ---- Task work (hold at a station) ----
  const stopWork = useCallback((notifyServer: boolean) => {
    if (notifyServer) net.cancelTask();
    setWork(null);
    if (sceneRef.current) sceneRef.current.movementLocked = false;
  }, []);

  // Task completion is driven interactively by the player completing the 2D mini-game modals

  // Meetings, game over or leaving the station cancel any task in progress and close modals.
  useEffect(() => {
    if (snapshot && snapshot.state !== GAME_STATES.PLAYING) {
      if (work) stopWork(false);
      sceneRef.current?.clearInput();
      setShowSabotageMap(false);
      setShowAdminMap(false);
      setShowSecurityCams(false);
      setShowBreakerPanel(false);
      setShowReactorPanel(null);
      setShowO2Keypad(null);
    }
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
    if (ctx.breakerPanel) {
      setShowBreakerPanel(true);
      return;
    }
    if (ctx.reactorHandpad) {
      setShowReactorPanel(ctx.reactorHandpad);
      return;
    }
    if (ctx.o2Keypad) {
      setShowO2Keypad(ctx.o2Keypad);
      return;
    }
    if (ctx.adminConsole) {
      setShowAdminMap(true);
      return;
    }
    if (ctx.securityConsole) {
      setShowSecurityCams(true);
      return;
    }
    if (ctx.taskId && !workRef.current) {
      net.useTask(ctx.taskId);
      setWork({ taskId: ctx.taskId, name: ctx.taskName || 'Task', hold: ctx.taskHold, startedAt: performance.now() });
      if (sceneRef.current) sceneRef.current.movementLocked = true;
    }
  }, [playing, you, ctx]);

  const doReport = useCallback(() => {
    if (playing && ctx.reportBodyId) {
      soundEngine.playReportSting();
      net.reportBody(ctx.reportBodyId);
    }
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
      else if (e.code === 'KeyC') setCameraMode(sceneRef.current?.cameraController.mode ?? 'third_person');
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
        onOpenSabotage={() => setShowSabotageMap(true)}
        discoveredBodyAlert={discoveredBodyAlert}
        onDismissDiscovery={() => setDiscoveredBodyAlert(null)}
      />

      <VoiceHud snapshot={snapshot} />

      {showSabotageMap && snapshot && (
        <SabotageMapOverlay snapshot={snapshot} onClose={() => setShowSabotageMap(false)} />
      )}
      {showAdminMap && snapshot && (
        <AdminMapOverlay snapshot={snapshot} onClose={() => setShowAdminMap(false)} />
      )}
      {showSecurityCams && snapshot && (
        <SecurityCamerasOverlay snapshot={snapshot} onClose={() => setShowSecurityCams(false)} />
      )}
      {showBreakerPanel && snapshot && (
        <BreakerPanelOverlay snapshot={snapshot} onClose={() => setShowBreakerPanel(false)} />
      )}
      {showReactorPanel && snapshot && (
        <ReactorPanelOverlay pad={showReactorPanel} snapshot={snapshot} onClose={() => setShowReactorPanel(null)} />
      )}
      {showO2Keypad && snapshot && (
        <O2KeypadOverlay pad={showO2Keypad} snapshot={snapshot} onClose={() => setShowO2Keypad(null)} />
      )}

      {/* Interactive 2D Task Mini-Games */}
      {work && (
        work.taskId === 'fix_wiring' || work.name.toLowerCase().includes('wiring') ? (
          <FixWiringModal
            taskName={work.name}
            onComplete={() => {
              net.completeTaskStep(work.taskId);
              stopWork(false);
            }}
            onClose={() => stopWork(true)}
          />
        ) : work.taskId === 'swipe_card' || work.name.toLowerCase().includes('card') || work.name.toLowerCase().includes('swipe') ? (
          <SwipeCardModal
            taskName={work.name}
            onComplete={() => {
              net.completeTaskStep(work.taskId);
              stopWork(false);
            }}
            onClose={() => stopWork(true)}
          />
        ) : work.taskId === 'clear_asteroids' || work.name.toLowerCase().includes('asteroid') ? (
          <ClearAsteroidsModal
            taskName={work.name}
            onComplete={() => {
              net.completeTaskStep(work.taskId);
              stopWork(false);
            }}
            onClose={() => stopWork(true)}
          />
        ) : work.taskId === 'unlock_manifolds' || work.name.toLowerCase().includes('manifold') ? (
          <UnlockManifoldsModal
            taskName={work.name}
            onComplete={() => {
              net.completeTaskStep(work.taskId);
              stopWork(false);
            }}
            onClose={() => stopWork(true)}
          />
        ) : (
          <GenericTaskModal
            taskName={work.name}
            holdSeconds={work.hold || 3}
            onComplete={() => {
              net.completeTaskStep(work.taskId);
              stopWork(false);
            }}
            onClose={() => stopWork(true)}
          />
        )
      )}

      {snapshot?.state === GAME_STATES.ROLE_REVEAL && <RoleReveal snapshot={snapshot} />}
      {snapshot?.state === GAME_STATES.MEETING && <MeetingOverlay snapshot={snapshot} />}
      {gameOver && snapshot?.state === GAME_STATES.GAME_OVER && <GameOverOverlay info={gameOver} />}
      {me && !me.isAlive && playing && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 px-5 py-2 rounded-2xl bg-purple-950/90 backdrop-blur-md border border-purple-500/50 text-purple-200 text-xs font-black tracking-widest shadow-[0_0_20px_rgba(168,85,247,0.3)] pointer-events-none flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
          <span>
            {you?.role === 'impostor'
              ? '👻 GHOST MODE · NOCLIP THROUGH WALLS ENABLED · HAUNT CHAT ONLY'
              : '👻 GHOST MODE · NOCLIP THROUGH WALLS ENABLED · COMPLETE TASKS TO ADVANCE METER'}
          </span>
        </div>
      )}
    </div>
  );
};
