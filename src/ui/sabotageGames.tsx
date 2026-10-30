/**
 * Impostor Protocol - Interactive Sabotage Repair Mini-Games
 * Authentic mini-games for fixing shipwide sabotages:
 * 1. Electrical: 5 Breaker Toggle Switches
 * 2. Reactor: Hand Scanner Biometric Hold
 * 3. O2: Numeric Keypad with Sticky Note Code
 * 4. Communications: Radio Frequency Waveform Tuner
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Flame, Radio, Shield, Wrench, X, Zap } from 'lucide-react';
import { soundEngine } from '../audio';

interface SabotageGameProps {
  partId: number;
  onResolve: () => void;
  onClose: () => void;
}

// -----------------------------------------------------------------------------
// 1. Lights Out: Electrical Breaker Switches
// -----------------------------------------------------------------------------
export const LightsFixGame: React.FC<SabotageGameProps> = ({ onResolve, onClose }) => {
  // 5 switches, initialized with 2-3 randomized in the OFF (down) position
  const [switches, setSwitches] = useState<boolean[]>(() => {
    const init = [false, true, false, false, true];
    // Guarantee at least 2 are OFF
    return init.sort(() => Math.random() - 0.5);
  });

  const toggle = (idx: number) => {
    soundEngine.playClick();
    setSwitches((prev) => {
      const next = [...prev];
      next[idx] = !next[idx];
      if (next.every((s) => s)) {
        setTimeout(() => {
          soundEngine.playSabotageFixed();
          onResolve();
        }, 300);
      }
      return next;
    });
  };

  const allOn = switches.every((s) => s);

  return (
    <div className="relative w-full max-w-md bg-slate-900 border-4 border-yellow-500/80 rounded-3xl p-6 shadow-2xl flex flex-col items-center select-none">
      <div className="w-full flex items-center justify-between pb-3 border-b border-slate-700 mb-4">
        <div className="flex items-center space-x-2">
          <Zap className="w-6 h-6 text-yellow-400" />
          <h3 className="text-xl font-black text-yellow-300 tracking-wider">ELECTRICAL BREAKERS</h3>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white cursor-pointer">
          <X className="w-5 h-5" />
        </button>
      </div>

      <p className="text-xs text-slate-300 font-bold mb-6 text-center">
        Flip all circuit breakers UP to restore primary ship lighting!
      </p>

      {/* 5 Breaker switch tracks */}
      <div className="grid grid-cols-5 gap-3 w-full px-2 py-4 bg-slate-950 rounded-2xl border-2 border-slate-800 mb-6">
        {switches.map((isOn, idx) => (
          <div key={idx} className="flex flex-col items-center space-y-2">
            {/* Indicator LED */}
            <div
              className={`w-3.5 h-3.5 rounded-full border ${
                isOn
                  ? 'bg-emerald-400 border-emerald-200 shadow-[0_0_10px_rgba(52,211,153,0.8)]'
                  : 'bg-red-500 border-red-300 shadow-[0_0_8px_rgba(239,68,68,0.6)]'
              }`}
            />
            {/* Vertical Toggle Switch Slot */}
            <button
              onClick={() => toggle(idx)}
              className="relative w-12 h-28 bg-slate-800 rounded-xl border-2 border-slate-700 cursor-pointer overflow-hidden transition-all active:scale-95 flex flex-col justify-between p-1"
            >
              <div
                className={`w-full h-12 rounded-lg border-2 transition-all duration-200 flex items-center justify-center font-black text-xs ${
                  isOn
                    ? 'translate-y-0 bg-emerald-500 border-emerald-300 text-slate-950 shadow-md'
                    : 'translate-y-12 bg-red-600 border-red-400 text-white shadow-md'
                }`}
              >
                {isOn ? 'ON' : 'OFF'}
              </div>
            </button>
            <span className="text-[10px] font-mono text-slate-400">BRK-{idx + 1}</span>
          </div>
        ))}
      </div>

      {allOn && (
        <div className="flex items-center space-x-2 text-emerald-400 font-black animate-pulse">
          <Check className="w-5 h-5" />
          <span>POWER RESTORED</span>
        </div>
      )}
    </div>
  );
};

