/**
 * Impostor Protocol - Lobby Room UI & 3D Dropship Waiting Scene
 * Live color picker, hats, host controls, real-time game settings sync, and player list.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Copy,
  Check,
  Crown,
  UserX,
  Play,
  LogOut,
  Sliders,
  Palette,
  Users,
  Settings,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Info,
} from 'lucide-react';
import {
  GameSettings,
  MIN_PLAYERS_TO_START,
  MAX_PLAYERS_PER_LOBBY,
  PLAYER_COLORS,
  PLAYER_HATS,
} from '../../shared/constants';
import { LobbyData, LobbyPlayer } from '../../shared/events';
import { net } from '../net';
import { soundEngine } from '../audio';
import { DropshipLobbyScene } from '../render/dropshipLobby';
import { ChatOverlay } from './chatOverlay';
import { LobbySettingsUI } from './lobbySettingsUI';

interface LobbyProps {
  onLeave: () => void;
}

export const LobbyView: React.FC<LobbyProps> = ({ onLeave }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<DropshipLobbyScene | null>(null);

  const [lobby, setLobby] = useState<LobbyData | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeTab, setActiveTab] = useState<'customize' | 'players' | 'settings'>('customize');
  const [dockExpanded, setDockExpanded] = useState(false);
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const [errorMessage, setErrorMessage] = useState('');
  const [startingCount, setStartingCount] = useState<number | null>(null);

  const socketId = net.getSocketId();
  const localPlayer = lobby?.players.find((p) => p.id === socketId);
  const isHost = localPlayer?.isHost || false;

  // Initialize 3D scene & network hooks
  useEffect(() => {
    soundEngine.startShipHum();

    if (mountRef.current && !sceneRef.current) {
      sceneRef.current = new DropshipLobbyScene(mountRef.current);
    }

    const unsubLobby = net.onLobbyState((state) => {
      setLobby(state);
      if (state && sceneRef.current && socketId) {
        sceneRef.current.updateLobbyState(state, socketId);
      }
    });

    const unsubMove = net.onMovement((players) => {
      if (sceneRef.current) {
        sceneRef.current.updateRemoteMovements(players);
      }
    });

    const unsubStarting = net.onStarting((countdown) => {
      setStartingCount(countdown);
      soundEngine.playCountdownBeep(countdown === 1);
    });

    const unsubError = net.onError((msg) => {
      setErrorMessage(msg);
      setTimeout(() => setErrorMessage(''), 4000);
    });

    return () => {
      soundEngine.stopShipHum();
      unsubLobby();
      unsubMove();
      unsubStarting();
      unsubError();
      if (sceneRef.current) {
        sceneRef.current.dispose();
        sceneRef.current = null;
      }
    };
  }, [socketId]);

  // Keep 3D scene synced when lobby updates
  useEffect(() => {
    if (lobby && sceneRef.current && socketId) {
      sceneRef.current.updateLobbyState(lobby, socketId);
    }
  }, [lobby, socketId]);

  const copyCode = () => {
    if (!lobby) return;
    soundEngine.playClick();
    navigator.clipboard.writeText(lobby.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const copyLink = () => {
    if (!lobby) return;
    soundEngine.playClick();
    const url = `${window.location.origin}/?join=${lobby.code}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleSelectColor = (colorId: string) => {
    if (localPlayer?.colorId === colorId) return;
    // Check if color is taken
    const isTaken = lobby?.players.some((p) => p.id !== socketId && p.colorId === colorId);
    if (isTaken) return;

    soundEngine.playColorSelect();
    net.setColor(colorId);
  };

  const handleSelectHat = (hatId: string) => {
    if (localPlayer?.hatId === hatId) return;
    soundEngine.playClick();
    net.setHat(hatId);
  };

  const handleUpdateSetting = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => {
    if (!isHost || !lobby) return;
    soundEngine.playClick();
    net.updateSettings({ [key]: value });
  };

  const handleKick = (targetId: string) => {
    if (!isHost) return;
    soundEngine.playClick();
    net.kickPlayer(targetId);
  };

  const handleStartGame = () => {
    if (!isHost) return;
    soundEngine.playClick();
    net.startGame();
  };

  const handleStartTestGame = () => {
    if (!isHost) return;
    soundEngine.playClick();
    net.startTestGame();
  };

  const handleLeave = () => {
    soundEngine.playClick();
    net.leaveLobby();
    onLeave();
  };

  const updateStick = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    let x = (event.clientX - rect.left - rect.width / 2) / (rect.width / 2);
    let y = (event.clientY - rect.top - rect.height / 2) / (rect.height / 2);
    const length = Math.max(1, Math.hypot(x, y));
    x /= length;
    y /= length;
    setStick({ x, y });
    sceneRef.current?.setJoystick(x, y);
  };
  const releaseStick = () => {
    setStick({ x: 0, y: 0 });
    sceneRef.current?.setJoystick(0, 0);
  };

  const humanCount = lobby?.players.length || 0;
  const botFill = lobby?.settings.fillWithBots !== false;
  const botsToAdd = botFill ? Math.max(0, MIN_PLAYERS_TO_START - humanCount) : 0;
  const canStartNormal = humanCount >= 1 && (botFill || humanCount >= MIN_PLAYERS_TO_START);

  return (
    <div className="relative w-full h-full select-none overflow-hidden bg-[#080d19] text-white">
      {/* 3D Scene Viewport */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* TOP HEADER DOCK */}
      <div className="absolute top-3 left-3 right-3 sm:top-5 sm:left-6 sm:right-6 z-20 flex items-start justify-between gap-2 pointer-events-none">
        {/* Lobby Code & Share Pills */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="flex items-center gap-2 sm:gap-3 bg-black/90 backdrop-blur-md px-3 sm:px-5 py-2.5 rounded-2xl border-[3px] border-white shadow-[5px_5px_0_rgba(0,0,0,0.7)]">
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-slate-300">LOBBY CODE</span>
            <span className="text-lg sm:text-2xl font-black tracking-widest text-yellow-300 font-mono">
              {lobby?.code || '-----'}
            </span>
            <button
              onClick={copyCode}
              className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white transition-all cursor-pointer flex items-center space-x-1 focus-visible:ring-2 focus-visible:ring-yellow-300"
              title="Copy Room Code"
            >
              {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          <button
            onClick={copyLink}
            className="flex items-center space-x-1.5 bg-[#1675c5] hover:bg-[#258be0] px-3 py-3 rounded-2xl border-[3px] border-white shadow-[4px_4px_0_#050914] text-xs font-black text-white transition-all cursor-pointer pointer-events-auto focus-visible:ring-2 focus-visible:ring-yellow-300"
            title="Copy Invite Link"
          >
            {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Sparkles className="w-4 h-4" />}
            <span className="hidden sm:inline">INVITE LINK</span>
          </button>
        </div>

        {/* Players Count & Leave Button */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="flex items-center gap-2 bg-black/90 backdrop-blur-md px-3 sm:px-4 py-2.5 rounded-2xl border-[3px] border-white shadow-[4px_4px_0_#050914]">
            <Users className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-black text-slate-200">
              {lobby?.players.length || 1}/{lobby?.settings.maxPlayers || MAX_PLAYERS_PER_LOBBY}
            </span>
          </div>

          <button
            onClick={handleLeave}
            className="p-2.5 rounded-2xl bg-red-700 hover:bg-red-600 border-[3px] border-white text-white transition-all shadow-[4px_4px_0_#050914] cursor-pointer"
            title="Leave Lobby"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* In-world waiting state: visible without covering the 3D crewmates. */}
      <div className="absolute top-[5.5rem] sm:top-5 left-1/2 -translate-x-1/2 z-10 w-[min(92vw,22rem)] pointer-events-none text-center">
        <div className="inline-block rounded-2xl border-[3px] border-white bg-black/85 px-4 py-2 shadow-[4px_4px_0_#050914]">
          <div className="text-[10px] font-black tracking-[0.2em] text-yellow-300">THE DROPSHIP</div>
          <div className="text-sm font-black tracking-wide text-white">
            {isHost ? "YOU'RE THE HOST — START WHEN READY!" : 'WAITING FOR THE HOST TO START'}
          </div>
        </div>
      </div>

      {/* Mobile movement controls (the lobby scene already supports joystick input). */}
      {!dockExpanded && (
        <div
          aria-label="Move crewmate"
          role="group"
          className="sm:hidden absolute left-4 bottom-36 z-20 w-28 h-28 touch-none pointer-events-auto rounded-full border-[3px] border-white/80 bg-black/60 shadow-[4px_4px_0_#050914]"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            updateStick(event);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) updateStick(event);
          }}
          onPointerUp={releaseStick}
          onPointerCancel={releaseStick}
          onLostPointerCapture={releaseStick}
        >
          <div className="absolute top-1/2 left-1/2 w-12 h-12 rounded-full border-[3px] border-white bg-cyan-500 shadow-lg"
            style={{ transform: `translate(calc(-50% + ${stick.x * 26}px), calc(-50% + ${stick.y * 26}px))` }} />
        </div>
      )}

      {/* COUNTDOWN SPLASH */}
      {startingCount !== null && startingCount > 0 && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md animate-fadeIn">
          <h2 className="text-2xl font-black tracking-widest text-cyan-400 uppercase">GAME STARTING IN</h2>
          <div className="text-8xl font-black text-yellow-300 animate-bounce drop-shadow-[0_10px_25px_rgba(234,179,8,0.6)]">
            {startingCount}
          </div>
          <p className="text-sm text-slate-300 font-bold tracking-wider">PREPARING ROLES & SPACESHIP</p>
        </div>
      )}

      {/* ERROR BANNER */}
      {errorMessage && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 bg-red-950/95 border-2 border-red-600 px-6 py-2.5 rounded-2xl shadow-2xl text-red-100 text-sm font-bold animate-shake">
          {errorMessage}
        </div>
      )}

      {/* COLLAPSIBLE / TABBED BOTTOM CONTROL DOCK (Three.js skill directive: zero viewport occlusion!) */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 w-full max-w-3xl px-2 sm:px-3 pointer-events-none">
        <div className="bg-[#0b1220]/95 backdrop-blur-xl border-[3px] border-white/90 rounded-[1.6rem] shadow-[7px_7px_0_rgba(0,0,0,0.7)] overflow-hidden pointer-events-auto">
          {/* Navigation Tabs Header */}
          <div className="flex border-b-[3px] border-white/30 bg-black/80 p-1.5 gap-1">
            <button
              onClick={() => {
                soundEngine.playClick();
                setActiveTab('customize');
                setDockExpanded(true);
              }}
              className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs tracking-wider flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                activeTab === 'customize'
                  ? 'bg-[#159be1] text-white border border-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Palette className="w-4 h-4" />
              <span className="hidden xs:inline">CUSTOMIZE SUIT</span><span className="xs:hidden">SUIT</span>
            </button>

            <button
              onClick={() => {
                soundEngine.playClick();
                setActiveTab('players');
                setDockExpanded(true);
              }}
              className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs tracking-wider flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                activeTab === 'players'
                  ? 'bg-[#159be1] text-white border border-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>CREW ({lobby?.players.length || 1})</span>
            </button>

            <button
              onClick={() => {
                soundEngine.playClick();
                setActiveTab('settings');
                setDockExpanded(true);
              }}
              className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs tracking-wider flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-[#159be1] text-white border border-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span className="hidden sm:inline">MATCH RULES {isHost ? '(HOST)' : ''}</span><span className="sm:hidden">RULES</span>
            </button>
          <button
            type="button"
            onClick={() => setDockExpanded((expanded) => !expanded)}
            className="rounded-xl px-2 sm:px-3 bg-white/10 hover:bg-white/20 text-white border border-white/30 cursor-pointer focus-visible:ring-2 focus-visible:ring-yellow-300"
            aria-label={dockExpanded ? 'Minimize lobby controls' : 'Expand lobby controls'}
            aria-expanded={dockExpanded}
            title={dockExpanded ? 'Minimize controls' : 'Expand controls'}
          >
            {dockExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
          </button>
          </div>
          {/* TAB 1: CUSTOMIZE SUIT */}
          {dockExpanded && activeTab === 'customize' && (
            <div className="p-4 space-y-3 max-h-[35vh] overflow-y-auto">
              {/* Color Swatches Grid */}
              <div>
                <span className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-2">
                  12 CREWMATE COLORS (NO DUPLICATES)
                </span>
                <div className="grid grid-cols-6 sm:grid-cols-12 gap-2">
                  {PLAYER_COLORS.map((c) => {
                    const takenBy = lobby?.players.find((p) => p.colorId === c.id);
                    const isTakenByOther = takenBy && takenBy.id !== socketId;
                    const isSelected = localPlayer?.colorId === c.id;

                    return (
                      <button
                        key={c.id}
                        disabled={isTakenByOther}
                        onClick={() => handleSelectColor(c.id)}
                        style={{ backgroundColor: c.hex }}
                        className={`relative aspect-square rounded-xl transition-all cursor-pointer shadow-md flex items-center justify-center border-2 ${
                          isSelected
                            ? 'border-white scale-110 ring-4 ring-cyan-400/50 z-10'
                            : isTakenByOther
                            ? 'opacity-25 grayscale cursor-not-allowed border-slate-800'
                            : 'border-black/40 hover:scale-105 hover:border-white/60'
                        }`}
                        title={isTakenByOther ? `${c.name} (Taken by ${takenBy.name})` : c.name}
                      >
                        {isSelected && <Check className="w-4 h-4 text-white drop-shadow-md stroke-[3]" />}
                        {isTakenByOther && <span className="text-[9px] font-bold text-white">✕</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Hat Selector */}
              <div>
                <span className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-2">
                  COSMETIC HATS
                </span>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {PLAYER_HATS.map((h) => {
                    const isSelected = localPlayer?.hatId === h.id;
                    return (
                      <button
                        key={h.id}
                        onClick={() => handleSelectHat(h.id)}
                        className={`py-2 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer border-2 text-center ${
                          isSelected
                            ? 'bg-cyan-500/30 border-cyan-400 text-white ring-2 ring-cyan-400/30'
                            : 'bg-slate-800/80 hover:bg-slate-750 border-slate-700 text-slate-300'
                        }`}
                      >
                        {h.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PLAYERS ROSTER */}
          {dockExpanded && activeTab === 'players' && (
            <div className="p-4 space-y-2 max-h-[35vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {lobby?.players.map((p) => {
                  const color = PLAYER_COLORS.find((c) => c.id === p.colorId) || PLAYER_COLORS[0];
                  const hat = PLAYER_HATS.find((h) => h.id === p.hatId);
                  const isMe = p.id === socketId;

                  return (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between p-2.5 rounded-xl border ${
                        isMe ? 'bg-cyan-950/40 border-cyan-500/50' : 'bg-slate-800/60 border-slate-750'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className="w-8 h-8 rounded-full border-2 border-white/40 shadow-inner flex items-center justify-center"
                          style={{ backgroundColor: color.hex }}
                        >
                          <span className="text-[10px] font-black text-white">
                            {p.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <div className="flex items-center space-x-1.5">
                            <span className="text-sm font-bold text-white">{p.name}</span>
                            {p.isHost && <Crown className="w-3.5 h-3.5 text-yellow-400 fill-current" />}
                            {isMe && <span className="text-[10px] text-cyan-400 font-extrabold">(YOU)</span>}
                          </div>
                          <span className="text-[10px] text-slate-400 capitalize">
                            {color.name} • {hat?.name || 'No Hat'}
                          </span>
                        </div>
                      </div>

                      {/* Host can kick other players */}
                      {isHost && !isMe && (
                        <button
                          onClick={() => handleKick(p.id)}
                          className="p-1.5 rounded-lg bg-red-950/60 hover:bg-red-800 border border-red-700/60 text-red-300 hover:text-white transition-all cursor-pointer"
                          title="Kick Player"
                        >
                          <UserX className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: GAME SETTINGS */}
          {dockExpanded && activeTab === 'settings' && lobby && (
            <LobbySettingsUI
              settings={lobby.settings}
              isHost={isHost}
              onUpdateSetting={handleUpdateSetting}
              currentPlayersCount={lobby.players.length}
            />
          )}

          {/* Bottom Action Footer (Start Game buttons) */}
          <div className="p-2.5 sm:p-3 bg-black/85 border-t border-white/15 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="text-xs text-slate-400 font-semibold text-center sm:text-left">
              <span>Walk around with </span>
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-cyan-300 font-mono">
                WASD
              </kbd>
              <span> • Drag mouse to rotate camera</span>
            </div>

            {isHost ? (
              <div className="flex items-center space-x-2 w-full sm:w-auto">
                {/* Rapid Debug / Solo testing button */}
                <button
                  onClick={handleStartTestGame}
                  className="flex-1 sm:flex-none py-2.5 px-4 rounded-xl font-bold text-xs tracking-wider bg-[#363b53] hover:bg-[#474c65] border-2 border-white/70 text-yellow-200 transition-all cursor-pointer flex items-center justify-center space-x-1.5 shadow-md"
                  title="Test game transition solo without waiting for 4 players"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>START SOLO/TEST</span>
                </button>

                {/* Standard Start Button */}
                <button
                  disabled={!canStartNormal}
                  onClick={handleStartGame}
                  className={`flex-1 sm:flex-none py-2.5 px-6 rounded-xl font-black text-sm tracking-wider flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-xl ${
                    canStartNormal
                      ? 'bg-[#77d449] hover:bg-[#99f568] border-2 border-white text-[#101b13] shadow-[3px_3px_0_#050914]'
                      : 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-60'
                  }`}
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>
                    {!canStartNormal
                      ? `NEEDS ${MIN_PLAYERS_TO_START}+ PLAYERS`
                      : botsToAdd > 0
                        ? `START GAME (+${botsToAdd} BOT${botsToAdd > 1 ? 'S' : ''})`
                        : 'START GAME'}
                  </span>
                </button>
              </div>
            ) : (
              <div className="text-xs font-bold text-yellow-400 tracking-wider">
                WAITING FOR HOST TO START GAME...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Real-time Lobby Chat Overlay */}
      <ChatOverlay
        currentRoom="Dropship"
        isGameMatch={false}
        players={lobby?.players || []}
        localPlayerId={socketId}
        onDisplayChatBubble={(playerId, text, scope) => {
          sceneRef.current?.displayChatBubble(playerId, text, scope);
        }}
      />
    </div>
  );
};
