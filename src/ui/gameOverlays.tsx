/**
 * Impostor Protocol - Full-screen overlays: role reveal, emergency meeting / voting, ejection, game over.
 * Layout and flow follow the original: red splash, discussion chat + player grid, vote reveal, ejection.
 */

import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, MapPin, Megaphone, Skull } from 'lucide-react';
import { PLAYER_COLORS } from '../../shared/constants';
import { ChatMessage, GameOverInfo, GameStateSnapshot } from '../../shared/events';
import { soundEngine } from '../audio';
import { net } from '../net';

export const colorHex = (id: string): string => PLAYER_COLORS.find((c) => c.id === id)?.hex || '#94a3b8';
const colorShadow = (id: string): string => PLAYER_COLORS.find((c) => c.id === id)?.shadowHex || '#475569';

/** Tiny bean-shaped crewmate avatar used in cards and the ejection scene. */
export const Bean: React.FC<{ colorId: string; size?: number; dead?: boolean }> = ({ colorId, size = 48, dead }) => (
  <svg width={size} height={size * 1.15} viewBox="0 0 40 46" style={{ opacity: dead ? 0.35 : 1 }}>
    <rect x="3" y="12" width="10" height="20" rx="4" fill={colorShadow(colorId)} />
    <path d="M10 14c0-7 5-11 11-11s11 4 11 11v22H24v-6h-4v6H10z" fill={colorHex(colorId)} />
    <rect x="18" y="10" width="14" height="9" rx="4.5" fill="#bfe9ff" stroke="#1e3a5f" strokeWidth="1.2" />
    <rect x="21" y="11.5" width="7" height="2.5" rx="1.2" fill="#fff" opacity="0.8" />
  </svg>
);

/** Severed crewmate body with bone and meat cross-section used for casualty reports. */
export const SlicedDeadBodyBean: React.FC<{ colorId: string; size?: number }> = ({ colorId, size = 64 }) => (
  <svg width={size} height={size * 1.1} viewBox="0 0 48 52" className="drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)]">
    <ellipse cx="24" cy="46" rx="22" ry="5.5" fill="#7f1d1d" opacity="0.85" />
    <ellipse cx="22" cy="45" rx="16" ry="3.5" fill="#991b1b" />
    <rect x="7" y="32" width="9" height="13" rx="4" fill={colorShadow(colorId)} />
    <rect x="24" y="32" width="9" height="13" rx="4" fill={colorHex(colorId)} />
    <path d="M7 28 C7 28, 7 36, 14 36 L26 36 C33 36, 33 28, 33 28 Z" fill={colorHex(colorId)} />
    <rect x="1" y="27" width="8" height="13" rx="3.5" fill={colorShadow(colorId)} />
    <ellipse cx="20" cy="27" rx="13" ry="4" fill="#991b1b" stroke="#7f1d1d" strokeWidth="1" />
    <ellipse cx="20" cy="27" rx="9" ry="2.5" fill="#dc2626" opacity="0.6" />
    <rect x="18" y="11" width="4.5" height="16" rx="2" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="0.8" />
    <circle cx="17.5" cy="10" r="3.2" fill="#ffffff" stroke="#cbd5e1" strokeWidth="0.8" />
    <circle cx="22.5" cy="10" r="3.2" fill="#ffffff" stroke="#cbd5e1" strokeWidth="0.8" />
  </svg>
);

// ---------------------------------------------------------------------------
// Role reveal
// ---------------------------------------------------------------------------

