/**
 * Impostor Protocol - Interactive 2D Task Mini-Games
 * Authentic tactile mini-games:
 * 1. Fix Wiring: SVG drag-and-drop wire terminals with color matching
 * 2. Swipe Card: Velocity-tracked ID card reader with goldilocks timing
 * 3. Clear Asteroids: CRT vector radar monitor with click-to-shatter laser cannons
 * 4. Unlock Manifolds: 1-10 sequential keypad scramble
 */

import React, { useEffect, useRef, useState } from 'react';
import { X, CheckCircle2, AlertTriangle, Crosshair, Sparkles } from 'lucide-react';
import { soundEngine } from '../audio';

interface TaskModalProps {
  taskName: string;
  onComplete: () => void;
  onClose: () => void;
}

// ============================================================================
// 1. FIX WIRING MINI-GAME
// ============================================================================

const WIRE_COLORS = [
  { id: 'red', hex: '#ef4444', label: 'RED' },
  { id: 'blue', hex: '#3b82f6', label: 'BLUE' },
  { id: 'yellow', hex: '#eab308', label: 'YELLOW' },
  { id: 'magenta', hex: '#ec4899', label: 'MAGENTA' },
];

export const FixWiringModal: React.FC<TaskModalProps> = ({ taskName, onComplete, onClose }) => {
  // Scramble right side order once per session
  const [rightColors] = useState(() => [...WIRE_COLORS].sort(() => Math.random() - 0.5));
  const [connected, setConnected] = useState<Record<string, string>>({}); // leftColorId -> rightColorId
  const [activeDrag, setActiveDrag] = useState<{
    colorId: string;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = (colorId: string, e: React.PointerEvent) => {
    if (isCompleted || connected[colorId]) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    soundEngine.playClick();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;

    setActiveDrag({
      colorId,
      startX,
      startY,
      currentX: startX,
      currentY: startY,
    });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activeDrag) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    setActiveDrag((prev) =>
      prev
        ? {
            ...prev,
            currentX: e.clientX - rect.left,
            currentY: e.clientY - rect.top,
          }
        : null
    );
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!activeDrag) return;

    // Check if pointer is near any right terminal
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const dropX = e.clientX - rect.left;
      const dropY = e.clientY - rect.top;

      // Find if we hit the matching color terminal on the right
      const rightTerminals = document.querySelectorAll('[data-wire-right]');
      let matched = false;

      rightTerminals.forEach((el) => {
        const targetColor = el.getAttribute('data-wire-right');
        const elRect = el.getBoundingClientRect();
        const targetX = elRect.left - rect.left + elRect.width / 2;
        const targetY = elRect.top - rect.top + elRect.height / 2;

        const dist = Math.hypot(dropX - targetX, dropY - targetY);
        if (dist < 42 && targetColor === activeDrag.colorId) {
          matched = true;
          soundEngine.playMiniGameBeep(720);
          const next = { ...connected, [activeDrag.colorId]: targetColor };
          setConnected(next);

          if (Object.keys(next).length === WIRE_COLORS.length) {
            setIsCompleted(true);
            soundEngine.playTaskSuccess();
            setTimeout(() => onComplete(), 750);
          }
        }
      });

      if (!matched) {
        soundEngine.playMiniGameError();
      }
    }

    setActiveDrag(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fadeIn select-none">
      <div className="relative w-full max-w-lg bg-slate-900 border-2 border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-800/90 border-b border-slate-700">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse" />
            <h3 className="text-sm font-bold tracking-wider text-slate-100 uppercase">
              {taskName} · Electrical Panel
            </h3>
          </div>
          <button
            onClick={() => {
              soundEngine.playClick();
              onClose();
            }}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Panel Work Area */}
        <div
          ref={containerRef}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="relative h-80 bg-slate-950 p-6 flex justify-between items-center touch-none overflow-hidden"
        >
          {/* SVG Canvas for Wires */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
            {/* Connected wires */}
            {Object.entries(connected).map(([leftColor, rightColor]) => {
              const leftIndex = WIRE_COLORS.findIndex((c) => c.id === leftColor);
              const rightIndex = rightColors.findIndex((c) => c.id === rightColor);
              const y1 = 40 + leftIndex * 65;
              const y2 = 40 + rightIndex * 65;
              const colorDef = WIRE_COLORS.find((c) => c.id === leftColor);

              return (
                <g key={leftColor}>
                  <path
                    d={`M 50 ${y1} C 160 ${y1}, 240 ${y2}, 380 ${y2}`}
                    fill="none"
                    stroke={colorDef?.hex}
                    strokeWidth="8"
                    strokeLinecap="round"
                    className="drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]"
                  />
                  <path
                    d={`M 50 ${y1} C 160 ${y1}, 240 ${y2}, 380 ${y2}`}
                    fill="none"
                    stroke="rgba(255,255,255,0.3)"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </g>
              );
            })}

            {/* Currently dragging wire */}
            {activeDrag && (
              <path
                d={`M 50 ${activeDrag.startY} C ${50 + (activeDrag.currentX - 50) * 0.5} ${
                  activeDrag.startY
                }, ${activeDrag.currentX - (activeDrag.currentX - 50) * 0.3} ${
                  activeDrag.currentY
                }, ${activeDrag.currentX} ${activeDrag.currentY}`}
                fill="none"
                stroke={WIRE_COLORS.find((c) => c.id === activeDrag.colorId)?.hex}
                strokeWidth="8"
                strokeLinecap="round"
                className="drop-shadow-[0_0_12px_rgba(255,255,255,0.6)]"
              />
            )}
          </svg>

          {/* Left Terminals */}
          <div className="flex flex-col space-y-6 z-20">
            {WIRE_COLORS.map((w) => {
              const isDone = !!connected[w.id];
              return (
                <div key={w.id} className="flex items-center space-x-3">
                  <div
                    onPointerDown={(e) => handlePointerDown(w.id, e)}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-transform ${
                      isDone ? 'opacity-80 scale-95' : 'hover:scale-110 active:scale-95 shadow-lg'
                    }`}
                    style={{ backgroundColor: w.hex }}
                  >
                    <div className="w-3.5 h-3.5 rounded-full bg-slate-900 border-2 border-white/60" />
                  </div>
                  <span className="text-xs font-mono font-bold tracking-wider text-slate-400 w-16">
                    {w.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Right Terminals */}
          <div className="flex flex-col space-y-6 z-20 items-end">
            {rightColors.map((w) => {
              const isDone = Object.values(connected).includes(w.id);
              return (
                <div key={w.id} className="flex items-center space-x-3">
                  <span className="text-xs font-mono font-bold tracking-wider text-slate-400 w-16 text-right">
                    {w.label}
                  </span>
                  <div
                    data-wire-right={w.id}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center border-2 transition-all ${
                      isDone
                        ? 'border-white shadow-[0_0_12px_rgba(255,255,255,0.4)]'
                        : 'border-slate-700 bg-slate-900'
                    }`}
                    style={{ backgroundColor: isDone ? w.hex : undefined }}
                  >
                    <div
                      className="w-3.5 h-3.5 rounded-full border border-white/40"
                      style={{ backgroundColor: w.hex }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Status */}
        <div className="px-5 py-3 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs font-mono">
          <span className="text-slate-400">
            CONNECTED: {Object.keys(connected).length} / 4
          </span>
          {isCompleted ? (
            <span className="text-emerald-400 font-bold flex items-center space-x-1">
              <CheckCircle2 className="w-4 h-4" />
              <span>CIRCUITS RESTORED</span>
            </span>
          ) : (
            <span className="text-slate-500">Drag wire to matching color</span>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 2. SWIPE CARD MINI-GAME
// ============================================================================

export const SwipeCardModal: React.FC<TaskModalProps> = ({ taskName, onComplete, onClose }) => {
  const [cardStatus, setCardStatus] = useState<
    'idle' | 'ready' | 'swiping' | 'too_fast' | 'too_slow' | 'bad_read' | 'accepted'
  >('idle');
  const [cardX, setCardX] = useState(0);
  const [cardInReader, setCardInReader] = useState(false);
  const swipeStartTime = useRef<number>(0);
  const swipeStartX = useRef<number>(0);

  const readerWidth = 320;

  const handleTakeCard = () => {
    if (cardStatus === 'accepted') return;
    soundEngine.playClick();
    setCardInReader(true);
    setCardStatus('ready');
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (cardStatus === 'accepted' || !cardInReader) return;
    soundEngine.playClick();
    swipeStartTime.current = performance.now();
    swipeStartX.current = e.clientX;
    setCardStatus('swiping');
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (cardStatus !== 'swiping') return;
    const delta = e.clientX - swipeStartX.current;
    setCardX(Math.max(0, Math.min(delta, readerWidth)));
  };

  const handlePointerUp = () => {
    if (cardStatus !== 'swiping') return;
    const duration = performance.now() - swipeStartTime.current;
    const distance = cardX;

    if (distance < readerWidth * 0.7) {
      soundEngine.playMiniGameError();
      setCardStatus('bad_read');
      setCardX(0);
    } else if (duration < 240) {
      soundEngine.playMiniGameError();
      setCardStatus('too_fast');
      setCardX(0);
    } else if (duration > 1100) {
      soundEngine.playMiniGameError();
      setCardStatus('too_slow');
      setCardX(0);
    } else {
      // Golden speed!
      soundEngine.playTaskSuccess();
      setCardStatus('accepted');
      setTimeout(() => onComplete(), 750);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fadeIn select-none">
      <div className="relative w-full max-w-md bg-slate-900 border-2 border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-800/90 border-b border-slate-700">
          <div className="flex items-center space-x-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                cardStatus === 'accepted'
                  ? 'bg-emerald-400'
                  : cardStatus === 'too_fast' || cardStatus === 'too_slow' || cardStatus === 'bad_read'
                  ? 'bg-red-500 animate-pulse'
                  : 'bg-emerald-500 animate-pulse'
              }`}
            />
            <h3 className="text-sm font-bold tracking-wider text-slate-100 uppercase">
              {taskName} · Admin Terminal
            </h3>
          </div>
          <button
            onClick={() => {
              soundEngine.playClick();
              onClose();
            }}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Reader Display */}
        <div className="bg-slate-950 p-6 flex flex-col items-center">
          {/* LCD Screen */}
          <div className="w-full bg-emerald-950/40 border-2 border-emerald-800/70 rounded-xl p-4 text-center mb-6 shadow-inner">
            <span className="text-[10px] font-mono font-bold tracking-widest text-emerald-600 block uppercase">
              SECURITY ACCESS PROTOCOL
            </span>
            <div className="text-lg font-mono font-black mt-1 tracking-wider text-emerald-400">
              {cardStatus === 'idle' && 'INSERT CARD TO SWIPE'}
              {cardStatus === 'ready' && 'SWIPE CARD ACROSS READER'}
              {cardStatus === 'swiping' && 'READING MAGNETIC STRIP...'}
              {cardStatus === 'too_fast' && 'TOO FAST. TRY AGAIN.'}
              {cardStatus === 'too_slow' && 'TOO SLOW. TRY AGAIN.'}
              {cardStatus === 'bad_read' && 'BAD READ. SWIPE ENTIRE SLOT.'}
              {cardStatus === 'accepted' && 'ACCEPTED. THANK YOU.'}
            </div>
          </div>

          {/* Scanner Channel Slot */}
          <div className="relative w-full h-24 bg-slate-800 rounded-xl border-2 border-slate-700 p-2 flex items-center overflow-hidden mb-8">
            <div className="w-full h-3 bg-slate-950 rounded-full border border-slate-900 shadow-inner" />

            {/* Draggable Card inside slot */}
            {cardInReader && (
              <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                style={{ transform: `translateX(${cardX}px)` }}
                className="absolute top-2 w-28 h-20 bg-gradient-to-br from-cyan-600 to-blue-700 rounded-lg shadow-2xl border-2 border-cyan-300 p-2 cursor-grab active:cursor-grabbing flex flex-col justify-between touch-none transition-transform duration-75"
              >
                <div className="flex justify-between items-center">
                  <div className="w-5 h-4 bg-yellow-400 rounded-sm border border-yellow-200" />
                  <span className="text-[8px] font-mono font-bold text-cyan-200">SKELD PASS</span>
                </div>
                <div className="text-[9px] font-mono font-bold text-white tracking-widest">
                  CREWMATE ID
                </div>
              </div>
            )}
          </div>

          {/* Card Wallet / Pickup Area */}
          {!cardInReader && (
            <div
              onClick={handleTakeCard}
              className="w-48 h-28 bg-gradient-to-br from-cyan-600 to-blue-700 rounded-xl shadow-xl border-2 border-cyan-300 p-3 cursor-pointer hover:scale-105 active:scale-95 transition-all flex flex-col justify-between"
            >
              <div className="flex justify-between items-center">
                <div className="w-6 h-5 bg-yellow-400 rounded-sm border border-yellow-200" />
                <span className="text-[9px] font-mono font-bold text-cyan-200">SKELD PASS</span>
              </div>
              <div className="text-center font-mono text-xs font-bold text-white tracking-widest bg-cyan-900/60 py-1 rounded">
                CLICK TO INSERT CARD
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-900 border-t border-slate-800 flex justify-between items-center text-xs font-mono">
          <span className="text-slate-400">STATUS: {cardStatus.toUpperCase()}</span>
          {cardStatus === 'accepted' ? (
            <span className="text-emerald-400 font-bold flex items-center space-x-1">
              <CheckCircle2 className="w-4 h-4" />
              <span>ACCESS GRANTED</span>
            </span>
          ) : (
            <span className="text-slate-500">Swipe at steady goldilocks speed</span>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 3. CLEAR ASTEROIDS MINI-GAME
// ============================================================================

interface Asteroid {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  points: { x: number; y: number }[];
}

export const ClearAsteroidsModal: React.FC<TaskModalProps> = ({ taskName, onComplete, onClose }) => {
  const [clearedCount, setClearedCount] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [asteroids, setAsteroids] = useState<Asteroid[]>([]);
  const [laserEffect, setLaserEffect] = useState<{ x: number; y: number } | null>(null);

  const canvasWidth = 440;
  const canvasHeight = 300;

  // Initialize 10 asteroids with procedural jagged vertices
  useEffect(() => {
    const list: Asteroid[] = [];
    for (let i = 0; i < 10; i++) {
      const size = 22 + Math.random() * 12;
      const pts = [];
      const numPts = 7;
      for (let p = 0; p < numPts; p++) {
        const angle = (p / numPts) * Math.PI * 2;
        const r = size * (0.8 + Math.random() * 0.4);
        pts.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
      }

      list.push({
        id: i,
        x: 40 + Math.random() * (canvasWidth - 80),
        y: 30 + Math.random() * (canvasHeight - 60),
        vx: (Math.random() - 0.5) * 35,
        vy: (Math.random() - 0.5) * 35,
        size,
        points: pts,
      });
    }
    setAsteroids(list);
  }, []);

  // Asteroid drift loop
  useEffect(() => {
    if (isCompleted) return;
    const interval = setInterval(() => {
      setAsteroids((prev) =>
        prev.map((a) => {
          let nx = a.x + a.vx * 0.05;
          let ny = a.y + a.vy * 0.05;
          let nvx = a.vx;
          let nvy = a.vy;

          if (nx < a.size || nx > canvasWidth - a.size) nvx = -nvx;
          if (ny < a.size || ny > canvasHeight - a.size) nvy = -nvy;

          return { ...a, x: nx, y: ny, vx: nvx, vy: nvy };
        })
      );
    }, 50);

    return () => clearInterval(interval);
  }, [isCompleted]);

  const handleShoot = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isCompleted) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    soundEngine.playMiniGameBeep(850);
    setLaserEffect({ x: clickX, y: clickY });
    setTimeout(() => setLaserEffect(null), 120);

    // Check hit
    const hitIndex = asteroids.findIndex(
      (a) => Math.hypot(clickX - a.x, clickY - a.y) <= a.size + 10
    );

    if (hitIndex !== -1) {
      soundEngine.playMiniGameBeep(1200);
      const remaining = asteroids.filter((_, idx) => idx !== hitIndex);
      const newCleared = clearedCount + 1;
      setAsteroids(remaining);
      setClearedCount(newCleared);

      if (newCleared >= 10 || remaining.length === 0) {
        setIsCompleted(true);
        soundEngine.playTaskSuccess();
        setTimeout(() => onComplete(), 750);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fadeIn select-none">
      <div className="relative w-full max-w-lg bg-slate-900 border-2 border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-800/90 border-b border-slate-700">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h3 className="text-sm font-bold tracking-wider text-slate-100 uppercase">
              {taskName} · Weapons Radar
            </h3>
          </div>
          <button
            onClick={() => {
              soundEngine.playClick();
              onClose();
            }}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Radar Screen */}
        <div
          onClick={handleShoot}
          className="relative h-80 bg-emerald-950/90 border-b border-slate-800 overflow-hidden cursor-crosshair"
        >
          {/* Radar Circles and Grid Overlay */}
          <div className="absolute inset-0 pointer-events-none opacity-20">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 border border-emerald-400 rounded-full" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border border-emerald-400 rounded-full" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 border border-emerald-400 rounded-full" />
            <div className="absolute top-1/2 left-0 right-0 h-px bg-emerald-400" />
            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-emerald-400" />
          </div>

          {/* Asteroids */}
          {asteroids.map((a) => (
            <div
              key={a.id}
              style={{
                left: `${a.x - a.size}px`,
                top: `${a.y - a.size}px`,
                width: `${a.size * 2}px`,
                height: `${a.size * 2}px`,
              }}
              className="absolute pointer-events-none transition-transform"
            >
              <svg width={a.size * 2} height={a.size * 2}>
                <polygon
                  points={a.points.map((p) => `${p.x + a.size},${p.y + a.size}`).join(' ')}
                  fill="#064e3b"
                  stroke="#34d399"
                  strokeWidth="2"
                />
              </svg>
            </div>
          ))}

          {/* Dual Laser Flash Line */}
          {laserEffect && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              <line
                x1="0"
                y1={canvasHeight}
                x2={laserEffect.x}
                y2={laserEffect.y}
                stroke="#67e8f9"
                strokeWidth="4"
              />
              <line
                x1={canvasWidth}
                y1={canvasHeight}
                x2={laserEffect.x}
                y2={laserEffect.y}
                stroke="#67e8f9"
                strokeWidth="4"
              />
              <circle cx={laserEffect.x} cy={laserEffect.y} r="12" fill="#a5f3fc" />
            </svg>
          )}

          {/* Scanline Sweep FX */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-500/5 to-transparent h-12 w-full animate-pulse pointer-events-none" />
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-900 flex justify-between items-center text-xs font-mono">
          <span className="text-emerald-400 font-bold">
            CLEARED: {clearedCount} / 10
          </span>
          {isCompleted ? (
            <span className="text-emerald-400 font-bold flex items-center space-x-1">
              <CheckCircle2 className="w-4 h-4" />
              <span>RADAR SECTOR CLEAR</span>
            </span>
          ) : (
            <span className="text-slate-500">Click asteroids to fire targeting lasers</span>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 4. UNLOCK MANIFOLDS MINI-GAME
// ============================================================================

export const UnlockManifoldsModal: React.FC<TaskModalProps> = ({ taskName, onComplete, onClose }) => {
  // Scramble 1-10 on 2x5 grid
  const [numbers] = useState(() =>
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].sort(() => Math.random() - 0.5)
  );
  const [currentStep, setCurrentStep] = useState(1);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isError, setIsError] = useState(false);

  const handleClickNumber = (num: number) => {
    if (isCompleted || isError) return;

    if (num === currentStep) {
      soundEngine.playMiniGameBeep(450 + num * 65);
      const next = currentStep + 1;
      setCurrentStep(next);

      if (next > 10) {
        setIsCompleted(true);
        soundEngine.playTaskSuccess();
        setTimeout(() => onComplete(), 750);
      }
    } else {
      soundEngine.playMiniGameError();
      setIsError(true);
      setTimeout(() => {
        setCurrentStep(1);
        setIsError(false);
      }, 500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fadeIn select-none">
      <div className="relative w-full max-w-md bg-slate-900 border-2 border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-800/90 border-b border-slate-700">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <h3 className="text-sm font-bold tracking-wider text-slate-100 uppercase">
              {taskName} · Reactor Subsystem
            </h3>
          </div>
          <button
            onClick={() => {
              soundEngine.playClick();
              onClose();
            }}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Number Pad Grid */}
        <div className="bg-slate-950 p-6 flex flex-col items-center">
          <div className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 mb-6 flex justify-between items-center text-xs font-mono">
            <span className="text-slate-400">INPUT SEQUENCE:</span>
            <span className="text-cyan-400 font-bold text-sm tracking-widest">
              NEXT: {currentStep <= 10 ? currentStep : 'DONE'}
            </span>
          </div>

          <div className="grid grid-cols-5 gap-3 w-full">
            {numbers.map((num) => {
              const isPressed = num < currentStep;
              return (
                <button
                  key={num}
                  onClick={() => handleClickNumber(num)}
                  disabled={isPressed || isCompleted}
                  className={`h-16 rounded-xl font-mono text-2xl font-black transition-all border-2 flex items-center justify-center ${
                    isError
                      ? 'bg-red-950/80 border-red-500 text-red-200'
                      : isPressed
                      ? 'bg-emerald-600 border-emerald-400 text-white shadow-[0_0_12px_rgba(52,211,153,0.5)]'
                      : 'bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700 active:scale-95 shadow-md'
                  }`}
                >
                  {num}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-900 border-t border-slate-800 flex justify-between items-center text-xs font-mono">
          <span className="text-slate-400">UNLOCKED: {currentStep - 1} / 10</span>
          {isCompleted ? (
            <span className="text-emerald-400 font-bold flex items-center space-x-1">
              <CheckCircle2 className="w-4 h-4" />
              <span>MANIFOLDS UNLOCKED</span>
            </span>
          ) : (
            <span className="text-slate-500">Tap numbers in ascending order (1-10)</span>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 5. GENERIC TASK PROGRESS MODAL (FALLBACK)
// ============================================================================

export const GenericTaskModal: React.FC<TaskModalProps & { holdSeconds?: number }> = ({
  taskName,
  holdSeconds = 3,
  onComplete,
  onClose,
}) => {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (holding && !isCompleted) {
      const stepMs = 50;
      const increment = (stepMs / (holdSeconds * 1000)) * 100;
      timer = setInterval(() => {
        setProgress((prev) => {
          const next = prev + increment;
          if (next >= 100) {
            setIsCompleted(true);
            soundEngine.playTaskSuccess();
            setTimeout(() => onComplete(), 500);
            return 100;
          }
          return next;
        });
      }, stepMs);
    }

    return () => clearInterval(timer);
  }, [holding, isCompleted, holdSeconds, onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fadeIn select-none">
      <div className="relative w-full max-w-sm bg-slate-900 border-2 border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-800/90 border-b border-slate-700">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <h3 className="text-sm font-bold tracking-wider text-slate-100 uppercase">
              {taskName}
            </h3>
          </div>
          <button
            onClick={() => {
              soundEngine.playClick();
              onClose();
            }}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="bg-slate-950 p-6 flex flex-col items-center">
          <div className="w-full bg-slate-900 rounded-full h-4 border border-slate-700 p-0.5 mb-6 overflow-hidden">
            <div
              style={{ width: `${progress}%` }}
              className="h-full bg-cyan-500 rounded-full transition-all duration-75 shadow-[0_0_12px_rgba(6,182,212,0.8)]"
            />
          </div>

          <button
            onPointerDown={() => {
              soundEngine.playClick();
              setHolding(true);
            }}
            onPointerUp={() => setHolding(false)}
            onPointerLeave={() => setHolding(false)}
            disabled={isCompleted}
            className={`w-40 h-40 rounded-full font-mono font-bold text-sm tracking-wider border-4 transition-all flex flex-col items-center justify-center cursor-pointer ${
              isCompleted
                ? 'bg-emerald-600 border-emerald-400 text-white'
                : holding
                ? 'bg-cyan-600 border-cyan-400 text-white scale-95 shadow-[0_0_24px_rgba(6,182,212,0.6)]'
                : 'bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700 shadow-xl'
            }`}
          >
            <span>{isCompleted ? 'COMPLETE' : holding ? 'CALIBRATING...' : 'HOLD TO EXECUTE'}</span>
            <span className="text-xs font-normal opacity-80 mt-1">{Math.round(progress)}%</span>
          </button>
        </div>
      </div>
    </div>
  );
};
