/**
 * Impostor Protocol - Main Menu UI
 * Retro space aesthetic, player name input, create/join lobby, how-to-play, and audio settings.
 */

import React, { useState, useEffect } from 'react';
import { Users, Volume2, HelpCircle, Play, LogIn, Sparkles, Check, Copy } from 'lucide-react';
import { sanitizePlayerName } from '../../shared/constants';
import { net } from '../net';
import { soundEngine } from '../audio';

interface MenuProps {
  onLobbyJoined: () => void;
  initialJoinCode?: string;
}

export const MainMenu: React.FC<MenuProps> = ({ onLobbyJoined, initialJoinCode }) => {
  const [playerName, setPlayerName] = useState(() => {
    return localStorage.getItem('impostor_player_name') || 'Crewmate';
  });
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState(initialJoinCode || '');
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [masterVol, setMasterVol] = useState(soundEngine.masterVolume);
  const [sfxVol, setSfxVol] = useState(soundEngine.sfxVolume);

  useEffect(() => {
    if (initialJoinCode) {
      setJoinCodeInput(initialJoinCode.toUpperCase());
      setShowJoinModal(true);
    }

    const unsubError = net.onError((msg) => {
      setErrorMessage(msg);
    });

    return () => {
      unsubError();
    };
  }, [initialJoinCode]);

  const handleNameChange = (val: string) => {
    const cleaned = sanitizePlayerName(val);
    setPlayerName(cleaned);
    localStorage.setItem('impostor_player_name', cleaned);
  };

  const handleCreateLobby = () => {
    soundEngine.playClick();
    setErrorMessage('');
    const name = sanitizePlayerName(playerName);
    net.createLobby(name);
    onLobbyJoined();
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    soundEngine.playClick();
    setErrorMessage('');
    const code = joinCodeInput.trim().toUpperCase();
    if (code.length !== 5) {
      setErrorMessage('Lobby code must be exactly 5 letters/numbers.');
      return;
    }
    const name = sanitizePlayerName(playerName);
    net.joinLobby(code, name);
    onLobbyJoined();
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-between p-6 select-none overflow-hidden starfield-bg text-white">
      {/* Decorative stars and nebula background overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-40 bg-[radial-gradient(circle_at_50%_40%,rgba(56,189,248,0.15),transparent_60%)]" />

      {/* Top Header */}
      <div className="w-full max-w-4xl flex items-center justify-between z-10 pt-2">
        <div className="flex items-center space-x-2 bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-full border border-slate-700/60 shadow-lg">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span className="text-xs uppercase tracking-widest font-bold text-slate-300">
            Phase 1 • 3D Multiplayer Lobby
          </span>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              soundEngine.playClick();
              setShowSettings(true);
            }}
            className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/90 border border-slate-600/50 transition-all text-slate-200 hover:text-white shadow-md cursor-pointer"
            title="Settings"
          >
            <Volume2 className="w-5 h-5" />
          </button>
          <button
            onClick={() => {
              soundEngine.playClick();
              setShowHowToPlay(true);
            }}
            className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/90 border border-slate-600/50 transition-all text-slate-200 hover:text-white shadow-md cursor-pointer"
            title="How to Play"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Center Hero Logo & Action Panel */}
      <div className="w-full max-w-md flex flex-col items-center z-10 my-auto space-y-6">
        {/* Main Logo */}
        <div className="text-center space-y-1">
          <h1 className="text-5xl md:text-6xl font-black tracking-tight text-cyan-300 drop-shadow-[0_8px_16px_rgba(2,132,199,0.5)]">
            IMPOSTOR
          </h1>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-widest text-slate-300 drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)]">
            PROTOCOL
          </h2>
          <p className="text-xs uppercase tracking-widest text-cyan-400 font-semibold pt-1">
            Third-Person 3D Social Deduction
          </p>
        </div>

        {/* Player Name Input Card */}
        <div className="w-full bg-slate-900/85 backdrop-blur-xl p-5 rounded-2xl border-2 border-slate-700/80 shadow-2xl space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Crewmate Name (Max 10)
            </label>
            <input
              type="text"
              maxLength={10}
              value={playerName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Enter your name..."
              className="w-full px-4 py-3 bg-slate-950/80 border-2 border-slate-700 rounded-xl text-lg font-bold text-center tracking-wider text-cyan-300 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30 transition-all placeholder-slate-600"
            />
          </div>

          {errorMessage && (
            <div className="p-3 bg-red-950/80 border border-red-700/80 rounded-xl text-xs text-red-200 text-center font-semibold animate-shake">
              {errorMessage}
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-1 gap-3 pt-2">
            <button
              onClick={handleCreateLobby}
              className="w-full py-3.5 px-6 rounded-xl font-black text-lg tracking-wider text-slate-950 bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 hover:to-teal-300 shadow-[0_6px_20px_rgba(16,185,129,0.35)] active:translate-y-0.5 transition-all flex items-center justify-center space-x-2 cursor-pointer border border-emerald-300/60"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>CREATE LOBBY</span>
            </button>

            <button
              onClick={() => {
                soundEngine.playClick();
                setShowJoinModal(true);
              }}
              className="w-full py-3.5 px-6 rounded-xl font-black text-lg tracking-wider text-white bg-slate-800 hover:bg-slate-750 border-2 border-cyan-500/50 hover:border-cyan-400 shadow-[0_6px_20px_rgba(6,182,212,0.2)] active:translate-y-0.5 transition-all flex items-center justify-center space-x-2 cursor-pointer"
            >
              <LogIn className="w-5 h-5" />
              <span>JOIN LOBBY</span>
            </button>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="z-10 text-center text-xs text-slate-400 font-medium">
        <span>Use WASD or Touch Joystick to move your crewmate in the 3D dropship.</span>
      </div>

      {/* JOIN LOBBY MODAL */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-sm bg-slate-900 border-2 border-slate-700 rounded-3xl p-6 shadow-2xl space-y-4">
            <h3 className="text-xl font-extrabold text-center tracking-wider text-cyan-300">
              JOIN WITH CODE
            </h3>
            <p className="text-xs text-center text-slate-400">
              Enter the 5-character private or public lobby room code.
            </p>

            <form onSubmit={handleJoinSubmit} className="space-y-4">
              <input
                type="text"
                maxLength={5}
                autoFocus
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                placeholder="ABCDE"
                className="w-full px-4 py-3 bg-slate-950 border-2 border-cyan-500 rounded-xl text-3xl font-black text-center tracking-[0.25em] text-yellow-300 uppercase focus:outline-none focus:ring-4 focus:ring-cyan-500/30"
              />

              {errorMessage && (
                <div className="p-2.5 bg-red-950/80 border border-red-700 rounded-lg text-xs text-red-200 text-center">
                  {errorMessage}
                </div>
              )}

              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowJoinModal(false)}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-extrabold rounded-xl shadow-lg transition-all cursor-pointer"
                >
                  ENTER
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* HOW TO PLAY MODAL */}
      {showHowToPlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-slate-900 border-2 border-slate-700 rounded-3xl p-6 shadow-2xl space-y-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-2xl font-black text-cyan-400">HOW TO PLAY</h3>
              <button
                onClick={() => setShowHowToPlay(false)}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-sm text-slate-300">
              <div className="p-3 bg-cyan-950/40 border border-cyan-800/40 rounded-xl">
                <h4 className="font-bold text-cyan-300 mb-1">🟦 CREWMATE OBJECTIVE</h4>
                <p className="text-xs text-slate-300">
                  Complete all assigned tasks across the spaceship, or identify and vote out all Impostors in emergency meetings to win.
                </p>
              </div>

              <div className="p-3 bg-red-950/40 border border-red-800/40 rounded-xl">
                <h4 className="font-bold text-red-400 mb-1">🟥 IMPOSTOR OBJECTIVE</h4>
                <p className="text-xs text-slate-300">
                  Eliminate crewmates until impostors equal the crew, or leave Reactor Meltdown / O2 Failure unrepaired. Other sabotages disrupt systems until the crew restores them.
                </p>
              </div>

              <div className="p-3 bg-amber-950/40 border border-amber-800/40 rounded-xl">
                <h4 className="font-bold text-amber-300 mb-1">🛠️ ENGINEER ROLE</h4>
                <p className="text-xs text-slate-300">
                  Engineers are crewmates who can use ship vents for 6 seconds at a time. Their vent access recharges for 20 seconds after exiting.
                </p>
              </div>

              <div className="p-3 bg-slate-800/60 rounded-xl space-y-1">
                <h4 className="font-bold text-yellow-300">🎮 CONTROLS</h4>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 pt-1">
                  <div><strong className="text-white">WASD / Arrows:</strong> Move</div>
                  <div><strong className="text-white">Mouse Drag:</strong> Orbit Camera</div>
                  <div><strong className="text-white">E / Space:</strong> Use / Interact</div>
                  <div><strong className="text-white">Q:</strong> Kill (Impostor)</div>
                  <div><strong className="text-white">R:</strong> Report Dead Body</div>
                  <div><strong className="text-white">F:</strong> Vent In / Out</div>
                  <div><strong className="text-white">M / Tab:</strong> Open Map</div>
                  <div><strong className="text-white">Sabotage:</strong> Choose a system from the HUD</div>
                  <div><strong className="text-white">Touch:</strong> Virtual Joystick & HUD</div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowHowToPlay(false)}
              className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl cursor-pointer"
            >
              GOT IT
            </button>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border-2 border-slate-700 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-xl font-black text-white">AUDIO & SETTINGS</h3>
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
                  <span>MASTER VOLUME</span>
                  <span>{Math.round(masterVol * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={masterVol}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setMasterVol(v);
                    soundEngine.masterVolume = v;
                  }}
                  className="w-full accent-cyan-400"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold text-slate-300 mb-1">
                  <span>SOUND EFFECTS (SFX)</span>
                  <span>{Math.round(sfxVol * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={sfxVol}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setSfxVol(v);
                    soundEngine.sfxVolume = v;
                    soundEngine.playClick();
                  }}
                  className="w-full accent-cyan-400"
                />
              </div>
            </div>

            <button
              onClick={() => setShowSettings(false)}
              className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl cursor-pointer"
            >
              SAVE & CLOSE
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
