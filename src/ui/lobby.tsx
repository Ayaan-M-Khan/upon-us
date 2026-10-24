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

  const humanCount = lobby?.players.length || 0;
  const botFill = lobby?.settings.fillWithBots !== false;
  const botsToAdd = botFill ? Math.max(0, MIN_PLAYERS_TO_START - humanCount) : 0;
  const canStartNormal = humanCount >= 1 && (botFill || humanCount >= MIN_PLAYERS_TO_START);

  return (
    <div className="relative w-full h-full select-none overflow-hidden bg-slate-950 text-white">
      {/* 3D Scene Viewport */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* TOP HEADER DOCK */}
      <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
        {/* Lobby Code & Share Pills */}
        <div className="flex items-center space-x-2 pointer-events-auto">
          <div className="flex items-center space-x-3 bg-slate-900/90 backdrop-blur-md px-4 py-2.5 rounded-2xl border-2 border-slate-700/80 shadow-2xl">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400">ROOM CODE:</span>
            <span className="text-2xl font-black tracking-widest text-yellow-300 font-mono">
              {lobby?.code || '-----'}
            </span>
            <button
              onClick={copyCode}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer flex items-center space-x-1"
              title="Copy Room Code"
            >
              {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          <button
            onClick={copyLink}
            className="flex items-center space-x-1.5 bg-slate-900/90 backdrop-blur-md hover:bg-slate-800 px-3.5 py-2.5 rounded-2xl border-2 border-slate-700/80 shadow-xl text-xs font-bold text-cyan-300 hover:text-cyan-200 transition-all cursor-pointer pointer-events-auto"
            title="Copy Invite Link"
          >
            {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Sparkles className="w-4 h-4" />}
            <span className="hidden sm:inline">INVITE LINK</span>
          </button>
        </div>

        {/* Players Count & Leave Button */}
        <div className="flex items-center space-x-3 pointer-events-auto">
          <div className="flex items-center space-x-2 bg-slate-900/90 backdrop-blur-md px-4 py-2.5 rounded-2xl border-2 border-slate-700/80 shadow-2xl">
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
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-full max-w-3xl px-3 pointer-events-none">
        <div className="bg-slate-900/92 backdrop-blur-xl border-2 border-slate-700/90 rounded-3xl shadow-[0_15px_35px_rgba(0,0,0,0.6)] overflow-hidden pointer-events-auto">
          {/* Navigation Tabs Header */}
          <div className="flex border-b border-slate-800 bg-slate-950/60 p-1.5 space-x-1">
            <button
              onClick={() => {
                soundEngine.playClick();
                setActiveTab('customize');
              }}
              className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs tracking-wider flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                activeTab === 'customize'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Palette className="w-4 h-4" />
              <span>CUSTOMIZE SUIT</span>
            </button>

            <button
              onClick={() => {
                soundEngine.playClick();
                setActiveTab('players');
              }}
              className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs tracking-wider flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                activeTab === 'players'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>CREW LIST ({lobby?.players.length || 1})</span>
            </button>

            <button
              onClick={() => {
                soundEngine.playClick();
                setActiveTab('settings');
              }}
              className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs tracking-wider flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>GAME RULES {isHost ? '(HOST)' : ''}</span>
            </button>
          </div>

          {/* TAB 1: CUSTOMIZE SUIT */}
          {activeTab === 'customize' && (
            <div className="p-4 space-y-3 max-h-[38vh] overflow-y-auto">
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
          {activeTab === 'players' && (
            <div className="p-4 space-y-2 max-h-[38vh] overflow-y-auto">
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
          {activeTab === 'settings' && (
            <div className="p-4 space-y-4 max-h-[38vh] overflow-y-auto text-xs">
              {!isHost && (
                <div className="p-2.5 bg-cyan-950/60 border border-cyan-700/60 rounded-xl text-cyan-300 font-semibold flex items-center space-x-2">
                  <Info className="w-4 h-4 shrink-0" />
                  <span>Viewing host game settings. These settings sync live when the host modifies them.</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Impostor Count */}
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-1.5">
                  <div className="flex justify-between font-bold text-slate-300">
                    <span># OF IMPOSTORS</span>
                    <span className="text-red-400 font-black">{lobby?.settings.impostorCount}</span>
                  </div>
                  {isHost ? (
                    <div className="flex space-x-2">
                      {[1, 2, 3].map((num) => (
                        <button
                          key={num}
                          onClick={() => handleUpdateSetting('impostorCount', num)}
                          className={`flex-1 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                            lobby?.settings.impostorCount === num
                              ? 'bg-red-600 text-white'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                {/* Player Speed */}
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-1.5">
                  <div className="flex justify-between font-bold text-slate-300">
                    <span>PLAYER SPEED</span>
                    <span className="text-cyan-400 font-black">{lobby?.settings.playerSpeed}x</span>
                  </div>
                  {isHost ? (
                    <input
                      type="range"
                      min="0.5"
                      max="3.0"
                      step="0.25"
                      value={lobby?.settings.playerSpeed || 1.0}
                      onChange={(e) => handleUpdateSetting('playerSpeed', parseFloat(e.target.value))}
                      className="w-full accent-cyan-400"
                    />
                  ) : null}
                </div>

                {/* Kill Cooldown */}
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-1.5">
                  <div className="flex justify-between font-bold text-slate-300">
                    <span>KILL COOLDOWN</span>
                    <span className="text-yellow-400 font-black">{lobby?.settings.killCooldown}s</span>
                  </div>
                  {isHost ? (
                    <input
                      type="range"
                      min="10"
                      max="60"
                      step="2.5"
                      value={lobby?.settings.killCooldown || 25}
                      onChange={(e) => handleUpdateSetting('killCooldown', parseFloat(e.target.value))}
                      className="w-full accent-yellow-400"
                    />
                  ) : null}
                </div>

                {/* Kill Distance */}
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-1.5">
                  <div className="flex justify-between font-bold text-slate-300">
                    <span>KILL DISTANCE</span>
                    <span className="text-purple-400 font-black">{lobby?.settings.killDistance}</span>
                  </div>
                  {isHost ? (
                    <div className="flex space-x-2">
                      {(['Short', 'Medium', 'Long'] as const).map((dist) => (
                        <button
                          key={dist}
                          onClick={() => handleUpdateSetting('killDistance', dist)}
                          className={`flex-1 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                            lobby?.settings.killDistance === dist
                              ? 'bg-purple-600 text-white'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
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
                      value={lobby?.settings.crewmateVision || 1.0}
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
                      value={lobby?.settings.impostorVision || 1.5}
                      onChange={(e) => handleUpdateSetting('impostorVision', parseFloat(e.target.value))}
                      className="w-full accent-red-400"
                    />
                  ) : null}
                </div>

                {/* Tasks Configuration */}
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-1.5">
                  <div className="flex justify-between font-bold text-slate-300">
                    <span>COMMON TASKS</span>
                    <span className="text-emerald-400 font-black">{lobby?.settings.commonTasks}</span>
                  </div>
                  {isHost ? (
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="1"
                      value={lobby?.settings.commonTasks || 1}
                      onChange={(e) => handleUpdateSetting('commonTasks', parseInt(e.target.value))}
                      className="w-full accent-emerald-400"
                    />
                  ) : null}
                </div>

                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-1.5">
                  <div className="flex justify-between font-bold text-slate-300">
                    <span>SHORT TASKS</span>
                    <span className="text-emerald-400 font-black">{lobby?.settings.shortTasks}</span>
                  </div>
                  {isHost ? (
                    <input
                      type="range"
                      min="0"
                      max="5"
                      step="1"
                      value={lobby?.settings.shortTasks || 2}
                      onChange={(e) => handleUpdateSetting('shortTasks', parseInt(e.target.value))}
                      className="w-full accent-emerald-400"
                    />
                  ) : null}
                </div>

                {/* Voting & Discussion Times */}
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-1.5">
                  <div className="flex justify-between font-bold text-slate-300">
                    <span>DISCUSSION TIME</span>
                    <span className="text-amber-400 font-black">{lobby?.settings.discussionTime}s</span>
                  </div>
                  {isHost ? (
                    <input
                      type="range"
                      min="0"
                      max="120"
                      step="15"
                      value={lobby?.settings.discussionTime || 15}
                      onChange={(e) => handleUpdateSetting('discussionTime', parseInt(e.target.value))}
                      className="w-full accent-amber-400"
                    />
                  ) : null}
                </div>

                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-1.5">
                  <div className="flex justify-between font-bold text-slate-300">
                    <span>VOTING TIME</span>
                    <span className="text-amber-400 font-black">{lobby?.settings.votingTime}s</span>
                  </div>
                  {isHost ? (
                    <input
                      type="range"
                      min="15"
                      max="300"
                      step="15"
                      value={lobby?.settings.votingTime || 120}
                      onChange={(e) => handleUpdateSetting('votingTime', parseInt(e.target.value))}
                      className="w-full accent-amber-400"
                    />
                  ) : null}
                </div>

                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 flex items-center justify-between font-bold text-slate-300">
                  <span>FILL EMPTY SEATS WITH BOTS</span>
                  {isHost ? (
                    <button
                      onClick={() => handleUpdateSetting('fillWithBots', !botFill)}
                      className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                        botFill ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {botFill ? 'ON' : 'OFF'}
                    </button>
                  ) : (
                    <span>{botFill ? 'ON' : 'OFF'}</span>
                  )}
                </div>

                {/* Confirm Ejects & Visual Tasks Toggles */}
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 flex items-center justify-between font-bold text-slate-300">
                  <span>CONFIRM EJECTS</span>
                  {isHost ? (
                    <button
                      onClick={() => handleUpdateSetting('confirmEjects', !lobby?.settings.confirmEjects)}
                      className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                        lobby?.settings.confirmEjects ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'
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
                        lobby?.settings.visualTasks ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'
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
          <div className="p-3 bg-slate-950/90 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
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
                  className="flex-1 sm:flex-none py-2.5 px-4 rounded-xl font-bold text-xs tracking-wider bg-slate-800 hover:bg-slate-700 border border-amber-500/50 text-amber-300 transition-all cursor-pointer flex items-center justify-center space-x-1.5 shadow-md"
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
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-emerald-500/30'
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
    </div>
  );
};
