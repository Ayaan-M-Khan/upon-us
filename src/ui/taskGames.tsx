/**
 * Impostor Protocol - 2D task mini-games
 * Each task opens a flat 2D panel over the game, like the original. Games only report
 * "finished"; the server still validates distance and minimum time before counting it.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { soundEngine } from '../audio';

interface GameProps {
  step: number;
  finish: () => void;
}

const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** requestAnimationFrame loop with delta seconds. */
function useRaf(cb: (dt: number) => void, active = true): void {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      ref.current(Math.min((t - last) / 1000, 0.05));
      last = t;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
}

const btn =
  'px-4 py-2 rounded-xl font-black tracking-wider text-white bg-cyan-600 hover:bg-cyan-500 active:scale-95 transition-all cursor-pointer select-none';

// ---------------------------------------------------------------------------
// Fix Wiring: drag from each left plug to the matching colour on the right
// ---------------------------------------------------------------------------
const WIRE_COLORS = ['#ef4444', '#3b82f6', '#eab308', '#ec4899'];

const WiresGame: React.FC<GameProps> = ({ finish }) => {
  const right = useMemo(() => shuffle([0, 1, 2, 3]), []);
  const [done, setDone] = useState<boolean[]>([false, false, false, false]);
  const [drag, setDrag] = useState<{ i: number; x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const W = 420;
  const H = 280;
  const ly = (i: number) => 40 + i * 66;

  const toLocal = (e: React.PointerEvent | PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const onUp = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = toLocal(e);
    const slot = right.findIndex((_, s) => Math.hypot(p.x - (W - 40), p.y - ly(s)) < 24);
    if (slot >= 0 && right[slot] === drag.i) {
      const next = [...done];
      next[drag.i] = true;
      setDone(next);
      soundEngine.playClick();
      if (next.every(Boolean)) finish();
    }
    setDrag(null);
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full max-w-md touch-none bg-slate-800 rounded-2xl"
      onPointerMove={(e) => drag && setDrag({ ...drag, ...toLocal(e) })}
      onPointerUp={onUp}
      onPointerCancel={() => setDrag(null)}
    >
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x="0" y={ly(i) - 14} width="34" height="28" rx="6" fill={WIRE_COLORS[i]} />
          <circle
            cx="40"
            cy={ly(i)}
            r="11"
            fill={WIRE_COLORS[i]}
            stroke="#fff"
            strokeWidth="2"
            style={{ cursor: 'grab' }}
            onPointerDown={(e) => {
              if (done[i]) return;
              (e.target as Element).setPointerCapture?.(e.pointerId);
              setDrag({ i, ...toLocal(e) });
            }}
          />
          {done[i] && (
            <line x1="40" y1={ly(i)} x2={W - 40} y2={ly(right.indexOf(i))} stroke={WIRE_COLORS[i]} strokeWidth="9" strokeLinecap="round" />
          )}
        </g>
      ))}
      {right.map((c, s) => (
        <g key={s}>
          <rect x={W - 34} y={ly(s) - 14} width="34" height="28" rx="6" fill={WIRE_COLORS[c]} />
          <circle cx={W - 40} cy={ly(s)} r="11" fill={WIRE_COLORS[c]} stroke="#fff" strokeWidth="2" />
        </g>
      ))}
      {drag && (
        <line x1="40" y1={ly(drag.i)} x2={drag.x} y2={drag.y} stroke={WIRE_COLORS[drag.i]} strokeWidth="9" strokeLinecap="round" />
      )}
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Swipe Card: drag the card along the reader at the right speed
// ---------------------------------------------------------------------------
const CardGame: React.FC<GameProps> = ({ finish }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const [msg, setMsg] = useState('Drag the card through the reader');
  const state = useRef<{ down: boolean; t0: number; offset: number }>({ down: false, t0: 0, offset: 0 });
  const CARD_W = 90;

  const maxX = () => (trackRef.current?.clientWidth || 360) - CARD_W;

  const move = (e: React.PointerEvent) => {
    if (!state.current.down || !trackRef.current) return;
    const r = trackRef.current.getBoundingClientRect();
    const nx = Math.max(0, Math.min(maxX(), e.clientX - r.left - state.current.offset));
    setX(nx);
    if (state.current.t0 === 0 && nx > 20) state.current.t0 = performance.now();
    if (nx >= maxX() - 2 && state.current.t0 > 0) {
      const dt = (performance.now() - state.current.t0) / 1000;
      state.current.down = false;
      state.current.t0 = 0;
      if (dt < 0.45) setMsg('Too fast. Try again.');
      else if (dt > 1.4) setMsg('Too slow. Try again.');
      else {
        setMsg('Accepted. Thank you.');
        finish();
        return;
      }
      setTimeout(() => setX(0), 350);
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="text-center text-sm font-bold text-slate-200 mb-2 h-5">{msg}</div>
      <div
        ref={trackRef}
        className="relative h-28 rounded-2xl bg-slate-800 border-2 border-slate-600 touch-none overflow-hidden"
        onPointerMove={move}
        onPointerUp={() => {
          if (state.current.down) {
            state.current.down = false;
            state.current.t0 = 0;
            setX(0);
          }
        }}
      >
        <div className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 bg-slate-950" />
        <div
          className="absolute top-3 bottom-3 rounded-lg bg-gradient-to-br from-sky-300 to-sky-500 border-2 border-white cursor-grab flex items-center px-2"
          style={{ width: CARD_W, left: x }}
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            const r = trackRef.current!.getBoundingClientRect();
            state.current = { down: true, t0: 0, offset: e.clientX - r.left - x };
          }}
        >
          <div className="w-6 h-6 rounded bg-yellow-300" />
          <div className="ml-2 space-y-1 flex-1">
            <div className="h-1.5 bg-white/80 rounded" />
            <div className="h-1.5 bg-white/60 rounded w-2/3" />
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Align Engine Output: set the slider on the target line
// ---------------------------------------------------------------------------
const AlignGame: React.FC<GameProps> = ({ finish }) => {
  const target = useMemo(() => 15 + Math.random() * 70, []);
  const [value, setValue] = useState(95);
  const ok = Math.abs(value - target) < 4;
  return (
    <div className="w-full max-w-md space-y-4">
      <div className="relative h-40 rounded-2xl bg-slate-800 border-2 border-slate-600 overflow-hidden">
        <div className="absolute inset-x-0 border-t-2 border-dashed border-green-400" style={{ top: `${target}%` }} />
        <div className="absolute inset-x-6 h-4 rounded bg-gradient-to-r from-orange-500 to-yellow-300" style={{ top: `calc(${value}% - 8px)` }} />
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        onPointerUp={() => ok && finish()}
        onKeyUp={() => ok && finish()}
        className="w-full accent-cyan-400"
      />
      <div className="text-center text-xs text-slate-400">Slide until the bar sits on the green line, then let go.</div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Clean O2 Filter: pull every leaf out
// ---------------------------------------------------------------------------
const LeavesGame: React.FC<GameProps> = ({ finish }) => {
  const leaves = useMemo(
    () => Array.from({ length: 8 }, (_, i) => ({ id: i, x: 10 + Math.random() * 78, y: 8 + Math.random() * 74, r: Math.random() * 360 })),
    []
  );
  const [gone, setGone] = useState<Set<number>>(new Set());
  return (
    <div className="relative w-full max-w-md h-64 rounded-2xl bg-slate-800 border-2 border-slate-600 overflow-hidden">
      <div className="absolute inset-0 opacity-30" style={{ background: 'repeating-linear-gradient(90deg,#64748b 0 6px,transparent 6px 18px)' }} />
      {leaves.map(
        (l) =>
          !gone.has(l.id) && (
            <button
              key={l.id}
              className="absolute w-12 h-7 rounded-full bg-gradient-to-r from-green-600 to-lime-400 border border-green-900 cursor-pointer hover:scale-110 transition-transform"
              style={{ left: `${l.x}%`, top: `${l.y}%`, transform: `rotate(${l.r}deg)` }}
              onClick={() => {
                soundEngine.playClick();
                const next = new Set(gone).add(l.id);
                setGone(next);
                if (next.size === leaves.length) finish();
              }}
            />
          )
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Prime Shields: tap every red panel
// ---------------------------------------------------------------------------
const ShieldsGame: React.FC<GameProps> = ({ finish }) => {
  const lit = useMemo(() => new Set(shuffle([0, 1, 2, 3, 4, 5, 6]).slice(0, 4)), []);
  const [fixed, setFixed] = useState<Set<number>>(new Set());
  const pos = [
    [50, 15], [22, 35], [78, 35], [50, 50], [22, 68], [78, 68], [50, 85],
  ];
  return (
    <div className="relative w-full max-w-sm h-72 rounded-2xl bg-slate-800 border-2 border-slate-600">
      {pos.map(([x, y], i) => {
        const bad = lit.has(i) && !fixed.has(i);
        return (
          <button
            key={i}
            onClick={() => {
              if (!bad) return;
              soundEngine.playClick();
              const next = new Set(fixed).add(i);
              setFixed(next);
              if ([...lit].every((n) => next.has(n))) finish();
            }}
            className={`absolute w-16 h-16 -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-colors ${bad ? 'bg-red-500 animate-pulse' : 'bg-slate-200'}`}
            style={{ left: `${x}%`, top: `${y}%`, clipPath: 'polygon(25% 5%,75% 5%,100% 50%,75% 95%,25% 95%,0 50%)' }}
          />
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Calibrate Distributor: stop three oscillating bars in the green zone
// ---------------------------------------------------------------------------
const CalibrateGame: React.FC<GameProps> = ({ finish }) => {
  const [stage, setStage] = useState(0);
  const [pos, setPos] = useState(0);
  const [msg, setMsg] = useState('Press STOP when the marker is in the green zone');
  const t = useRef(0);
  const zone = useMemo(() => [0.5 - 0.1, 0.5 + 0.1], []);
  useRaf((dt) => {
    t.current += dt * (1.1 + stage * 0.5);
    setPos(0.5 + 0.5 * Math.sin(t.current * 2.4));
  }, stage < 3);

  const stop = () => {
    if (pos >= zone[0] && pos <= zone[1]) {
      soundEngine.playClick();
      if (stage === 2) {
        setStage(3);
        finish();
      } else {
        setStage(stage + 1);
        setMsg('Good. Next dial.');
      }
    } else {
      setMsg('Missed. Try again.');
    }
  };

  return (
    <div className="w-full max-w-md space-y-3">
      <div className="flex justify-center space-x-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`relative w-14 h-44 rounded-xl border-2 ${i < stage ? 'border-green-400 bg-green-950' : i === stage ? 'border-cyan-400 bg-slate-800' : 'border-slate-700 bg-slate-900'}`}>
            <div className="absolute inset-x-0 bg-green-500/50" style={{ top: `${zone[0] * 100}%`, height: `${(zone[1] - zone[0]) * 100}%` }} />
            {i === stage && <div className="absolute inset-x-0 h-2 bg-yellow-300" style={{ top: `calc(${pos * 100}% - 4px)` }} />}
            {i < stage && <div className="absolute inset-x-0 h-2 bg-green-300" style={{ top: 'calc(50% - 4px)' }} />}
          </div>
        ))}
      </div>
      <div className="text-center text-xs text-slate-300 h-4">{msg}</div>
      <div className="flex justify-center">
        <button className={btn} onClick={stop} disabled={stage >= 3}>
          STOP
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Divert Power
// ---------------------------------------------------------------------------
const DivertGame: React.FC<GameProps> = ({ step, finish }) => {
  const [v, setV] = useState(0);
  if (step === 0) {
    return (
      <div className="w-full max-w-sm space-y-3">
        <div className="text-center text-sm text-slate-200">Push the lever all the way up to send power to {`the target room`}.</div>
        <div className="flex items-center justify-center space-x-4">
          <div className="h-48 flex items-center">
            <input
              type="range"
              min={0}
              max={100}
              value={v}
              onChange={(e) => setV(Number(e.target.value))}
              onPointerUp={() => (v >= 98 ? finish() : setV(0))}
              className="accent-yellow-400"
              style={{ width: 190, transform: 'rotate(-90deg)' }}
            />
          </div>
          <div className="w-10 h-48 rounded bg-slate-800 border border-slate-600 flex flex-col-reverse">
            <div className="bg-yellow-400 w-full" style={{ height: `${v}%` }} />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="w-full max-w-sm flex flex-col items-center space-y-4">
      <div className="text-sm text-slate-200">Power is incoming. Accept it.</div>
      <button className="w-40 h-40 rounded-full bg-gradient-to-br from-green-400 to-emerald-700 border-4 border-white text-white font-black text-xl active:scale-95" onClick={finish}>
        ACCEPT
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Unlock Manifolds: press 1..10 in order
// ---------------------------------------------------------------------------
const NumbersGame: React.FC<GameProps> = ({ finish }) => {
  const order = useMemo(() => shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), []);
  const [next, setNext] = useState(1);
  const [wrong, setWrong] = useState(false);
  return (
    <div className="w-full max-w-sm">
      <div className="grid grid-cols-5 gap-2">
        {order.map((n) => (
          <button
            key={n}
            onClick={() => {
              if (n === next) {
                soundEngine.playClick();
                if (n === 10) finish();
                setNext(next + 1);
              } else {
                setNext(1);
                setWrong(true);
                setTimeout(() => setWrong(false), 350);
              }
            }}
            className={`h-16 rounded-xl text-2xl font-black cursor-pointer border-2 transition-colors ${
              n < next ? 'bg-green-600 border-green-300 text-white' : wrong ? 'bg-red-700 border-red-400 text-white' : 'bg-slate-700 border-slate-500 text-cyan-200 hover:bg-slate-600'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Chart Course: drag the ship through every waypoint
// ---------------------------------------------------------------------------
const CourseGame: React.FC<GameProps> = ({ finish }) => {
  const pts = useMemo(() => [[40, 220], [120, 90], [220, 170], [320, 60]], []);
  const [idx, setIdx] = useState(0);
  const [ship, setShip] = useState({ x: pts[0][0], y: pts[0][1] });
  const [drag, setDrag] = useState(false);
  const ref = useRef<SVGSVGElement>(null);
  const local = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 360, y: ((e.clientY - r.top) / r.height) * 280 };
  };
  return (
    <svg
      ref={ref}
      viewBox="0 0 360 280"
      className="w-full max-w-md bg-slate-900 rounded-2xl border-2 border-slate-600 touch-none"
      onPointerMove={(e) => {
        if (!drag) return;
        const p = local(e);
        setShip(p);
        const target = pts[idx + 1];
        if (target && Math.hypot(p.x - target[0], p.y - target[1]) < 16) {
          if (idx + 1 === pts.length - 1) finish();
          setIdx(idx + 1);
        }
      }}
      onPointerUp={() => {
        setDrag(false);
        if (idx < pts.length - 1) {
          setIdx(0);
          setShip({ x: pts[0][0], y: pts[0][1] });
        }
      }}
    >
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="#475569" strokeWidth="3" strokeDasharray="6 6" />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="12" fill={i <= idx ? '#22c55e' : i === pts.length - 1 ? '#facc15' : '#334155'} stroke="#fff" strokeWidth="2" />
      ))}
      <polygon
        points={`${ship.x},${ship.y - 12} ${ship.x - 9},${ship.y + 10} ${ship.x + 9},${ship.y + 10}`}
        fill="#38bdf8"
        stroke="#fff"
        strokeWidth="2"
        style={{ cursor: 'grab' }}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          setDrag(true);
        }}
      />
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Stabilize Steering: click the drifting target 3 times
// ---------------------------------------------------------------------------
const SteeringGame: React.FC<GameProps> = ({ finish }) => {
  const [p, setP] = useState({ x: 50, y: 50 });
  const [hits, setHits] = useState(0);
  const t = useRef(Math.random() * 10);
  useRaf((dt) => {
    t.current += dt;
    setP({ x: 50 + 34 * Math.sin(t.current * 1.3), y: 50 + 32 * Math.sin(t.current * 1.9 + 1) });
  }, hits < 3);
  return (
    <div className="relative w-full max-w-sm h-64 rounded-2xl bg-slate-900 border-2 border-slate-600 overflow-hidden">
      <div className="absolute left-1/2 top-0 bottom-0 border-l border-slate-700" />
      <div className="absolute top-1/2 left-0 right-0 border-t border-slate-700" />
      <button
        className="absolute w-14 h-14 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-red-400 bg-red-500/20 cursor-crosshair"
        style={{ left: `${p.x}%`, top: `${p.y}%` }}
        onPointerDown={() => {
          soundEngine.playClick();
          if (hits + 1 >= 3) finish();
          setHits(hits + 1);
        }}
      >
        <div className="w-2 h-2 bg-red-400 rounded-full mx-auto" />
      </button>
      <div className="absolute bottom-2 inset-x-0 text-center text-xs font-bold text-slate-300">Stabilized: {hits} / 3</div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Hold-to-fill games (scan, fuel, garbage lever, download/upload)
// ---------------------------------------------------------------------------
const HoldGame: React.FC<GameProps & { label: string; seconds: number; auto?: boolean; hint: string }> = ({
  finish,
  label,
  seconds,
  auto,
  hint,
}) => {
  const [pct, setPct] = useState(0);
  const [holding, setHolding] = useState<boolean>(false);
  const [started, setStarted] = useState(false);
  const finished = useRef(false);
  const active = auto ? started : holding;
  useRaf((dt) => {
    setPct((p) => {
      const n = active ? p + (dt / seconds) * 100 : auto ? p : Math.max(0, p - dt * 60);
      if (n >= 100 && !finished.current) {
        finished.current = true;
        setTimeout(finish, 0);
      }
      return Math.min(100, n);
    });
  }, true);
  return (
    <div className="w-full max-w-sm flex flex-col items-center space-y-4">
      <div className="text-sm text-slate-200 text-center">{hint}</div>
      <div className="w-full h-6 rounded-full bg-slate-800 border-2 border-slate-600 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-cyan-500 to-green-400" style={{ width: `${pct}%` }} />
      </div>
      <button
        className="w-44 py-4 rounded-2xl font-black tracking-wider text-white bg-gradient-to-br from-cyan-500 to-blue-700 border-2 border-cyan-200 active:scale-95 select-none touch-none cursor-pointer"
        onPointerDown={() => (auto ? setStarted(true) : setHolding(true))}
        onPointerUp={() => !auto && setHolding(false)}
        onPointerLeave={() => !auto && setHolding(false)}
        onPointerCancel={() => !auto && setHolding(false)}
      >
        {label}
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Clear Asteroids: shoot 10
// ---------------------------------------------------------------------------
interface Rock {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}
const AsteroidsGame: React.FC<GameProps> = ({ finish }) => {
  const [rocks, setRocks] = useState<Rock[]>([]);
  const [score, setScore] = useState(0);
  const idRef = useRef(0);
  const spawn = useRef(0);
  useRaf((dt) => {
    spawn.current += dt;
    setRocks((rs) => {
      let next = rs.map((r) => ({ ...r, x: r.x + r.vx * dt, y: r.y + r.vy * dt })).filter((r) => r.x > -10 && r.x < 110 && r.y > -10 && r.y < 110);
      if (spawn.current > 0.55 && next.length < 7) {
        spawn.current = 0;
        const fromLeft = Math.random() < 0.5;
        next = [...next, { id: idRef.current++, x: fromLeft ? -5 : 105, y: 10 + Math.random() * 80, vx: (fromLeft ? 1 : -1) * (14 + Math.random() * 14), vy: (Math.random() - 0.5) * 14 }];
      }
      return next;
    });
  }, score < 10);
  return (
    <div className="relative w-full max-w-md h-64 rounded-2xl bg-slate-950 border-2 border-slate-600 overflow-hidden cursor-crosshair">
      {rocks.map((r) => (
        <button
          key={r.id}
          className="absolute w-10 h-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-stone-400 to-stone-700 border border-stone-300"
          style={{ left: `${r.x}%`, top: `${r.y}%` }}
          onPointerDown={() => {
            soundEngine.playClick();
            setRocks((rs) => rs.filter((x) => x.id !== r.id));
            if (score + 1 >= 10) finish();
            setScore(score + 1);
          }}
        />
      ))}
      <div className="absolute bottom-2 inset-x-0 text-center text-xs font-bold text-slate-300">Destroyed: {Math.min(score, 10)} / 10</div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Start Reactor: repeat the growing pattern
// ---------------------------------------------------------------------------
const SimonGame: React.FC<GameProps> = ({ finish }) => {
  const ROUNDS = 5;
  const [seq] = useState(() => Array.from({ length: ROUNDS }, () => Math.floor(Math.random() * 9)));
  const [round, setRound] = useState(1);
  const [showing, setShowing] = useState(true);
  const [lit, setLit] = useState<number | null>(null);
  const [input, setInput] = useState(0);
  const [msg, setMsg] = useState('Watch the pattern');

  useEffect(() => {
    if (!showing) return;
    let i = 0;
    setMsg('Watch the pattern');
    const timers: number[] = [];
    const play = () => {
      if (i >= round) {
        setLit(null);
        setShowing(false);
        setInput(0);
        setMsg('Repeat it');
        return;
      }
      setLit(seq[i]);
      timers.push(window.setTimeout(() => setLit(null), 380));
      i++;
      timers.push(window.setTimeout(play, 650));
    };
    timers.push(window.setTimeout(play, 500));
    return () => timers.forEach(clearTimeout);
  }, [showing, round, seq]);

  const press = (n: number) => {
    if (showing) return;
    setLit(n);
    setTimeout(() => setLit(null), 150);
    if (n !== seq[input]) {
      setMsg('Wrong. Starting over.');
      setRound(1);
      setShowing(true);
      return;
    }
    if (input + 1 === round) {
      if (round === ROUNDS) finish();
      else {
        setRound(round + 1);
        setShowing(true);
      }
    } else setInput(input + 1);
  };

  return (
    <div className="w-full max-w-xs">
      <div className="text-center text-sm text-slate-200 mb-2 h-5">
        {msg} ({round}/{ROUNDS})
      </div>
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 9 }, (_, n) => (
          <button
            key={n}
            onClick={() => press(n)}
            className={`h-20 rounded-xl border-2 cursor-pointer transition-colors ${lit === n ? 'bg-cyan-300 border-white' : 'bg-slate-700 border-slate-500'}`}
          />
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Inspect Sample
// ---------------------------------------------------------------------------
const SampleGame: React.FC<GameProps> = ({ step, finish }) => {
  const odd = useMemo(() => Math.floor(Math.random() * 5), []);
  const [ok, setOk] = useState<number | null>(null);
  if (step === 0) {
    return <HoldGame step={0} finish={finish} label="START SCAN" seconds={3} auto hint="Start the sample analysis. Come back for the result." />;
  }
  return (
    <div className="w-full max-w-md">
      <div className="text-center text-sm text-slate-200 mb-3">One vial is anomalous. Select it.</div>
      <div className="flex justify-center space-x-3">
        {Array.from({ length: 5 }, (_, i) => (
          <button
            key={i}
            onClick={() => {
              if (i === odd) {
                setOk(i);
                finish();
              } else setOk(-1);
            }}
            className="w-14 h-28 rounded-b-2xl rounded-t-md border-2 border-slate-300 cursor-pointer relative overflow-hidden"
            style={{ background: '#1e293b' }}
          >
            <div className="absolute bottom-0 inset-x-0 h-4/5" style={{ background: i === odd ? '#a855f7' : '#22d3ee' }} />
          </button>
        ))}
      </div>
      {ok === -1 && <div className="text-center text-red-400 text-xs font-bold mt-2">Not that one.</div>}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Dispatcher + frame
// ---------------------------------------------------------------------------
const renderGame = (taskId: string, step: number, finish: () => void): React.ReactNode => {
  const p = { step, finish };
  switch (taskId) {
    case 'fix_wiring': return <WiresGame {...p} />;
    case 'swipe_card': return <CardGame {...p} />;
    case 'align_engine_upper':
    case 'align_engine_lower': return <AlignGame {...p} />;
    case 'clean_o2': return <LeavesGame {...p} />;
    case 'prime_shields': return <ShieldsGame {...p} />;
    case 'calibrate_distributor': return <CalibrateGame {...p} />;
    case 'divert_power': return <DivertGame {...p} />;
    case 'unlock_manifolds': return <NumbersGame {...p} />;
    case 'chart_course': return <CourseGame {...p} />;
    case 'stabilize_steering': return <SteeringGame {...p} />;
    case 'scan_boarding': return <HoldGame {...p} label="HOLD TO SCAN" seconds={3} hint="Hold the button while the scan completes." />;
    case 'clear_asteroids': return <AsteroidsGame {...p} />;
    case 'fuel_engines': return <HoldGame {...p} label="HOLD TO FUEL" seconds={3} hint={step === 0 ? 'Fill the canister.' : 'Fill the engine tank.'} />;
    case 'empty_garbage': return <HoldGame {...p} label="HOLD LEVER" seconds={3} hint="Hold the lever down until the chute is empty." />;
    case 'download_data': return <HoldGame {...p} label={step === 0 ? 'DOWNLOAD' : 'UPLOAD'} seconds={4} auto hint={step === 0 ? 'Download the data to your tablet.' : 'Upload the data to the ship.'} />;
    case 'start_reactor': return <SimonGame {...p} />;
    case 'inspect_sample': return <SampleGame {...p} />;
    default: return <HoldGame {...p} label="HOLD" seconds={3} hint="Hold to complete." />;
  }
};

export const TaskGame: React.FC<{
  taskId: string;
  name: string;
  step: number;
  totalSteps: number;
  onComplete: () => void;
  onClose: () => void;
}> = ({ taskId, name, step, totalSteps, onComplete, onClose }) => {
  const [done, setDone] = useState(false);
  const finish = useCallback(() => {
    setDone((d) => {
      if (!d) setTimeout(onComplete, 700);
      return true;
    });
  }, [onComplete]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4 pointer-events-auto">
      <div className="relative w-full max-w-lg rounded-3xl border-2 border-cyan-500/70 bg-slate-900/95 shadow-2xl p-5 flex flex-col items-center">
        <button onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer" title="Close [Esc]">
          <X className="w-5 h-5" />
        </button>
        <div className="text-lg font-black tracking-wider text-cyan-300">{name.toUpperCase()}</div>
        {totalSteps > 1 && <div className="text-[11px] font-bold text-slate-400 mb-3">STEP {step + 1} OF {totalSteps}</div>}
        {totalSteps <= 1 && <div className="mb-3" />}
        <div className="w-full flex justify-center min-h-[12rem]" key={`${taskId}:${step}`}>
          {renderGame(taskId, step, finish)}
        </div>
        {done && (
          <div className="absolute inset-0 rounded-3xl bg-emerald-950/85 flex flex-col items-center justify-center">
            <Check className="w-16 h-16 text-emerald-300" />
            <div className="text-xl font-black text-emerald-200 tracking-widest mt-2">TASK COMPLETE</div>
          </div>
        )}
      </div>
    </div>
  );
};