// -----------------------------------------------------------------------------
// 2. Reactor Meltdown: Biometric Hand Scanner Hold
// -----------------------------------------------------------------------------
export const ReactorFixGame: React.FC<SabotageGameProps> = ({ partId, onResolve, onClose }) => {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (holding) {
      timerRef.current = window.setInterval(() => {
        setProgress((p) => {
          if (p >= 100) {
            clearInterval(timerRef.current!);
            soundEngine.playSabotageFixed();
            onResolve();
            return 100;
          }
          return p + 6;
        });
      }, 50);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setProgress(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [holding, onResolve]);

  return (
    <div className="relative w-full max-w-md bg-slate-900 border-4 border-red-600/90 rounded-3xl p-6 shadow-2xl flex flex-col items-center select-none">
      <div className="w-full flex items-center justify-between pb-3 border-b border-slate-700 mb-4">
        <div className="flex items-center space-x-2">
          <Flame className="w-6 h-6 text-red-500 animate-pulse" />
          <h3 className="text-xl font-black text-red-400 tracking-wider">
            REACTOR MANIFOLD #{partId}
          </h3>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white cursor-pointer">
          <X className="w-5 h-5" />
        </button>
      </div>

      <p className="text-xs text-red-300 font-bold mb-4 text-center">
        PRESS AND HOLD THE BIOMETRIC SCANNER TO STABILIZE THE REACTOR CORE!
      </p>

      {/* Biometric Hand Scanner Stage */}
      <div className="relative w-48 h-48 rounded-full border-4 border-red-500/70 bg-slate-950 flex flex-col items-center justify-center p-4 my-2 shadow-[inset_0_0_30px_rgba(239,68,68,0.3)]">
        {/* Progress SVG Ring */}
        <svg className="absolute inset-0 w-full h-full -rotate-90">
          <circle cx="96" cy="96" r="88" fill="none" stroke="#1e293b" strokeWidth="8" />
          <circle
            cx="96"
            cy="96"
            r="88"
            fill="none"
            stroke="#ef4444"
            strokeWidth="8"
            strokeDasharray={2 * Math.PI * 88}
            strokeDashoffset={2 * Math.PI * 88 * (1 - progress / 100)}
            strokeLinecap="round"
            className="transition-all duration-75"
          />
        </svg>

        {/* Hand Print Icon */}
        <button
          onPointerDown={() => {
            soundEngine.playClick();
            setHolding(true);
          }}
          onPointerUp={() => setHolding(false)}
          onPointerLeave={() => setHolding(false)}
          className={`relative z-10 w-32 h-32 rounded-full border-2 transition-all flex flex-col items-center justify-center cursor-pointer active:scale-95 ${
            holding
              ? 'bg-red-600/80 border-red-300 shadow-[0_0_30px_rgba(239,68,68,0.8)]'
              : 'bg-slate-900 border-slate-700 hover:border-red-400'
          }`}
        >
          <span className="text-4xl">🖐️</span>
          <span className="text-[10px] font-black text-white mt-1 tracking-wider uppercase">
            {holding ? `${Math.round(progress)}%` : 'HOLD SCANNER'}
          </span>
        </button>
      </div>

      <div className="mt-4 text-xs font-mono text-slate-400">
        Both upper and lower reactor manifolds must be engaged!
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// 3. O2 Depletion: Numeric Keypad with Sticky Note Code
// -----------------------------------------------------------------------------
export const O2FixGame: React.FC<SabotageGameProps> = ({ partId, onResolve, onClose }) => {
  // Generate random 5-digit code
  const targetCode = useMemo(() => {
    return Math.floor(10000 + Math.random() * 90000).toString();
  }, []);

  const [entered, setEntered] = useState('');
  const [errorFlash, setErrorFlash] = useState(false);

  const pressKey = (num: string) => {
    soundEngine.playClick();
    if (entered.length < 5) {
      const next = entered + num;
      setEntered(next);
      if (next.length === 5) {
        if (next === targetCode) {
          soundEngine.playSabotageFixed();
          setTimeout(() => onResolve(), 300);
        } else {
          setErrorFlash(true);
          setTimeout(() => {
            setEntered('');
            setErrorFlash(false);
          }, 600);
        }
      }
    }
  };

  const backspace = () => {
    soundEngine.playClick();
    setEntered((prev) => prev.slice(0, -1));
  };

  return (
    <div className="relative w-full max-w-sm bg-slate-900 border-4 border-emerald-500/80 rounded-3xl p-6 shadow-2xl flex flex-col items-center select-none">
      <div className="w-full flex items-center justify-between pb-3 border-b border-slate-700 mb-4">
        <div className="flex items-center space-x-2">
          <Shield className="w-6 h-6 text-emerald-400" />
          <h3 className="text-xl font-black text-emerald-300 tracking-wider">
            O2 LIFE SUPPORT #{partId}
          </h3>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white cursor-pointer">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Sticky Note with Code */}
      <div className="w-full bg-yellow-200 text-slate-900 font-mono font-black text-center py-2 px-4 rounded-xl shadow-md rotate-[-1.5deg] mb-4 border border-yellow-400 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-yellow-800">EMERGENCY PIN:</span>
        <span className="text-2xl tracking-widest text-slate-950 font-black">{targetCode}</span>
      </div>

      {/* PIN Output Display */}
      <div
        className={`w-full py-3 px-4 rounded-2xl border-2 font-mono text-center text-3xl font-black tracking-widest mb-4 transition-all ${
          errorFlash
            ? 'bg-red-950 border-red-500 text-red-400 animate-shake'
            : 'bg-slate-950 border-slate-800 text-emerald-400'
        }`}
      >
        {entered.padEnd(5, '_')}
      </div>

      {/* Numeric Keypad Grid */}
      <div className="grid grid-cols-3 gap-2 w-full max-w-[280px]">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <button
            key={digit}
            onClick={() => pressKey(digit)}
            className="h-12 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 border-2 border-slate-700 text-white font-mono text-xl font-bold cursor-pointer transition-all"
          >
            {digit}
          </button>
        ))}
        <button
          onClick={backspace}
          className="h-12 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 border-2 border-slate-700 text-slate-400 font-bold cursor-pointer transition-all flex items-center justify-center text-xs"
        >
          CLEAR
        </button>
        <button
          onClick={() => pressKey('0')}
          className="h-12 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 border-2 border-slate-700 text-white font-mono text-xl font-bold cursor-pointer transition-all"
        >
          0
        </button>
        <div className="h-12 rounded-xl bg-slate-950 border-2 border-slate-900 flex items-center justify-center text-emerald-400 font-mono text-xs">
          OK
        </div>
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// 4. Comms Out: Radio Waveform Tuner
// -----------------------------------------------------------------------------
export const CommsFixGame: React.FC<SabotageGameProps> = ({ onResolve, onClose }) => {
  const targetFreq = useMemo(() => Math.floor(30 + Math.random() * 40), []);
  const [sliderVal, setSliderVal] = useState(50);
  const diff = Math.abs(sliderVal - targetFreq);
  const isAligned = diff <= 3;

  useEffect(() => {
    if (isAligned) {
      soundEngine.playSabotageFixed();
      const timeout = setTimeout(() => {
        onResolve();
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [isAligned, onResolve]);

  return (
    <div className="relative w-full max-w-md bg-slate-900 border-4 border-cyan-500/80 rounded-3xl p-6 shadow-2xl flex flex-col items-center select-none">
      <div className="w-full flex items-center justify-between pb-3 border-b border-slate-700 mb-4">
        <div className="flex items-center space-x-2">
          <Radio className="w-6 h-6 text-cyan-400 animate-pulse" />
          <h3 className="text-xl font-black text-cyan-300 tracking-wider">COMMUNICATIONS RELAY</h3>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white cursor-pointer">
          <X className="w-5 h-5" />
        </button>
      </div>

      <p className="text-xs text-slate-300 font-bold mb-4 text-center">
        Rotate the tuner dial until your signal wave matches the target radio frequency!
      </p>

      {/* Waveform Display Screen */}
      <div className="w-full h-36 bg-slate-950 border-2 border-slate-800 rounded-2xl relative overflow-hidden flex items-center justify-center mb-6">
        {/* Oscilloscope Grid */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: 'radial-gradient(#38bdf8 1px, transparent 1px)',
            backgroundSize: '16px 16px',
          }}
        />

        {/* Target waveform (Red/Orange) */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 300 100" preserveAspectRatio="none">
          <path
            d={`M 0 50 Q 75 ${50 - targetFreq * 0.7} 150 50 T 300 50`}
            fill="none"
            stroke="#ef4444"
            strokeWidth="3"
            opacity="0.75"
          />
        </svg>

        {/* Player waveform (Cyan) */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 300 100" preserveAspectRatio="none">
          <path
            d={`M 0 50 Q 75 ${50 - sliderVal * 0.7} 150 50 T 300 50`}
            fill="none"
            stroke={isAligned ? '#34d399' : '#38bdf8'}
            strokeWidth="3.5"
            className="transition-all duration-75"
          />
        </svg>

        {/* Center lock status */}
        <div className="absolute top-2 right-3 flex items-center space-x-1.5 bg-slate-900/90 border border-slate-700 px-2.5 py-1 rounded-full text-[10px] font-mono">
          <span className={`w-2 h-2 rounded-full ${isAligned ? 'bg-emerald-400 animate-ping' : 'bg-red-500'}`} />
          <span className={isAligned ? 'text-emerald-300 font-bold' : 'text-slate-400'}>
            {isAligned ? 'SIGNAL LOCKED' : 'SEARCHING...'}
          </span>
        </div>
      </div>

      {/* Tuner Slider Control */}
      <div className="w-full flex flex-col items-center space-y-2">
        <div className="flex items-center justify-between w-full text-xs font-mono text-slate-400 px-1">
          <span>0 MHz</span>
          <span className="text-cyan-300 font-bold">{sliderVal.toFixed(1)} MHz</span>
          <span>100 MHz</span>
        </div>
        <input
          type="range"
          min="10"
          max="90"
          step="0.5"
          value={sliderVal}
          onChange={(e) => setSliderVal(parseFloat(e.target.value))}
          className="w-full h-3 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
        />
      </div>
    </div>
  );
};
