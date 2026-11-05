/**
 * Impostor Protocol - Lobby Room UI & 3D Dropship Waiting Scene
 * Live color picker, hats, suit titles, host controls, real-time game settings sync,
 * rule presets, player manifest with ready states, and dropship walkaround.
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
  Sparkles,
  Info,
  Dice5,
  Shield,
  Zap,
  Flame,
  Award,
  Compass,
  CheckCircle2,
  Clock,
  Radio,
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

interface LobbyProps {
  onLeave: () => void;
}

const SPECIALTY_TITLES = [
  { id: 'cadet', name: 'Cadet', icon: Compass },
  { id: 'engineer', name: 'Engineer', icon: Zap },
  { id: 'security', name: 'Security Officer', icon: Shield },
  { id: 'medic', name: 'Chief Medic', icon: Award },
  { id: 'detective', name: 'Detective', icon: Sparkles },
];

export const LobbyView: React.FC<LobbyProps> = ({ onLeave }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<DropshipLobbyScene | null>(null);

  const [lobby, setLobby] = useState<LobbyData | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeTab, setActiveTab] = useState<'customize' | 'players' | 'settings'>('customize');
  const [errorMessage, setErrorMessage] = useState('');
  const [startingCount, setStartingCount] = useState<number | null>(null);

  // Local state for ready status and cosmetic specialty badge
  const [isReady, setIsReady] = useState(false);
  const [specialty, setSpecialty] = useState(() => localStorage.getItem('impostor_specialty') || 'cadet');

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
    const isTaken = lobby?.players.some((p) => p.id !== socketId && p.colorId === colorId);
    if (isTaken) return;

    soundEngine.playColorSelect();
    net.setColor(colorId);
    localStorage.setItem('impostor_color_id', colorId);
  };

  const handleSelectHat = (hatId: string) => {
    if (localPlayer?.hatId === hatId) return;
    soundEngine.playClick();
    net.setHat(hatId);
    localStorage.setItem('impostor_hat_id', hatId);
  };

  const handleRandomizeStyle = () => {
    soundEngine.playClick();
    // Pick an untaken color
    const untakenColors = PLAYER_COLORS.filter(
      (c) => !lobby?.players.some((p) => p.id !== socketId && p.colorId === c.id)
    );
    if (untakenColors.length > 0) {
      const chosenColor = untakenColors[Math.floor(Math.random() * untakenColors.length)].id;
      handleSelectColor(chosenColor);
    }
    const chosenHat = PLAYER_HATS[Math.floor(Math.random() * PLAYER_HATS.length)].id;
    handleSelectHat(chosenHat);
  };

  const handleToggleReady = () => {
    soundEngine.playClick();
    setIsReady((prev) => !prev);
  };

  const handleUpdateSetting = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => {
    if (!isHost || !lobby) return;
    soundEngine.playClick();
    net.updateSettings({ [key]: value });
  };

  const applyRulePreset = (preset: 'classic' | 'chaos' | 'detective') => {
    if (!isHost || !lobby) return;
    soundEngine.playClick();
    if (preset === 'classic') {
      net.updateSettings({
        impostorCount: 1,
        playerSpeed: 1.0,
        killCooldown: 25,
        killDistance: 'Short',
        commonTasks: 1,
        shortTasks: 2,
        longTasks: 1,
        discussionTime: 15,
        votingTime: 120,
        confirmEjects: false,
        anonymousVotes: false,
        fillWithBots: true,
      });
    } else if (preset === 'chaos') {
      net.updateSettings({
        impostorCount: 2,
        playerSpeed: 1.35,
        killCooldown: 15,
        killDistance: 'Medium',
        commonTasks: 1,
        shortTasks: 1,
        longTasks: 0,
        discussionTime: 0,
        votingTime: 60,
        confirmEjects: true,
        anonymousVotes: false,
        fillWithBots: true,
      });
    } else if (preset === 'detective') {
      net.updateSettings({
        impostorCount: 1,
        playerSpeed: 1.0,
        killCooldown: 35,
        killDistance: 'Short',
        commonTasks: 2,
        shortTasks: 3,
        longTasks: 2,
        discussionTime: 30,
        votingTime: 120,
        confirmEjects: false,
        anonymousVotes: true,
        fillWithBots: true,
      });
    }
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

  const handleLeave = () => {
    soundEngine.playClick();
    net.leaveLobby();
    onLeave();
  };

  const humanCount = lobby?.players.length || 0;
  const botFill = lobby?.settings.fillWithBots !== false;
  const botsToAdd = botFill ? Math.max(0, MIN_PLAYERS_TO_START - humanCount) : 0;
  const canStartNormal = humanCount >= 1 && (botFill || humanCount >= MIN_PLAYERS_TO_START);

  const activeColor = PLAYER_COLORS.find((c) => c.id === localPlayer?.colorId) || PLAYER_COLORS[0];
  const activeHat = PLAYER_HATS.find((h) => h.id === localPlayer?.hatId) || PLAYER_HATS[0];

  return (
    <div className="relative w-full h-full select-none overflow-hidden bg-slate-950 text-white">
      {/* 3D Scene Viewport */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* TOP HEADER DOCK */}
      <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
        {/* Lobby Code & Share Pills */}
        <div className="flex items-center space-x-2.5 pointer-events-auto">
          <div className="flex items-center space-x-3 bg-slate-900/90 backdrop-blur-xl px-4 py-2.5 rounded-2xl border-2 border-slate-700/80 shadow-2xl">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">ROOM:</span>
            <span className="text-2xl font-black tracking-widest text-yellow-300 font-mono">
              {lobby?.code || '-----'}
            </span>
            <button
              onClick={copyCode}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer flex items-center space-x-1"
              title="Copy Room Code"
            >
              {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          <button
            onClick={copyLink}
            className="flex items-center space-x-1.5 bg-slate-900/90 backdrop-blur-xl hover:bg-slate-800 px-3.5 py-2.5 rounded-2xl border-2 border-slate-700/80 shadow-xl text-xs font-bold text-cyan-300 hover:text-cyan-200 transition-all cursor-pointer pointer-events-auto"
            title="Copy Invite Link"
          >
            {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Sparkles className="w-4 h-4" />}
            <span className="hidden sm:inline">INVITE LINK</span>
          </button>
        </div>

        {/* Players Count & Leave Button */}
        <div className="flex items-center space-x-2.5 pointer-events-auto">
          <div className="flex items-center space-x-2 bg-slate-900/90 backdrop-blur-xl px-4 py-2.5 rounded-2xl border-2 border-slate-700/80 shadow-2xl">
            <Users className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-black text-slate-200">
              {lobby?.players.length || 1}/{MAX_PLAYERS_PER_LOBBY}
            </span>
          </div>

          <button
            onClick={handleLeave}
            className="p-2.5 rounded-2xl bg-red-950/80 hover:bg-red-900 border-2 border-red-700/80 text-red-200 hover:text-white transition-all shadow-xl cursor-pointer"
            title="Leave Lobby"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* COUNTDOWN SPLASH */}
      {startingCount !== null && startingCount > 0 && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/75 backdrop-blur-md animate-fadeIn">
          <h2 className="text-2xl font-black tracking-widest text-cyan-400 uppercase">MISSION STARTING IN</h2>
          <div className="text-8xl font-black text-yellow-300 animate-bounce drop-shadow-[0_10px_30px_rgba(234,179,8,0.7)]">
            {startingCount}
          </div>
          <p className="text-sm text-slate-300 font-bold tracking-wider">ALL CREW TO STATIONS</p>
        </div>
      )}

      {/* ERROR BANNER */}
      {errorMessage && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 bg-red-950/95 border-2 border-red-600 px-6 py-2.5 rounded-2xl shadow-2xl text-red-100 text-sm font-bold animate-shake">
          {errorMessage}
        </div>
      )}

      {/* TABBED CONTROL DOCK */}
      <div className="absolute z-20 pointer-events-none inset-x-0 bottom-0 px-2 pb-2 md:inset-x-auto md:right-4 md:top-20 md:bottom-4 md:w-[29rem] md:px-0 md:pb-0 flex flex-col justify-end md:justify-start">
        <div className="bg-slate-900/95 backdrop-blur-2xl border-2 border-slate-700/90 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.7)] overflow-hidden pointer-events-auto flex flex-col md:h-full md:min-h-0">
          {/* Navigation Tabs Header */}
          <div className="flex border-b border-slate-800 bg-slate-950/70 p-1.5 space-x-1">
            <button
              onClick={() => {
                soundEngine.playClick();
                setActiveTab('customize');
              }}
              className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs tracking-wider flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                activeTab === 'customize'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Palette className="w-4 h-4" />
              <span>WARDROBE</span>
            </button>

            <button
              onClick={() => {
                soundEngine.playClick();
                setActiveTab('players');
              }}
              className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs tracking-wider flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                activeTab === 'players'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
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
              }}
              className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs tracking-wider flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>RULES</span>
            </button>
          </div>

          {/* TAB 1: CUSTOMIZE SUIT & COSMETICS */}
          {activeTab === 'customize' && (
            <div className="p-4 space-y-4 max-h-[38vh] md:max-h-none md:flex-1 md:min-h-0 overflow-y-auto">
              {/* Character Identity Preview Card */}
              <div className="flex items-center justify-between p-3 bg-slate-950/70 border border-slate-800 rounded-2xl">
                <div className="flex items-center space-x-3">
                  <div
                    className="w-11 h-11 rounded-xl border-2 border-white/40 shadow-inner flex items-center justify-center relative shrink-0"
                    style={{ backgroundColor: activeColor.hex }}
                  >
                    <span className="text-sm font-black text-white">
                      {(localPlayer?.name || 'C').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-black text-white">{localPlayer?.name || 'You'}</span>
                      {isHost && <Crown className="w-3.5 h-3.5 text-yellow-400 fill-current" />}
                    </div>
                    <span className="text-[11px] text-slate-400 capitalize">
                      {activeColor.name} • {activeHat.name}
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleRandomizeStyle}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl text-xs font-black text-cyan-300 flex items-center space-x-1.5 cursor-pointer transition-all"
                  title="Randomize Suit & Hat"
                >
                  <Dice5 className="w-3.5 h-3.5" />
                  <span>RANDOM</span>
                </button>
              </div>

              {/* Color Swatches Grid */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                    SUIT COLOR ({PLAYER_COLORS.length})
                  </span>
                  <span className="text-[11px] font-bold text-slate-300 capitalize">{activeColor.name}</span>
                </div>
                <div className="grid grid-cols-6 gap-2">
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

              {/* Hat Selector Grid (13 hats) */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                    COSMETIC HATS ({PLAYER_HATS.length})
                  </span>
                  <span className="text-[11px] font-bold text-yellow-300">{activeHat.name}</span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                  {PLAYER_HATS.map((h) => {
                    const isSelected = localPlayer?.hatId === h.id;
                    return (
                      <button
                        key={h.id}
                        onClick={() => handleSelectHat(h.id)}
                        className={`py-2 px-1.5 rounded-xl text-[11px] font-black transition-all cursor-pointer border text-center truncate ${
                          isSelected
                            ? 'bg-cyan-500/30 border-cyan-400 text-white ring-2 ring-cyan-400/40 shadow-sm'
                            : 'bg-slate-800/80 hover:bg-slate-750 border-slate-700 text-slate-300'
                        }`}
                        title={h.name}
                      >
                        {h.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Specialty Role Badges */}
              <div>
                <span className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-1.5">
                  CREW ROLE BADGE
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {SPECIALTY_TITLES.map((t) => {
                    const Icon = t.icon;
                    const isSelected = specialty === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          soundEngine.playClick();
                          setSpecialty(t.id);
                          localStorage.setItem('impostor_specialty', t.id);
                        }}
                        className={`py-1 px-2.5 rounded-lg text-[11px] font-bold flex items-center space-x-1.5 border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-purple-950/70 border-purple-400 text-purple-200'
                            : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Icon className="w-3 h-3" />
                        <span>{t.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PLAYERS ROSTER & READY STATUS */}
          {activeTab === 'players' && (
            <div className="p-4 space-y-2 max-h-[38vh] md:max-h-none md:flex-1 md:min-h-0 overflow-y-auto">
              <div className="grid grid-cols-1 gap-2">
                {lobby?.players.map((p) => {
                  const color = PLAYER_COLORS.find((c) => c.id === p.colorId) || PLAYER_COLORS[0];
                  const hat = PLAYER_HATS.find((h) => h.id === p.hatId);
                  const isMe = p.id === socketId;

                  return (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                        isMe ? 'bg-cyan-950/40 border-cyan-500/50 shadow-sm' : 'bg-slate-800/60 border-slate-750'
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <div
                          className="w-9 h-9 rounded-xl border-2 border-white/40 shadow-inner flex items-center justify-center shrink-0"
                          style={{ backgroundColor: color.hex }}
                        >
                          <span className="text-xs font-black text-white">
                            {p.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center space-x-1.5 truncate">
                            <span className="text-sm font-black text-white truncate">{p.name}</span>
                            {p.isHost && (
                              <span title="Host">
                                <Crown className="w-3.5 h-3.5 text-yellow-400 fill-current shrink-0" />
                              </span>
                            )}
                            {isMe && <span className="text-[10px] text-cyan-400 font-extrabold shrink-0">(YOU)</span>}
                          </div>
                          <div className="flex items-center space-x-2 text-[10px] text-slate-400">
                            <span className="capitalize">{color.name}</span>
                            <span>•</span>
                            <span className="truncate">{hat?.name || 'No Hat'}</span>
                            <span>•</span>
                            <span className="text-emerald-400 flex items-center space-x-0.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                              <span>24ms</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        {isMe && !p.isHost && (
                          <button
                            onClick={handleToggleReady}
                            className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                              isReady
                                ? 'bg-emerald-500 border-emerald-300 text-slate-950'
                                : 'bg-slate-800 border-slate-600 text-slate-300'
                            }`}
                          >
                            {isReady ? 'READY' : 'STANDBY'}
                          </button>
                        )}
                        {/* Host can kick other players */}
                        {isHost && !isMe && (
                          <button
                            onClick={() => handleKick(p.id)}
                            className="p-1.5 rounded-xl bg-red-950/60 hover:bg-red-800 border border-red-700/60 text-red-300 hover:text-white transition-all cursor-pointer"
                            title="Kick Player"
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: GAME RULES & PRESETS */}
          {activeTab === 'settings' && (
            <div className="p-4 space-y-4 max-h-[38vh] md:max-h-none md:flex-1 md:min-h-0 overflow-y-auto text-xs">
              {!isHost && (
                <div className="p-3 bg-cyan-950/60 border border-cyan-700/60 rounded-2xl text-cyan-300 font-semibold flex items-center space-x-2">
                  <Info className="w-4 h-4 shrink-0" />
                  <span>Viewing host game rules. Any modifications by the host sync live instantly.</span>
                </div>
              )}

              {/* Quick Rule Presets (Host only) */}
              {isHost && (
                <div>
                  <span className="block text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                    QUICK RULE PRESETS
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => applyRulePreset('classic')}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 font-bold text-center cursor-pointer transition-all"
                    >
                      🚀 Classic
                    </button>
                    <button
                      onClick={() => applyRulePreset('chaos')}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 font-bold text-center cursor-pointer transition-all"
                    >
                      ⚡ Chaos
                    </button>
                    <button
                      onClick={() => applyRulePreset('detective')}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 font-bold text-center cursor-pointer transition-all"
                    >
                      🕵️ Detective
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3">
                {/* Impostor Count */}
                <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex justify-between font-black text-slate-300">
                    <span># OF IMPOSTORS</span>
                    <span className="text-red-400 font-black">{lobby?.settings.impostorCount}</span>
                  </div>
                  {isHost ? (
                    <div className="flex space-x-2">
                      {[1, 2, 3].map((num) => (
                        <button
                          key={num}
                          onClick={() => handleUpdateSetting('impostorCount', num)}
                          className={`flex-1 py-1.5 rounded-xl font-black transition-all cursor-pointer border ${
                            lobby?.settings.impostorCount === num
                              ? 'bg-red-600 border-red-400 text-white shadow-md'
                              : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                {/* Player Speed */}
                <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex justify-between font-black text-slate-300">
                    <span>PLAYER SPEED</span>
                    <span className="text-cyan-400 font-black">{lobby?.settings.playerSpeed}x</span>
                  </div>
                  {isHost ? (
                    <input
                      type="range"
                      min="0.5"
                      max="3.0"
                      step="0.25"
                      value={lobby?.settings.playerSpeed ?? 1.0}
                      onChange={(e) => handleUpdateSetting('playerSpeed', parseFloat(e.target.value))}
                      className="w-full accent-cyan-400"
                    />
                  ) : null}
                </div>

                {/* Kill Cooldown */}
                <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex justify-between font-black text-slate-300">
                    <span>KILL COOLDOWN</span>
                    <span className="text-red-400 font-black">{lobby?.settings.killCooldown}s</span>
                  </div>
                  {isHost ? (
                    <input
                      type="range"
                      min="10"
                      max="60"
                      step="2.5"
                      value={lobby?.settings.killCooldown ?? 25}
                      onChange={(e) => handleUpdateSetting('killCooldown', parseFloat(e.target.value))}
                      className="w-full accent-yellow-400"
                    />
                  ) : null}
                </div>

                {/* Kill Distance */}
                <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex justify-between font-black text-slate-300">
                    <span>KILL DISTANCE</span>
                    <span className="text-purple-400 font-black">{lobby?.settings.killDistance}</span>
                  </div>
                  {isHost ? (
                    <div className="flex space-x-2">
                      {(['Short', 'Medium', 'Long'] as const).map((dist) => (
                        <button
                          key={dist}
                          onClick={() => handleUpdateSetting('killDistance', dist)}
                          className={`flex-1 py-1.5 rounded-xl font-black transition-all cursor-pointer border ${
                            lobby?.settings.killDistance === dist
                              ? 'bg-purple-600 border-purple-400 text-white shadow-md'
                              : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                          }`}
                        >
                          {dist}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                {/* Vision Sliders */}
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-1.5">
                  <div className="flex justify-between font-bold text-slate-300">
                    <span>CREWMATE VISION</span>
                    <span className="text-blue-400 font-black">{lobby?.settings.crewmateVision}x</span>
                  </div>
                  {isHost ? (
                    <input
                      type="range"
                      min="0.25"
                      max="3.0"
                      step="0.25"
                      value={lobby?.settings.crewmateVision ?? 1.0}
                      onChange={(e) => handleUpdateSetting('crewmateVision', parseFloat(e.target.value))}
                      className="w-full accent-blue-400"
                    />
                  ) : null}
                </div>

                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-1.5">
                  <div className="flex justify-between font-bold text-slate-300">
                    <span>IMPOSTOR VISION</span>
                    <span className="text-red-400 font-black">{lobby?.settings.impostorVision}x</span>
                  </div>
                  {isHost ? (
                    <input
                      type="range"
                      min="0.25"
                      max="3.0"
                      step="0.25"
                      value={lobby?.settings.impostorVision ?? 1.5}
                      onChange={(e) => handleUpdateSetting('impostorVision', parseFloat(e.target.value))}
                      className="w-full accent-red-400"
                    />
                  ) : null}
                </div>

                {/* Tasks Configuration */}
                <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex justify-between font-black text-slate-300">
                    <span>COMMON / SHORT / LONG TASKS</span>
                    <span className="text-emerald-400 font-black">
                      {lobby?.settings.commonTasks}C • {lobby?.settings.shortTasks}S • {lobby?.settings.longTasks}L
                    </span>
                  </div>
                  {isHost ? (
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        ['commonTasks', 'Common', 2],
                        ['shortTasks', 'Short', 5],
                        ['longTasks', 'Long', 3],
                      ] as const).map(([setting, label, max]) => (
                        <label key={setting} className="space-y-1">
                          <span className="text-[10px] text-slate-400 font-bold">{label}</span>
                          <input
                            type="range"
                            min="0"
                            max={max}
                            step="1"
                            value={lobby?.settings[setting] ?? 0}
                            onChange={(e) => handleUpdateSetting(setting, parseInt(e.target.value))}
                            className="w-full accent-emerald-400"
                          />
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>

                {/* Voting & Discussion Times */}
                <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex justify-between font-black text-slate-300">
                    <span>DISCUSSION & VOTING TIME</span>
                    <span className="text-amber-400 font-black">
                      {lobby?.settings.discussionTime}s / {lobby?.settings.votingTime}s
                    </span>
                  </div>
                  {isHost ? (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="space-y-1">
                        <span className="text-[10px] text-slate-400 font-bold">Discussion</span>
                        <input
                          type="range"
                          min="0"
                          max="120"
                          step="15"
                          value={lobby?.settings.discussionTime ?? 15}
                          onChange={(e) => handleUpdateSetting('discussionTime', parseInt(e.target.value))}
                          className="w-full accent-amber-400"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[10px] text-slate-400 font-bold">Voting</span>
                        <input
                          type="range"
                          min="15"
                          max="300"
                          step="15"
                          value={lobby?.settings.votingTime ?? 120}
                          onChange={(e) => handleUpdateSetting('votingTime', parseInt(e.target.value))}
                          className="w-full accent-amber-400"
                        />
                      </label>
                    </div>
                  ) : null}
                </div>

                <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800 flex items-center justify-between font-black text-slate-300">
                  <span>AUTO-FILL EMPTY SEATS WITH BOTS</span>
                  {isHost ? (
                    <button
                      onClick={() => handleUpdateSetting('fillWithBots', !botFill)}
                      className={`px-3 py-1.5 rounded-xl font-black transition-all cursor-pointer border ${
                        botFill ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      {botFill ? 'ON' : 'OFF'}
                    </button>
                  ) : (
                    <span>{botFill ? 'ON' : 'OFF'}</span>
                  )}
                </div>

                {/* Confirm Ejects & Anonymous Votes */}
                <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800 flex items-center justify-between font-black text-slate-300">
                  <span>CONFIRM EJECTS</span>
                  {isHost ? (
                    <button
                      onClick={() => handleUpdateSetting('confirmEjects', !lobby?.settings.confirmEjects)}
                      className={`px-3 py-1.5 rounded-xl font-black transition-all cursor-pointer border ${
                        lobby?.settings.confirmEjects
                          ? 'bg-emerald-600 border-emerald-400 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      {lobby?.settings.confirmEjects ? 'ON' : 'OFF'}
                    </button>
                  ) : (
                    <span>{lobby?.settings.confirmEjects ? 'ON' : 'OFF'}</span>
                  )}
                </div>
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 flex items-center justify-between font-bold text-slate-300">
                  <span>VISUAL TASKS</span>
                  {isHost ? (
                    <button
                      onClick={() => handleUpdateSetting('visualTasks', !lobby?.settings.visualTasks)}
                      className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                        lobby?.settings.visualTasks ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {lobby?.settings.visualTasks ? 'ON' : 'OFF'}
                    </button>
                  ) : (
                    <span>{lobby?.settings.visualTasks ? 'ON' : 'OFF'}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Bottom Action Footer (Start Game buttons) */}
          <div className="p-3 bg-slate-950/95 border-t border-slate-800 flex flex-col gap-2">
            {isHost ? (
              <>
                <button
                  disabled={!canStartNormal}
                  onClick={handleStartGame}
                  className={`w-full py-3.5 rounded-2xl font-black text-base tracking-wider flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-xl ${
                    canStartNormal
                      ? 'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 hover:from-emerald-400 hover:to-cyan-300 text-slate-950 shadow-emerald-500/30 active:scale-[0.99]'
                      : 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-60'
                  }`}
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>{canStartNormal ? 'START MISSION' : `NEEDS ${MIN_PLAYERS_TO_START}+ PLAYERS`}</span>
                </button>
                <div className="text-center text-[11px] font-semibold text-slate-400">
                  {botsToAdd > 0
                    ? `${humanCount} player${humanCount > 1 ? 's' : ''} + ${botsToAdd} bot${botsToAdd > 1 ? 's' : ''} will fill the empty seats`
                    : `${humanCount} players ready`}
                </div>
              </>
            ) : (
              <div className="py-2.5 px-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between">
                <span className="text-xs font-black text-slate-300">MISSION STATUS:</span>
                <span className="text-xs font-black text-yellow-400 animate-pulse">WAITING FOR HOST</span>
              </div>
            )}
            <div className="text-center text-[11px] text-slate-400">
              Walk around dropship with <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-cyan-300 font-mono font-bold">WASD</kbd> • drag to rotate view
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
