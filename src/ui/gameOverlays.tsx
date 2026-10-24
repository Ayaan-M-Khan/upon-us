/**
 * Impostor Protocol - Full-screen overlays: role reveal, emergency meeting / voting, ejection, game over.
 * Layout and flow follow the original: red splash, discussion chat + player grid, vote reveal, ejection.
 */

import React, { useEffect, useRef, useState } from 'react';
import { PLAYER_COLORS } from '../../shared/constants';
import { ChatMessage, GameOverInfo, GameStateSnapshot } from '../../shared/events';
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

// ---------------------------------------------------------------------------
// Role reveal
// ---------------------------------------------------------------------------

export const RoleReveal: React.FC<{ snapshot: GameStateSnapshot }> = ({ snapshot }) => {
  const you = snapshot.you;
  if (!you) return null;
  const impostor = you.role === 'impostor';
  const crewCount = Object.keys(snapshot.players).length;
  const lineup = impostor
    ? [snapshot.players[net.getSocketId() || '']?.colorId, ...you.teammates.map((t) => t.colorId)].filter(Boolean)
    : Object.values(snapshot.players).map((p) => p.colorId);

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-black pointer-events-auto">
      <div className={`text-6xl sm:text-7xl font-black tracking-widest ${impostor ? 'text-red-500' : 'text-cyan-300'}`}>
        {impostor ? 'IMPOSTOR' : 'CREWMATE'}
      </div>
      <div className="mt-3 text-slate-300 font-bold text-lg">
        {impostor
          ? you.teammates.length > 0
            ? `Your partner${you.teammates.length > 1 ? 's' : ''}: ${you.teammates.map((t) => t.name).join(', ')}`
            : 'Kill the crew without being caught'
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
    }
  }, [meeting, key]);

  if (!meeting) return null;
  const me = snapshot.players[myId];
  const iAmAlive = !!me?.isAlive;
  const players = Object.values(snapshot.players);
  const hasVoted = meeting.voted.includes(myId);
  const secs = Math.ceil(meeting.remainingMs / 1000);

  if (meeting.phase === 'INTRO') {
    return (
      <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-red-950/95 pointer-events-auto">
        <div className="text-5xl sm:text-6xl font-black text-red-400 tracking-widest animate-pulse">
          {meeting.reason === 'body' ? 'DEAD BODY REPORTED' : 'EMERGENCY MEETING'}
        </div>
        <div className="mt-3 text-slate-200 font-bold">Called by {meeting.callerName}</div>
        {meeting.reason === 'body' && meeting.bodyColorId && (
          <div className="mt-6">
            <Bean colorId={meeting.bodyColorId} size={72} dead />
          </div>
        )}
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
