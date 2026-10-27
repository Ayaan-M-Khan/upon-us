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
    <div className="relative w-full h-full flex flex-col items-center justify-between px-4 py-4 sm:p-6 select-none overflow-y-auto starfield-bg text-white">
      {/* Decorative stars and nebula background overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-60 bg-[radial-gradient(ellipse_at_50%_30%,rgba(34,211,238,0.19),transparent_55%)]" />

      {/* Top Header */}
      <div className="w-full max-w-4xl flex items-center justify-between gap-3 z-10 pt-2">
        <div className="flex items-center space-x-2 bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-full border border-slate-700/60 shadow-lg">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span className="text-[10px] sm:text-xs uppercase tracking-wider sm:tracking-widest font-bold text-slate-300">
            LIVE MULTIPLAYER • THE SKELD
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
      <div className="w-full max-w-xl flex flex-col items-center z-10 my-auto py-8 sm:py-12 space-y-6">
        {/* Main Logo */}
        <div className="text-center space-y-2">
          <div className="mx-auto mb-4 w-16 h-20 relative" aria-hidden="true">
            <div className="absolute inset-x-2 top-0 bottom-2 rounded-[45%_45%_30%_30%] bg-[#ec4747] border-[3px] border-[#101520] shadow-[5px_5px_0_#030712]" />
            <div className="absolute left-5 top-4 w-10 h-6 rounded-full bg-gradient-to-br from-white via-[#b9f0ff] to-[#56a9d3] border-[3px] border-[#101520] -rotate-6" />
            <div className="absolute left-1 bottom-0 w-6 h-5 bg-[#ec4747] border-[3px] border-[#101520] rounded-b-lg" />
            <div className="absolute right-1 bottom-0 w-6 h-5 bg-[#ec4747] border-[3px] border-[#101520] rounded-b-lg" />
          </div>
          <h1 className="text-5xl sm:text-7xl font-black tracking-tight leading-none text-white drop-shadow-[5px_6px_0_#0f182c]" style={{ WebkitTextStroke: '2px #111827' }}>
            UPON <span className="text-[#ffde59]">US</span>
          </h1>
          <p className="text-xs uppercase tracking-[0.22em] text-cyan-200 font-black pt-2">
            TRUST YOUR CREW. QUESTION EVERYONE.
          </p>
        </div>

        {/* Player Name Input Card */}
        <div className="w-full bg-[#080d18]/95 backdrop-blur-xl p-5 sm:p-6 rounded-[2rem] border-[3px] border-white shadow-[8px_8px_0_#030712] space-y-4">
          <div>
            <label htmlFor="crewmate-name" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              YOUR CREWMATE NAME
            </label>
            <input
              id="crewmate-name"
              type="text"
              autoComplete="nickname"
              maxLength={10}
              value={playerName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Enter your name..."
              className="w-full px-4 py-3 bg-[#1e293b] border-[3px] border-white/75 rounded-2xl text-lg font-black text-center tracking-wider text-cyan-100 focus-visible:outline-none focus-visible:border-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400/40 transition-all placeholder-slate-600"
            />
          </div>

          {errorMessage && (
            <div className="p-3 bg-red-950/80 border border-red-700/80 rounded-xl text-xs text-red-200 text-center font-semibold animate-shake">
              {errorMessage}
            </div>
          )}

          {/* Big, clearly separated Play / Join cards inspired by social-deduction lobby menus. */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={handleCreateLobby}
              className="group min-h-36 p-4 rounded-2xl font-black text-lg tracking-wide text-[#172212] bg-[#88da47] hover:bg-[#a4f36c] border-[3px] border-white shadow-[4px_5px_0_#030712] active:translate-y-0.5 focus-visible:ring-4 focus-visible:ring-yellow-300 transition-all flex flex-col items-center justify-center gap-3 cursor-pointer"
            >
              <div className="w-14 h-14 rounded-2xl bg-black/15 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Play className="w-8 h-8 fill-current" />
              </div>
              <span>HOST GAME</span>
            </button>
            <button
              onClick={() => {
                soundEngine.playClick();
                setErrorMessage('');
                setShowJoinModal(true);
              }}
              className="group min-h-36 p-4 rounded-2xl font-black text-lg tracking-wide text-white bg-[#247bdb] hover:bg-[#3997fb] border-[3px] border-white shadow-[4px_5px_0_#030712] active:translate-y-0.5 focus-visible:ring-4 focus-visible:ring-yellow-300 transition-all flex flex-col items-center justify-center gap-3 cursor-pointer"
            >
              <div className="w-14 h-14 rounded-2xl bg-black/15 flex items-center justify-center group-hover:scale-110 transition-transform">
                <LogIn className="w-8 h-8" />
              </div>
              <span>JOIN BY CODE</span>
            </button>
          </div>
          <button
            onClick={() => { soundEngine.playClick(); setShowHowToPlay(true); }}
            className="w-full py-2.5 rounded-xl border-2 border-white/60 hover:bg-white/15 text-white font-black tracking-widest text-xs flex items-center justify-center gap-2 transition-all focus-visible:ring-4 focus-visible:ring-yellow-300"
          >
            <HelpCircle className="w-4 h-4" /> HOW TO PLAY
          </button>
        </div>
      </div>

      {/* Footer Info */}
      <div className="z-10 text-center text-xs text-slate-400 font-medium pb-2">
        <span>WASD to walk · Drag to look around · Find your crew aboard the dropship.</span>
      </div>

      {/* JOIN LOBBY MODAL */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fadeIn" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="join-modal-title" className="w-full max-w-sm bg-slate-900 border border-cyan-400/30 rounded-3xl p-6 shadow-2xl space-y-4">
            <h3 id="join-modal-title" className="text-xl font-extrabold text-center tracking-wider text-cyan-300">
              JOIN WITH CODE
            </h3>
            <p className="text-xs text-center text-slate-400">
              Enter the 5-character private or public lobby room code.
            </p>

            <form onSubmit={handleJoinSubmit} className="space-y-4">
              <input
                type="text"
                maxLength={5}
                aria-label="Five-character lobby code"
                autoComplete="off"
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
                  Eliminate crewmates until impostors equal crewmates, or trigger an unstopped critical sabotage (Reactor Meltdown / O2 Depletion). Use vents to escape unseen.
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
                  <div><strong className="text-white">M / Tab:</strong> Open Map / Sabotage</div>
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