export const RoleReveal: React.FC<{ snapshot: GameStateSnapshot }> = ({ snapshot }) => {
  const you = snapshot.you;
  if (!you) return null;
  const impostor = you.role === 'impostor';
  const engineer = you.role === 'engineer';
  const crewCount = Object.keys(snapshot.players).length;
  const lineup = impostor
    ? [snapshot.players[net.getSocketId() || '']?.colorId, ...you.teammates.map((t) => t.colorId)].filter(Boolean)
    : Object.values(snapshot.players).map((p) => p.colorId);

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-black pointer-events-auto">
      <div className={`text-6xl sm:text-7xl font-black tracking-widest ${impostor ? 'text-red-500' : engineer ? 'text-amber-300' : 'text-cyan-300'}`}>
        {impostor ? 'IMPOSTOR' : engineer ? 'ENGINEER' : 'CREWMATE'}
      </div>
      <div className="mt-3 text-slate-300 font-bold text-lg">
        {impostor
          ? you.teammates.length > 0
            ? `Your partner${you.teammates.length > 1 ? 's' : ''}: ${you.teammates.map((t) => t.name).join(', ')}`
            : 'Kill the crew without being caught'
          : engineer
            ? `Finish your tasks. Vent for 6 seconds at a time; access recharges 20 seconds after exiting.`
            : `Finish your tasks. ${crewCount} players aboard, and not everyone is who they seem.`}
      </div>
      <div className="mt-8 flex space-x-2">
        {lineup.map((c, i) => (
          <Bean key={i} colorId={c as string} size={56} />
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Meeting (splash -> discussion/voting -> results -> ejection)
// ---------------------------------------------------------------------------

export const MeetingOverlay: React.FC<{ snapshot: GameStateSnapshot }> = ({ snapshot }) => {
  const meeting = snapshot.meeting;
  const myId = net.getSocketId() || '';
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const meetingKey = useRef('');

  useEffect(() => net.onChat((m) => setChat((c) => [...c.slice(-60), m])), []);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: 'end' });
  }, [chat]);

  // New meeting => fresh chat
  const key = meeting ? `${meeting.callerName}:${meeting.reason}:${meeting.bodyColorId || ''}` : '';
  useEffect(() => {
    if (meeting && meeting.phase === 'INTRO' && meetingKey.current !== key) {
      meetingKey.current = key + Date.now();
      setChat([]);
      setSelected(null);
      soundEngine.playReportSiren();
    }
  }, [meeting, key]);

  if (!meeting) return null;
  const me = snapshot.players[myId];
  const iAmAlive = !!me?.isAlive;
  const players = Object.values(snapshot.players);
  const hasVoted = meeting.voted.includes(myId);
  const secs = Math.ceil(meeting.remainingMs / 1000);

  if (meeting.phase === 'INTRO') {
    const isBody = meeting.reason === 'body';
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 overflow-hidden select-none pointer-events-auto">
        {/* Dynamic rotating alarm rays background */}
        <div
          className={`absolute inset-0 opacity-25 animate-spin ${
            isBody
              ? 'bg-[conic-gradient(from_0deg,#ef4444,transparent_40deg,#dc2626_80deg,transparent_120deg,#b91c1c_180deg,transparent_220deg,#ef4444_270deg,transparent_310deg,#dc2626_360deg)]'
              : 'bg-[conic-gradient(from_0deg,#eab308,transparent_40deg,#f59e0b_80deg,transparent_120deg,#d97706_180deg,transparent_220deg,#eab308_270deg,transparent_310deg,#f59e0b_360deg)]'
          }`}
          style={{ animationDuration: '8s' }}
        />
        <div className="absolute inset-0 bg-radial from-transparent via-black/60 to-black/95" />

        {/* Hazard stripes at top and bottom */}
        <div className="absolute top-0 left-0 right-0 h-4 bg-[repeating-linear-gradient(45deg,#000,#000_15px,#ef4444_15px,#ef4444_30px)] shadow-lg" />
        <div className="absolute bottom-0 left-0 right-0 h-4 bg-[repeating-linear-gradient(45deg,#000,#000_15px,#ef4444_15px,#ef4444_30px)] shadow-lg" />

        <div className="relative z-10 flex flex-col items-center max-w-4xl px-4 text-center">
          {/* Flashing Icon Badge */}
          <div className="relative mb-3 flex items-center justify-center">
            <div className={`absolute w-28 h-28 rounded-full animate-ping opacity-35 ${isBody ? 'bg-red-600' : 'bg-amber-500'}`} />
            <div
              className={`relative p-5 rounded-full border-4 shadow-2xl flex items-center justify-center ${
                isBody
                  ? 'bg-red-950/90 border-red-500 shadow-[0_0_50px_rgba(239,68,68,0.7)] text-red-400'
                  : 'bg-amber-950/90 border-amber-500 shadow-[0_0_50px_rgba(245,158,11,0.7)] text-amber-400'
              }`}
            >
              {isBody ? <Megaphone className="w-14 h-14 animate-bounce" /> : <AlertTriangle className="w-14 h-14 animate-pulse" />}
            </div>
          </div>

          {/* Title Banner */}
          <h1
            className={`text-4xl sm:text-6xl md:text-7xl font-black tracking-widest uppercase mb-2 ${
              isBody
                ? 'text-transparent bg-clip-text bg-gradient-to-b from-red-200 via-red-500 to-red-700 drop-shadow-[0_0_35px_rgba(239,68,68,0.9)]'
                : 'text-transparent bg-clip-text bg-gradient-to-b from-amber-100 via-amber-400 to-amber-600 drop-shadow-[0_0_35px_rgba(245,158,11,0.9)]'
            }`}
          >
            {isBody ? 'DEAD BODY REPORTED!' : 'EMERGENCY MEETING!'}
          </h1>

          {/* Cards Display Grid */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
            {/* Reporter card */}
            <div className="flex flex-col items-center bg-slate-900/90 border-2 border-slate-700/80 rounded-3xl p-4 shadow-xl">
              <span className="text-[11px] font-black tracking-widest uppercase text-slate-400 mb-2 flex items-center space-x-1">
                <Megaphone className="w-3.5 h-3.5 text-cyan-400 mr-1" />
                REPORTED BY
              </span>
              <Bean colorId={meeting.callerColorId || 'red'} size={64} />
              <div className="mt-2 text-xl font-black text-white">{meeting.callerName}</div>
              <span className="text-xs font-bold text-cyan-300 bg-cyan-950/80 border border-cyan-700/50 px-2.5 py-0.5 rounded-full mt-1">
                CALLER
              </span>
            </div>

            {/* Target card */}
            {isBody ? (
              <div className="flex flex-col items-center bg-red-950/60 border-2 border-red-700/80 rounded-3xl p-4 shadow-xl">
                <span className="text-[11px] font-black tracking-widest uppercase text-red-300 mb-2 flex items-center space-x-1">
                  <Skull className="w-3.5 h-3.5 text-red-400 mr-1" />
                  CASUALTY FOUND
                </span>
                <SlicedDeadBodyBean colorId={meeting.bodyColorId || 'blue'} size={68} />
                <div className="mt-2 text-xl font-black text-white">{meeting.bodyVictimName || 'Crewmate'}</div>
                <div className="flex items-center space-x-1 text-xs font-bold text-red-300 bg-red-900/80 border border-red-600/60 px-3 py-0.5 rounded-full mt-1">
                  <MapPin className="w-3 h-3 text-red-400" />
                  <span>{(meeting.bodyRoom || 'Ship Deck').toUpperCase()}</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center bg-amber-950/60 border-2 border-amber-700/80 rounded-3xl p-4 shadow-xl">
                <span className="text-[11px] font-black tracking-widest uppercase text-amber-300 mb-2 flex items-center space-x-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mr-1" />
                  CAFETERIA BUTTON
                </span>
                <div className="w-16 h-16 rounded-full bg-red-600 border-4 border-red-400 flex items-center justify-center shadow-lg my-1 animate-pulse">
                  <span className="text-xs font-black text-white">SOS</span>
                </div>
                <div className="mt-2 text-xl font-black text-white">Cafeteria Console</div>
                <span className="text-xs font-bold text-amber-300 bg-amber-900/80 border border-amber-600/60 px-2.5 py-0.5 rounded-full mt-1">
                  MANUAL ALARM
                </span>
              </div>
            )}
          </div>

          {/* Subtext */}
          <div className="mt-6 flex items-center space-x-2 text-slate-400 text-sm font-bold tracking-wider">
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
            <span>CONNECTING AUDIO & VOTING CONSOLES...</span>
          </div>
        </div>
      </div>
    );
  }

  if (meeting.phase === 'EJECTION') return <EjectionScene snapshot={snapshot} />;

  const results = meeting.results;
  const showResults = meeting.phase === 'RESULTS' && results;
  const canTalk = meeting.phase === 'DISCUSSION' || meeting.phase === 'VOTING';

  const send = () => {
    const t = text.trim();
    if (!t) return;
    net.sendChat(t);
    setText('');
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 pointer-events-auto">
      <div className="w-full max-w-5xl max-h-full overflow-auto bg-slate-900 border-2 border-slate-600 rounded-3xl p-4 sm:p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xl sm:text-2xl font-black text-white tracking-wider">
            {meeting.phase === 'DISCUSSION' && 'WHO IS THE IMPOSTOR?'}
            {meeting.phase === 'VOTING' && (iAmAlive ? (hasVoted ? 'VOTE CAST' : 'VOTE NOW') : 'VOTING (YOU ARE A GHOST)')}
            {meeting.phase === 'RESULTS' && 'VOTING RESULTS'}
          </div>
          <div className="text-lg font-black text-cyan-300">{secs}s</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Player grid */}
          <div className="md:col-span-3 grid grid-cols-2 gap-2 content-start">
            {players.map((p) => {
              const voters = showResults ? results!.votes.filter((v) => v.targetId === p.id) : [];
              const isSel = selected === p.id;
              const votedMark = meeting.voted.includes(p.id);
              return (
                <div key={p.id} className="relative">
                  <button
                    disabled={!(meeting.phase === 'VOTING' && iAmAlive && !hasVoted && p.isAlive && p.id !== myId)}
                    onClick={() => setSelected(isSel ? null : p.id)}
                    className={`w-full flex items-center space-x-2 p-2 rounded-xl border-2 text-left transition-all ${
                      isSel ? 'border-yellow-300 bg-slate-700' : 'border-slate-700 bg-slate-800'
                    } ${p.isAlive ? 'cursor-pointer hover:bg-slate-700' : 'opacity-50'}`}
                  >
                    <Bean colorId={p.colorId} size={34} dead={!p.isAlive} />
                    <span className="font-bold text-sm text-white truncate flex-1">
                      {p.name}
                      {p.id === myId ? ' (you)' : ''}
                    </span>
                    {votedMark && meeting.phase !== 'RESULTS' && (
                      <span className="text-[10px] bg-green-600 text-white px-1.5 py-0.5 rounded-full font-black">VOTED</span>
                    )}
                  </button>
                  {voters.length > 0 && (
                    <div className="absolute -bottom-1 right-1 flex -space-x-1">
                      {voters.map((v) => (
                        <div key={v.voterId} className="rounded-full border border-slate-900" style={{ background: colorHex(snapshot.players[v.voterId]?.colorId || '') , width: 14, height: 14 }} />
                      ))}
                    </div>
                  )}
                  {showResults && (
                    <div className="absolute top-1 right-2 text-xs font-black text-yellow-300">
                      {results!.tally[p.id] ? `${results!.tally[p.id]} vote${results!.tally[p.id] > 1 ? 's' : ''}` : ''}
                    </div>
                  )}
                  {isSel && meeting.phase === 'VOTING' && !hasVoted && (
                    <div className="absolute inset-y-0 right-2 flex items-center space-x-1">
                      <button
                        className="w-9 h-9 rounded-lg bg-green-600 hover:bg-green-500 text-white font-black"
                        onClick={() => {
                          net.castVote(p.id);
                          setSelected(null);
                        }}
                      >
                        ✓
                      </button>
                      <button className="w-9 h-9 rounded-lg bg-red-600 hover:bg-red-500 text-white font-black" onClick={() => setSelected(null)}>
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            <button
              disabled={!(meeting.phase === 'VOTING' && iAmAlive && !hasVoted)}
              onClick={() => net.castVote('skip')}
              className="col-span-2 py-2 rounded-xl border-2 border-slate-600 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-black tracking-wider"
            >
              SKIP VOTE {showResults && results!.tally['skip'] ? `(${results!.tally['skip']})` : ''}
            </button>

            {showResults && (
              <div className="col-span-2 text-center text-lg font-black text-yellow-300 pt-2">
                {results!.outcome === 'tie' && 'Tie — no one was ejected.'}
                {results!.outcome === 'skip' && 'No one was ejected. (Skipped)'}
                {results!.outcome === 'ejected' && `${results!.ejectedName} was voted out.`}
              </div>
            )}
          </div>

          {/* Chat */}
          <div className="md:col-span-2 flex flex-col bg-slate-950/70 rounded-2xl border border-slate-700 h-64 md:h-auto min-h-[16rem]">
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 text-sm">
              {chat.length === 0 && <div className="text-slate-500 text-xs text-center pt-4">Discuss who looks suspicious…</div>}
              {chat.map((m) => (
                <div key={m.id} className={`rounded-lg px-2 py-1 bg-slate-800 ${m.ghost ? 'opacity-70 italic' : ''}`}>
                  <span className="font-black" style={{ color: colorHex(m.colorId) }}>
                    {m.ghost ? '👻 ' : ''}
                    {m.name}:
                  </span>{' '}
                  <span className="text-slate-100">{m.text}</span>
                </div>
              ))}
              <div ref={chatEnd} />
            </div>
            <div className="p-2 flex space-x-1 border-t border-slate-700">
              <input
                value={text}
                maxLength={100}
                disabled={!canTalk}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') send();
                }}
                placeholder={iAmAlive ? 'Type a message…' : 'Ghost chat (only ghosts see this)'}
                className="flex-1 bg-slate-800 rounded-lg px-2 py-1.5 text-sm text-white outline-none border border-slate-700 focus:border-cyan-400"
              />
              <button onClick={send} disabled={!canTalk} className="px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-black text-sm disabled:opacity-40">
                SEND
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Ejection cutscene
// ---------------------------------------------------------------------------

const EjectionScene: React.FC<{ snapshot: GameStateSnapshot }> = ({ snapshot }) => {
  const r = snapshot.meeting?.results;
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const loop = () => {
      setT((performance.now() - start) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  let line = 'No one was ejected. (Skipped)';
  if (r?.outcome === 'tie') line = 'No one was ejected. (Tie)';
  if (r?.outcome === 'ejected') {
    line =
      r.wasImpostor === undefined
        ? `${r.ejectedName} was ejected.`
        : `${r.ejectedName} was ${r.wasImpostor ? '' : 'not '}An Impostor.`;
  }
  const typed = line.slice(0, Math.floor(Math.max(0, t - 1.2) * 22));

  const x = -10 + t * 20; // % across the screen
  return (
    <div className="fixed inset-0 z-40 bg-black overflow-hidden pointer-events-auto">
      {Array.from({ length: 60 }).map((_, i) => (
        <div
          key={i}
          className="absolute bg-white rounded-full"
          style={{
            left: `${(i * 37) % 100}%`,
            top: `${(i * 53) % 100}%`,
            width: 2 + (i % 3),
            height: 2 + (i % 3),
            opacity: 0.8,
            transform: `translateX(${-(t * (20 + (i % 5) * 15)) % 120}px)`,
          }}
        />
      ))}
      {r?.outcome === 'ejected' && r.ejectedColorId && (
        <div
          className="absolute"
          style={{ left: `${x}%`, top: `${40 + Math.sin(t * 2) * 6}%`, transform: `rotate(${t * 200}deg)` }}
        >
          <Bean colorId={r.ejectedColorId} size={90} />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-1/4 text-center text-3xl sm:text-4xl font-black text-white tracking-wider">{typed}</div>
      {r?.impostorsRemaining !== undefined && t > 3 && (
        <div className="absolute inset-x-0 bottom-[18%] text-center text-lg font-bold text-slate-300">
          {r.impostorsRemaining} impostor{r.impostorsRemaining === 1 ? '' : 's'} remain.
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Game over
// ---------------------------------------------------------------------------

export const GameOverOverlay: React.FC<{ info: GameOverInfo }> = ({ info }) => {
  const myRole = info.players.find((p) => p.id === net.getSocketId())?.role;
  const iWon = (info.winner === 'impostors') === (myRole === 'impostor');
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 pointer-events-auto">
      <div className={`text-6xl sm:text-7xl font-black tracking-widest ${iWon ? 'text-cyan-300' : 'text-red-500'}`}>
        {iWon ? 'VICTORY' : 'DEFEAT'}
      </div>
      <div className="mt-2 text-slate-300 font-bold">
        {info.winner === 'impostors' ? 'Impostors win' : 'Crewmates win'} — {info.reason}
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-4 max-w-2xl">
        {info.players.map((p) => (
          <div key={p.id} className="flex flex-col items-center">
            <Bean colorId={p.colorId} size={52} />
            <div className="text-xs font-bold text-white mt-1">
              {p.name}
              {p.isBot ? ' (bot)' : ''}
            </div>
            <div className={`text-[10px] font-black ${p.role === 'impostor' ? 'text-red-400' : 'text-cyan-300'}`}>{p.role.toUpperCase()}</div>
          </div>
        ))}
      </div>
      <div className="mt-8 text-slate-400 text-sm">Returning to the lobby…</div>
    </div>
  );
};
