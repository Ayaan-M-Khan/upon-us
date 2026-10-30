/**
 * Impostor Protocol - Main Menu UI
 * Deep Space Theme: Cosmic starfield, planetary atmospheric glow, space telemetry.
 * Streamlined: Exclusively features Player Name input, Create Lobby, and Join Lobby.
 * (No customization options on this page - all cosmetic customization is in the waiting lobby).
 */

import React, { useState, useEffect } from 'react';
import {
  Volume2,
  HelpCircle,
  Play,
  LogIn,
  Radio,
  Clipboard,
  Satellite,
  Compass,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
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
  const [joinCodeInput, setJoinCodeInput] = useState(initialJoinCode || '');
  const [errorMessage, setErrorMessage] = useState('');
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [masterVol, setMasterVol] = useState(soundEngine.masterVolume);
  const [sfxVol, setSfxVol] = useState(soundEngine.sfxVolume);

  useEffect(() => {
    if (initialJoinCode) {
      setJoinCodeInput(initialJoinCode.toUpperCase());
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
      setErrorMessage('Lobby code must be exactly 5 letters or numbers.');
      return;
    }
    const name = sanitizePlayerName(playerName);
    net.joinLobby(code, name);
    onLobbyJoined();
  };

  const handlePasteCode = async () => {
    try {
      soundEngine.playClick();
      const text = await navigator.clipboard.readText();
      const codeMatch = text.trim().toUpperCase().match(/[A-Z0-9]{5}/);
      if (codeMatch) {
        setJoinCodeInput(codeMatch[0]);
      }
    } catch {
      // Clipboard permission denied or unsupported
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-between p-4 sm:p-6 select-none overflow-y-auto space-theme-bg text-white">
      {/* Dynamic Starfield Background with Twinkling Layers */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Layer 1: Tiny distant stars */}
        <div className="absolute inset-0 opacity-70 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:28px_28px] animate-twinkle-1" />
        {/* Layer 2: Medium glowing stars */}
        <div className="absolute inset-0 opacity-55 bg-[radial-gradient(#f8fafc_1.5px,transparent_1.5px)] [background-size:64px_64px] animate-twinkle-2" />
        {/* Layer 3: Brighter cosmic clusters */}
        <div className="absolute inset-0 opacity-40 bg-[radial-gradient(#818cf8_2px,transparent_2px)] [background-size:120px_120px] animate-twinkle-3" />

        {/* Deep space nebula clouds */}
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-cyan-600/10 blur-3xl pointer-events-none animate-float-dust" />
        <div className="absolute top-1/3 -right-24 w-80 h-80 rounded-full bg-indigo-600/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 left-1/4 w-[36rem] h-64 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />

        {/* Planet Horizon Glow at bottom */}
        <div className="absolute -bottom-48 inset-x-0 h-64 rounded-[100%] bg-gradient-to-t from-cyan-900/30 via-slate-900/50 to-transparent blur-xl pointer-events-none border-t border-cyan-500/20" />
      </div>

      {/* TOP HEADER DOCK */}
      <header className="w-full max-w-4xl flex items-center justify-between z-10 pt-1">
        {/* Space Station Telemetry */}
        <div className="flex items-center space-x-2.5 bg-slate-900/85 backdrop-blur-xl px-4 py-2 rounded-2xl border border-cyan-500/30 shadow-[0_4px_20px_rgba(6,182,212,0.15)]">
          <Satellite className="w-4 h-4 text-cyan-400 animate-pulse" />
          <span className="text-xs uppercase tracking-widest font-black text-slate-300">
            USG SKELD • SECTOR 07 • ORBIT 420KM
          </span>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => {
              soundEngine.playClick();
              setShowSettings(true);
            }}
            className="p-2.5 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 transition-all text-slate-300 hover:text-cyan-300 shadow-md cursor-pointer flex items-center space-x-1.5"
            title="Audio & Settings"
          >
            <Volume2 className="w-4 h-4" />
            <span className="text-xs font-bold hidden sm:inline">AUDIO</span>
          </button>
          <button
            onClick={() => {
              soundEngine.playClick();
              setShowHowToPlay(true);
            }}
            className="p-2.5 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 transition-all text-slate-300 hover:text-cyan-300 shadow-md cursor-pointer flex items-center space-x-1.5"
            title="How to Play"
          >
            <HelpCircle className="w-4 h-4" />
            <span className="text-xs font-bold hidden sm:inline">GUIDE</span>
          </button>
        </div>
      </header>

      {/* CENTER SPACE TERMINAL */}
      <main className="w-full max-w-lg flex flex-col items-center z-10 my-auto py-4 space-y-7">
        {/* Logo Title */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-950/70 border border-cyan-500/30 text-cyan-300 text-[11px] font-black uppercase tracking-widest mb-1.5 shadow-inner">
            <Radio className="w-3.5 h-3.5 animate-pulse text-cyan-400" />
            <span>DEEP SPACE DOCKING TERMINAL</span>
          </div>
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-cyan-200 via-sky-400 to-blue-600 drop-shadow-[0_10px_25px_rgba(2,132,199,0.55)]">
            IMPOSTOR
          </h1>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[0.25em] text-slate-300 drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)]">
            PROTOCOL
          </h2>
        </div>

        {/* Space Console Terminal Card */}
        <div className="w-full bg-slate-900/90 backdrop-blur-2xl rounded-3xl border-2 border-cyan-500/40 shadow-[0_20px_60px_rgba(0,0,0,0.8)] p-6 sm:p-8 space-y-6">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3 bg-red-950/90 border border-red-600 rounded-2xl text-xs text-red-200 text-center font-black animate-shake shadow-lg">
              {errorMessage}
            </div>
          )}

          {/* 1. CREWMATE NAME INPUT */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-300">
              <span className="flex items-center space-x-1.5 text-cyan-400">
                <Compass className="w-3.5 h-3.5" />
                <span>CREWMATE NAME</span>
              </span>
              <span className="text-[11px] text-slate-400 font-bold">{playerName.length}/10</span>
            </div>
            <div className="relative">
              <input
                type="text"
                maxLength={10}
                value={playerName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Enter astronaut name..."
                className="w-full px-4 py-3.5 bg-slate-950/90 border-2 border-slate-700/90 rounded-2xl text-lg font-black tracking-wider text-cyan-300 focus:outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-500/20 transition-all placeholder-slate-600 shadow-inner"
              />
            </div>
          </div>

          {/* 2. CREATE LOBBY ACTION */}
          <div>
            <button
              type="button"
              onClick={handleCreateLobby}
              className="w-full py-4 px-6 rounded-2xl font-black text-lg tracking-wider text-slate-950 bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 shadow-[0_8px_25px_rgba(16,185,129,0.35)] active:scale-[0.99] transition-all flex items-center justify-center space-x-2.5 cursor-pointer border border-emerald-200/60"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>CREATE LOBBY</span>
            </button>
          </div>

          {/* DIVIDER */}
          <div className="relative flex items-center justify-center">
            <div className="border-t border-slate-700/80 w-full" />
            <span className="bg-slate-900 px-3 text-[11px] font-black uppercase tracking-widest text-slate-500 absolute">
              OR JOIN EXISTING
            </span>
          </div>

          {/* 3. JOIN LOBBY ACTION (CODE INPUT) */}
          <form onSubmit={handleJoinSubmit} className="space-y-3.5">
            <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-300">
              <span className="text-cyan-400">ENTER 5-CHARACTER ROOM CODE</span>
              <button
                type="button"
                onClick={handlePasteCode}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center space-x-1 cursor-pointer transition-colors"
                title="Paste from clipboard"
              >
                <Clipboard className="w-3.5 h-3.5" />
                <span>PASTE</span>
              </button>
            </div>

            <div className="relative">
              <input
                type="text"
                maxLength={5}
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                placeholder="ABCDE"
                className="w-full py-3.5 px-4 bg-slate-950/90 border-2 border-slate-700/90 rounded-2xl text-2xl font-black text-center tracking-[0.35em] text-yellow-300 uppercase focus:outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-500/20 transition-all placeholder-slate-700 font-mono shadow-inner"
              />
            </div>

            <button
              type="submit"
              className="w-full py-4 px-6 rounded-2xl font-black text-lg tracking-wider text-white bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-[0_8px_25px_rgba(6,182,212,0.35)] active:scale-[0.99] transition-all flex items-center justify-center space-x-2.5 cursor-pointer border border-cyan-300/40"
            >
              <LogIn className="w-5 h-5" />
              <span>JOIN LOBBY</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </button>
          </form>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="z-10 text-center text-xs text-slate-400 font-medium py-2">
        <span>Connect with up to 10 astronauts in deep space • Customize suits & hats inside the lobby</span>
      </footer>

      {/* HOW TO PLAY MODAL */}
      {showHowToPlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
          <div className="w-full max-w-lg bg-slate-900 border-2 border-slate-700 rounded-3xl p-6 shadow-2xl space-y-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <HelpCircle className="w-6 h-6 text-cyan-400" />
                <h3 className="text-2xl font-black text-white">HOW TO PLAY</h3>
              </div>
              <button
                onClick={() => setShowHowToPlay(false)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-sm text-slate-300">
              <div className="p-3.5 bg-cyan-950/40 border border-cyan-800/40 rounded-2xl">
                <h4 className="font-black text-cyan-300 mb-1 flex items-center space-x-1.5">
                  <span>🟦 CREWMATE OBJECTIVE</span>
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Complete all assigned tasks across the Skeld, or identify and vote out all Impostors during emergency meetings to win.
                </p>
              </div>

              <div className="p-3.5 bg-red-950/40 border border-red-800/40 rounded-2xl">
                <h4 className="font-black text-red-400 mb-1 flex items-center space-x-1.5">
                  <span>🟥 IMPOSTOR OBJECTIVE</span>
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Eliminate crewmates until impostors equal crewmates, or trigger unstopped critical sabotage (Reactor Meltdown / O2 Depletion). Use vents to navigate unseen.
                </p>
              </div>

              <div className="p-3.5 bg-amber-950/40 border border-amber-800/40 rounded-2xl">
                <h4 className="font-black text-amber-300 mb-1">🛠️ ENGINEER ROLE</h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Engineers are crewmates who can use ship vents for 6 seconds at a time. Their vent access recharges for 20 seconds after exiting.
                </p>
              </div>

              <div className="p-3.5 bg-slate-800/70 rounded-2xl border border-slate-700 space-y-2">
                <h4 className="font-black text-yellow-300 uppercase tracking-wider text-xs">🎮 CONTROLS</h4>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                  <div><strong className="text-white">WASD / Arrows:</strong> Move Character</div>
                  <div><strong className="text-white">Mouse Drag:</strong> Orbit Camera</div>
                  <div><strong className="text-white">E / Space:</strong> Use / Interact</div>
                  <div><strong className="text-white">Q:</strong> Kill (Impostor)</div>
                  <div><strong className="text-white">R:</strong> Report Dead Body</div>
                  <div><strong className="text-white">F:</strong> Vent In / Out</div>
                  <div><strong className="text-white">M / Tab:</strong> Open Map</div>
                  <div><strong className="text-white">Sabotage:</strong> Choose a system from the HUD</div>
                  <div><strong className="text-white">Touch:</strong> Virtual Joystick & HUD</div>
                  <div><strong className="text-white">V:</strong> Toggle 1st / 3rd Person</div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowHowToPlay(false)}
              className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-black rounded-xl cursor-pointer transition-all"
            >
              GOT IT, LET'S PLAY!
            </button>
          </div>
        </div>
      )}

      {/* AUDIO SETTINGS MODAL */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-slate-900 border-2 border-slate-700 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Volume2 className="w-5 h-5 text-cyan-400" />
                <h3 className="text-xl font-black text-white">AUDIO SETTINGS</h3>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs font-black text-slate-300 mb-1.5">
                  <span>MASTER VOLUME</span>
                  <span className="text-cyan-400">{Math.round(masterVol * 100)}%</span>
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
                  className="w-full accent-cyan-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-black text-slate-300 mb-1.5">
                  <span>SOUND EFFECTS (SFX)</span>
                  <span className="text-cyan-400">{Math.round(sfxVol * 100)}%</span>
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
                  className="w-full accent-cyan-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
            </div>

            <button
              onClick={() => setShowSettings(false)}
              className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black rounded-xl cursor-pointer shadow-lg transition-all"
            >
              APPLY & RETURN
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
