/**
 * Impostor Protocol - Lobby Settings UI Component
 * Comprehensive game configuration panel for the host with live state broadcasting:
 * Player count, movement speed, kill cooldown, impostor count, visions, tasks, and bot difficulty.
 */

import React, { useState } from 'react';
import {
  Users,
  Gauge,
  Skull,
  Timer,
  Eye,
  Crosshair,
  CheckSquare,
  Bot,
  RotateCcw,
  Sliders,
  ShieldAlert,
  Info,
  Lock,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import {
  DEFAULT_GAME_SETTINGS,
  GameSettings,
  KillDistance,
  BotDifficulty,
  MAX_PLAYERS_PER_LOBBY,
} from '../../shared/constants';
import { soundEngine } from '../audio';

export interface LobbySettingsUIProps {
  settings: GameSettings;
  isHost: boolean;
  onUpdateSetting: <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => void;
  onResetDefaults?: () => void;
  currentPlayersCount?: number;
}

type SettingsTab = 'core' | 'combat' | 'tasks' | 'meetings';

export const LobbySettingsUI: React.FC<LobbySettingsUIProps> = ({
  settings,
  isHost,
  onUpdateSetting,
  onResetDefaults,
  currentPlayersCount = 1,
}) => {
  const [activeCategory, setActiveCategory] = useState<SettingsTab>('core');

  const maxPlayers = settings.maxPlayers || MAX_PLAYERS_PER_LOBBY;
  const botDifficulty = settings.botDifficulty || 'Normal';

  const update = <K extends keyof GameSettings>(key: K, val: GameSettings[K]) => {
    if (!isHost) return;
    soundEngine.playClick();
    onUpdateSetting(key, val);
  };

  return (
    <div className="flex flex-col h-full text-xs">
      {/* Category Pills & Host Status Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-950/70 border-b border-slate-800">
        <div className="flex items-center space-x-1.5 overflow-x-auto py-0.5">
          <button
            onClick={() => {
              soundEngine.playClick();
              setActiveCategory('core');
            }}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
              activeCategory === 'core'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
                : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300'
            }`}
          >
            <Gauge className="w-3.5 h-3.5" />
            <span>CORE RULES</span>
          </button>

          <button
            onClick={() => {
              soundEngine.playClick();
              setActiveCategory('combat');
            }}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
              activeCategory === 'combat'
                ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30'
                : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>COMBAT & VISION</span>
          </button>

          <button
            onClick={() => {
              soundEngine.playClick();
              setActiveCategory('tasks');
            }}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
              activeCategory === 'tasks'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/30'
                : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>TASKS</span>
          </button>

          <button
            onClick={() => {
              soundEngine.playClick();
              setActiveCategory('meetings');
            }}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
              activeCategory === 'meetings'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>MEETINGS & BOTS</span>
          </button>
        </div>

        {/* Host Reset to defaults button */}
        {isHost && (
          <button
            onClick={() => {
              soundEngine.playClick();
              if (onResetDefaults) onResetDefaults();
              else {
                Object.entries(DEFAULT_GAME_SETTINGS).forEach(([k, v]) => {
                  onUpdateSetting(k as keyof GameSettings, v as any);
                });
              }
            }}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer text-[11px] font-bold border border-slate-700 shrink-0"
            title="Reset all settings to default rules"
          >
            <RotateCcw className="w-3 h-3" />
            <span>DEFAULTS</span>
          </button>
        )}
      </div>

      {/* Non-Host Informational Toast */}
      {!isHost && (
        <div className="mx-3 mt-2.5 p-2.5 bg-cyan-950/70 border border-cyan-600/60 rounded-xl text-cyan-200 font-semibold flex items-center justify-between shadow-lg">
          <div className="flex items-center space-x-2">
            <Lock className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>Host is configuring match rules. All updates sync live in real-time.</span>
          </div>
          <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-md bg-cyan-900 border border-cyan-400/40 text-cyan-300">
            VIEW ONLY
          </span>
        </div>
      )}

      {/* CATEGORY 1: CORE RULES (Player Count, Speed, Kill Cooldown, Impostor Count) */}
      <div className="p-3.5 space-y-3.5 max-h-[38vh] overflow-y-auto">
        {activeCategory === 'core' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* 1. PLAYER COUNT / LOBBY CAPACITY */}
            <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 space-y-2.5 shadow-md">
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center space-x-1.5 text-slate-300">
                  <Users className="w-4 h-4 text-cyan-400" />
                  <span>MAX PLAYERS</span>
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-cyan-950/80 border border-cyan-500/50 text-cyan-300 font-black text-xs">
                  {maxPlayers} PLAYERS
                </span>
              </div>

              {isHost ? (
                <div className="space-y-2">
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => update('maxPlayers', Math.max(4, maxPlayers - 1))}
                      disabled={maxPlayers <= 4}
                      className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed font-black text-white flex items-center justify-center cursor-pointer text-sm"
                    >
                      -
                    </button>
                    <input
                      type="range"
                      min="4"
                      max="10"
                      step="1"
                      value={maxPlayers}
                      onChange={(e) => update('maxPlayers', parseInt(e.target.value))}
                      className="flex-1 accent-cyan-400 cursor-pointer"
                    />
                    <button
                      onClick={() => update('maxPlayers', Math.min(10, maxPlayers + 1))}
                      disabled={maxPlayers >= 10}
                      className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed font-black text-white flex items-center justify-center cursor-pointer text-sm"
                    >
                      +
                    </button>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 font-bold px-1">
                    <span>4 (Small)</span>
                    <span>7 (Standard)</span>
                    <span>10 (Full Ship)</span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-400 font-semibold">
                  Capped at <strong className="text-white">{maxPlayers} players</strong> ({currentPlayersCount} currently in lobby).
                </div>
              )}
            </div>

            {/* 2. NUMBER OF IMPOSTORS */}
            <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 space-y-2.5 shadow-md">
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center space-x-1.5 text-slate-300">
                  <Skull className="w-4 h-4 text-red-400" />
                  <span>NUMBER OF IMPOSTORS</span>
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-red-950/80 border border-red-500/50 text-red-300 font-black text-xs">
                  {settings.impostorCount} {settings.impostorCount === 1 ? 'IMPOSTOR' : 'IMPOSTORS'}
                </span>
              </div>

              {isHost ? (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3].map((count) => {
                      const disabled = maxPlayers < 7 && count === 3;
                      const selected = settings.impostorCount === count;
                      return (
                        <button
                          key={count}
                          disabled={disabled}
                          onClick={() => update('impostorCount', count)}
                          className={`py-2 rounded-xl font-black text-xs tracking-wider transition-all cursor-pointer ${
                            selected
                              ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg shadow-red-600/40 border border-red-400'
                              : disabled
                                ? 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed'
                                : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-750'
                          }`}
                        >
                          {count} {count === 1 ? 'SOLO' : count === 2 ? 'DUO' : 'TRIO'}
                        </button>
                      );
                    })}
                  </div>
                  {maxPlayers < 7 && settings.impostorCount === 3 && (
                    <p className="text-[10px] text-amber-400 font-semibold">
                      Requires 7+ players for 3 Impostors.
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-xs text-slate-400 font-semibold">
                  Match will spawn <strong className="text-red-400">{settings.impostorCount} Impostor{settings.impostorCount > 1 ? 's' : ''}</strong> among the crew.
                </div>
              )}
            </div>

            {/* 3. PLAYER MOVEMENT SPEED */}
            <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 space-y-2.5 shadow-md">
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center space-x-1.5 text-slate-300">
                  <Gauge className="w-4 h-4 text-cyan-400" />
                  <span>PLAYER SPEED</span>
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-cyan-950/80 border border-cyan-500/50 text-cyan-300 font-black text-xs">
                  {settings.playerSpeed.toFixed(2)}x ({(4.8 * settings.playerSpeed).toFixed(1)} m/s)
                </span>
              </div>

              {isHost ? (
                <div className="space-y-2">
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => update('playerSpeed', Math.max(0.5, Number((settings.playerSpeed - 0.25).toFixed(2))))}
                      disabled={settings.playerSpeed <= 0.5}
                      className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 font-black text-white flex items-center justify-center cursor-pointer text-sm"
                    >
                      -
                    </button>
                    <input
                      type="range"
                      min="0.5"
                      max="3.0"
                      step="0.25"
                      value={settings.playerSpeed}
                      onChange={(e) => update('playerSpeed', parseFloat(e.target.value))}
                      className="flex-1 accent-cyan-400 cursor-pointer"
                    />
                    <button
                      onClick={() => update('playerSpeed', Math.min(3.0, Number((settings.playerSpeed + 0.25).toFixed(2))))}
                      disabled={settings.playerSpeed >= 3.0}
                      className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 font-black text-white flex items-center justify-center cursor-pointer text-sm"
                    >
                      +
                    </button>
                  </div>
                  {/* Quick speed presets */}
                  <div className="flex space-x-1.5">
                    {[1.0, 1.25, 1.5, 2.0].map((spd) => (
                      <button
                        key={spd}
                        onClick={() => update('playerSpeed', spd)}
                        className={`flex-1 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                          settings.playerSpeed === spd
                            ? 'bg-cyan-500 text-slate-950 font-black'
                            : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300'
                        }`}
                      >
                        {spd}x
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-400 font-semibold">
                  Crew and Impostors move at <strong className="text-cyan-300">{settings.playerSpeed}x normal speed</strong>.
                </div>
              )}
            </div>

            {/* 4. KILL COOLDOWN */}
            <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 space-y-2.5 shadow-md">
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center space-x-1.5 text-slate-300">
                  <Timer className="w-4 h-4 text-yellow-400" />
                  <span>KILL COOLDOWN</span>
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-yellow-950/80 border border-yellow-500/50 text-yellow-300 font-black text-xs">
                  {settings.killCooldown} SECONDS
                </span>
              </div>

              {isHost ? (
                <div className="space-y-2">
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => update('killCooldown', Math.max(10, settings.killCooldown - 2.5))}
                      disabled={settings.killCooldown <= 10}
                      className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 font-black text-white flex items-center justify-center cursor-pointer text-sm"
                    >
                      -
                    </button>
                    <input
                      type="range"
                      min="10"
                      max="60"
                      step="2.5"
                      value={settings.killCooldown}
                      onChange={(e) => update('killCooldown', parseFloat(e.target.value))}
                      className="flex-1 accent-yellow-400 cursor-pointer"
                    />
                    <button
                      onClick={() => update('killCooldown', Math.min(60, settings.killCooldown + 2.5))}
                      disabled={settings.killCooldown >= 60}
                      className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 font-black text-white flex items-center justify-center cursor-pointer text-sm"
                    >
                      +
                    </button>
                  </div>
                  {/* Quick cooldown presets */}
                  <div className="flex space-x-1.5">
                    {[15, 25, 35, 45].map((cd) => (
                      <button
                        key={cd}
                        onClick={() => update('killCooldown', cd)}
                        className={`flex-1 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                          settings.killCooldown === cd
                            ? 'bg-yellow-400 text-slate-950 font-black'
                            : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300'
                        }`}
                      >
                        {cd}s
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-400 font-semibold">
                  Impostors must wait <strong className="text-yellow-300">{settings.killCooldown}s</strong> between attacks.
                </div>
              )}
            </div>
          </div>
        )}

        {/* CATEGORY 2: COMBAT & VISION */}
        {activeCategory === 'combat' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Kill Distance */}
            <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center space-x-1.5 text-slate-300">
                  <Crosshair className="w-4 h-4 text-purple-400" />
                  <span>KILL DISTANCE</span>
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-purple-950/80 border border-purple-500/50 text-purple-300 font-black text-xs">
                  {settings.killDistance}
                </span>
              </div>
              {isHost ? (
                <div className="grid grid-cols-3 gap-2">
                  {(['Short', 'Medium', 'Long'] as KillDistance[]).map((dist) => (
                    <button
                      key={dist}
                      onClick={() => update('killDistance', dist)}
                      className={`py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                        settings.killDistance === dist
                          ? 'bg-purple-600 text-white font-black shadow-md shadow-purple-600/30'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      {dist}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-400">
                  Impostors can strike victims from <strong className="text-purple-300">{settings.killDistance}</strong> distance.
                </div>
              )}
            </div>

            {/* Crewmate Vision */}
            <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center space-x-1.5 text-slate-300">
                  <Eye className="w-4 h-4 text-blue-400" />
                  <span>CREWMATE VISION</span>
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-blue-950/80 border border-blue-500/50 text-blue-300 font-black text-xs">
                  {settings.crewmateVision.toFixed(2)}x
                </span>
              </div>
              {isHost ? (
                <input
                  type="range"
                  min="0.25"
                  max="3.0"
                  step="0.25"
                  value={settings.crewmateVision}
                  onChange={(e) => update('crewmateVision', parseFloat(e.target.value))}
                  className="w-full accent-blue-400 cursor-pointer"
                />
              ) : (
                <div className="text-xs text-slate-400">
                  Crew visual radius is scaled to <strong className="text-blue-300">{settings.crewmateVision}x</strong>.
                </div>
              )}
            </div>

            {/* Impostor Vision */}
            <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center space-x-1.5 text-slate-300">
                  <Eye className="w-4 h-4 text-red-400" />
                  <span>IMPOSTOR VISION</span>
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-red-950/80 border border-red-500/50 text-red-300 font-black text-xs">
                  {settings.impostorVision.toFixed(2)}x
                </span>
              </div>
              {isHost ? (
                <input
                  type="range"
                  min="0.25"
                  max="3.0"
                  step="0.25"
                  value={settings.impostorVision}
                  onChange={(e) => update('impostorVision', parseFloat(e.target.value))}
                  className="w-full accent-red-400 cursor-pointer"
                />
              ) : (
                <div className="text-xs text-slate-400">
                  Impostor night vision radius is scaled to <strong className="text-red-300">{settings.impostorVision}x</strong>.
                </div>
              )}
            </div>
          </div>
        )}

        {/* CATEGORY 3: TASKS */}
        {activeCategory === 'tasks' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Common Tasks */}
            <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between font-bold text-slate-300">
                <span>COMMON TASKS (ALL CREW SHARE)</span>
                <span className="text-emerald-400 font-black">{settings.commonTasks}</span>
              </div>
              {isHost ? (
                <div className="grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((num) => (
                    <button
                      key={num}
                      onClick={() => update('commonTasks', num)}
                      className={`py-1.5 rounded-xl font-bold cursor-pointer ${
                        settings.commonTasks === num
                          ? 'bg-emerald-600 text-white font-black'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-slate-400 font-semibold">{settings.commonTasks} Common Tasks assigned.</div>
              )}
            </div>

            {/* Short Tasks */}
            <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between font-bold text-slate-300">
                <span>SHORT TASKS</span>
                <span className="text-emerald-400 font-black">{settings.shortTasks}</span>
              </div>
              {isHost ? (
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="1"
                  value={settings.shortTasks}
                  onChange={(e) => update('shortTasks', parseInt(e.target.value))}
                  className="w-full accent-emerald-400 cursor-pointer"
                />
              ) : (
                <div className="text-slate-400 font-semibold">{settings.shortTasks} Short Tasks per crewmate.</div>
              )}
            </div>

            {/* Long Tasks */}
            <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between font-bold text-slate-300">
                <span>LONG TASKS (MULTI-STAGE)</span>
                <span className="text-emerald-400 font-black">{settings.longTasks}</span>
              </div>
              {isHost ? (
                <input
                  type="range"
                  min="0"
                  max="3"
                  step="1"
                  value={settings.longTasks}
                  onChange={(e) => update('longTasks', parseInt(e.target.value))}
                  className="w-full accent-emerald-400 cursor-pointer"
                />
              ) : (
                <div className="text-slate-400 font-semibold">{settings.longTasks} Long Tasks per crewmate.</div>
              )}
            </div>

            {/* Visual Tasks Toggle */}
            <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between font-bold text-slate-300">
              <div>
                <span>VISUAL TASKS</span>
                <p className="text-[10px] text-slate-500 font-normal">Show weapons cannon & shields animations</p>
              </div>
              {isHost ? (
                <button
                  onClick={() => update('visualTasks', !settings.visualTasks)}
                  className={`px-3 py-1.5 rounded-xl font-black transition-all cursor-pointer ${
                    settings.visualTasks ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {settings.visualTasks ? 'ON' : 'OFF'}
                </button>
              ) : (
                <span className="font-bold text-emerald-400">{settings.visualTasks ? 'ON' : 'OFF'}</span>
              )}
            </div>
          </div>
        )}

        {/* CATEGORY 4: MEETINGS & BOTS */}
        {activeCategory === 'meetings' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Discussion Time */}
            <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between font-bold text-slate-300">
                <span>DISCUSSION TIME</span>
                <span className="text-amber-400 font-black">{settings.discussionTime}s</span>
              </div>
              {isHost ? (
                <input
                  type="range"
                  min="0"
                  max="120"
                  step="15"
                  value={settings.discussionTime}
                  onChange={(e) => update('discussionTime', parseInt(e.target.value))}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              ) : (
                <div className="text-slate-400 font-semibold">{settings.discussionTime} seconds of quiet deliberation.</div>
              )}
            </div>

            {/* Voting Time */}
            <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between font-bold text-slate-300">
                <span>VOTING TIME</span>
                <span className="text-amber-400 font-black">{settings.votingTime}s</span>
              </div>
              {isHost ? (
                <input
                  type="range"
                  min="15"
                  max="300"
                  step="15"
                  value={settings.votingTime}
                  onChange={(e) => update('votingTime', parseInt(e.target.value))}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              ) : (
                <div className="text-slate-400 font-semibold">{settings.votingTime} seconds to cast votes.</div>
              )}
            </div>

            {/* Emergency Meetings & Cooldown */}
            <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between font-bold text-slate-300">
                <span>EMERGENCY COOLDOWN</span>
                <span className="text-amber-400 font-black">{settings.emergencyCooldown}s</span>
              </div>
              {isHost ? (
                <input
                  type="range"
                  min="0"
                  max="60"
                  step="5"
                  value={settings.emergencyCooldown}
                  onChange={(e) => update('emergencyCooldown', parseInt(e.target.value))}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              ) : (
                <div className="text-slate-400 font-semibold">{settings.emergencyCooldown}s delay between meetings.</div>
              )}
            </div>

            {/* Fill with Bots & Bot Difficulty */}
            <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between font-bold text-slate-300">
                <span>AI BOT PLAYERS</span>
                {isHost ? (
                  <button
                    onClick={() => update('fillWithBots', !settings.fillWithBots)}
                    className={`px-3 py-1 rounded-lg font-black transition-all cursor-pointer ${
                      settings.fillWithBots ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {settings.fillWithBots ? 'ENABLED' : 'DISABLED'}
                  </button>
                ) : (
                  <span className="text-emerald-400 font-bold">{settings.fillWithBots ? 'ENABLED' : 'DISABLED'}</span>
                )}
              </div>

              {settings.fillWithBots && (
                <div className="pt-2 border-t border-slate-850 space-y-1.5">
                  <div className="flex justify-between text-[11px] font-bold text-slate-400">
                    <span>BOT DIFFICULTY</span>
                    <span className="text-cyan-300 font-black">{botDifficulty}</span>
                  </div>
                  {isHost ? (
                    <div className="grid grid-cols-3 gap-2">
                      {(['Easy', 'Normal', 'Hard'] as BotDifficulty[]).map((diff) => (
                        <button
                          key={diff}
                          onClick={() => update('botDifficulty', diff)}
                          className={`py-1.5 rounded-xl font-bold cursor-pointer transition-all ${
                            botDifficulty === diff
                              ? 'bg-cyan-600 text-white font-black'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                          }`}
                        >
                          {diff}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {/* Confirm Ejects */}
            <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between font-bold text-slate-300">
              <div>
                <span>CONFIRM EJECTS</span>
                <p className="text-[10px] text-slate-500 font-normal">Reveal if ejected was an Impostor</p>
              </div>
              {isHost ? (
                <button
                  onClick={() => update('confirmEjects', !settings.confirmEjects)}
                  className={`px-3 py-1.5 rounded-xl font-black transition-all cursor-pointer ${
                    settings.confirmEjects ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {settings.confirmEjects ? 'ON' : 'OFF'}
                </button>
              ) : (
                <span className="font-bold text-emerald-400">{settings.confirmEjects ? 'ON' : 'OFF'}</span>
              )}
            </div>

            {/* Anonymous Votes */}
            <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between font-bold text-slate-300">
              <div>
                <span>ANONYMOUS VOTING</span>
                <p className="text-[10px] text-slate-500 font-normal">Grey out voting ballots in meetings</p>
              </div>
              {isHost ? (
                <button
                  onClick={() => update('anonymousVotes', !settings.anonymousVotes)}
                  className={`px-3 py-1.5 rounded-xl font-black transition-all cursor-pointer ${
                    settings.anonymousVotes ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {settings.anonymousVotes ? 'ON' : 'OFF'}
                </button>
              ) : (
                <span className="font-bold text-emerald-400">{settings.anonymousVotes ? 'ON' : 'OFF'}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
