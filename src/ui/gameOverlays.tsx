/**
 * Impostor Protocol - Full-screen overlays: role reveal, emergency meeting / voting, ejection, game over.
 * Layout and flow follow the original: red splash, discussion chat + player grid, vote reveal, ejection.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle,
  ClipboardList,
  Clock,
  Flame,
  Lock,
  MapPin,
  Megaphone,
  MessageSquare,
  Radio,
  Skull,
  Sliders,
  Users,
  Wind,
  X,
  Zap,
} from 'lucide-react';
import { PLAYER_COLORS } from '../../shared/constants';
import { ChatMessage, GameOverInfo, GameStateSnapshot, MeetingIncidentLogEntry } from '../../shared/events';
import { MAP_BOUNDS, MAP_CORRIDORS, MAP_ROOMS_DETAIL } from '../../shared/mapData';
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
// Incident Log (Dead bodies & Emergency calls review)
// ---------------------------------------------------------------------------

export const IncidentLogView: React.FC<{
  history: MeetingIncidentLogEntry[];
  currentRound?: number;
}> = ({ history, currentRound }) => {
  const sortedHistory = [...history].reverse();
  const bodiesCount = history.filter((h) => h.reason === 'body').length;
  const emergenciesCount = history.filter((h) => h.reason === 'emergency').length;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-950/80">
      {/* Quick stats strip */}
      <div className="px-3 py-2 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between text-[11px] text-slate-300 font-bold shrink-0">
        <span className="flex items-center space-x-1">
          <ClipboardList size={12} className="text-cyan-400" />
          <span>Total: <strong className="text-white">{history.length}</strong></span>
        </span>
        <span className="flex items-center space-x-1 text-red-400">
          <Skull size={12} />
          <span>Bodies: <strong className="text-white">{bodiesCount}</strong></span>
        </span>
        <span className="flex items-center space-x-1 text-amber-400">
          <Megaphone size={12} />
          <span>Calls: <strong className="text-white">{emergenciesCount}</strong></span>
        </span>
      </div>

      {/* Incident entries scroll feed */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2 text-xs">
        {history.length === 0 ? (
          <div className="h-full min-h-[14rem] flex flex-col items-center justify-center text-center p-4 text-slate-500">
            <ClipboardList size={34} className="text-slate-600 mb-2" />
            <p className="font-bold text-slate-300 text-sm">No Incidents Logged</p>
            <p className="text-[11px] text-slate-500 mt-1 max-w-[200px]">
              Reported dead bodies and emergency meetings called will appear here with location and voting outcomes.
            </p>
          </div>
        ) : (
          sortedHistory.map((entry) => {
            const isCurrentMeeting = currentRound ? entry.roundNumber === currentRound : false;
            const callerColor = colorHex(entry.callerColorId || '');
            const victimColor = entry.bodyColorId ? colorHex(entry.bodyColorId) : '#94a3b8';
            const victimColorName = entry.bodyColorId
              ? PLAYER_COLORS.find((c) => c.id === entry.bodyColorId)?.name || entry.bodyColorId
              : 'Unknown';

            return (
              <div
                key={entry.id}
                className={`p-2.5 rounded-xl border transition-all ${
                  isCurrentMeeting
                    ? 'border-cyan-500/80 bg-slate-800/90 shadow-md ring-1 ring-cyan-500/40'
                    : 'border-slate-800 bg-slate-900/80 hover:border-slate-700'
                }`}
              >
                {/* Header: Round & Timestamp */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center space-x-1.5">
                    <span className="font-black text-slate-200 tracking-wide text-[11px]">
                      ROUND #{entry.roundNumber}
                    </span>
                    {isCurrentMeeting && (
                      <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-cyan-400 text-slate-950 uppercase tracking-wider animate-pulse">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-1 text-[10px] text-slate-400 font-mono">
                    <Clock size={10} />
                    <span>{entry.timeFormatted}</span>
                  </div>
                </div>

                {/* Event Type & Reporter */}
                <div className="flex items-center space-x-2 mb-1.5">
                  {entry.reason === 'body' ? (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-red-900/60 border border-red-500/50 text-red-300 flex items-center space-x-1 shrink-0">
                      <Skull size={10} />
                      <span>BODY REPORT</span>
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-900/60 border border-amber-500/50 text-amber-300 flex items-center space-x-1 shrink-0">
                      <Megaphone size={10} />
                      <span>EMERGENCY</span>
                    </span>
                  )}
                  <div className="flex items-center space-x-1.5 truncate">
                    <Bean colorId={entry.callerColorId || ''} size={16} />
                    <span className="font-bold truncate text-white" style={{ color: callerColor }}>
                      {entry.callerName}
                    </span>
                  </div>
                </div>

                {/* Body Details (if body report) */}
                {entry.reason === 'body' && (
                  <div className="mt-1 px-2 py-1 rounded-lg bg-slate-950/70 border border-slate-800/80 flex flex-wrap items-center justify-between gap-1 text-[11px]">
                    <div className="flex items-center space-x-1.5 text-slate-300">
                      <Bean colorId={entry.bodyColorId || ''} size={15} dead />
                      <span>Corpse:</span>
                      <span className="font-bold" style={{ color: victimColor }}>
                        {victimColorName}
                      </span>
                    </div>
                    {entry.bodyRoom && (
                      <div className="flex items-center space-x-1 text-cyan-300 font-semibold text-[10px]">
                        <MapPin size={10} />
                        <span className="truncate max-w-[120px]">{entry.bodyRoom}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Outcome Verdict */}
                <div className="mt-1.5 pt-1.5 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 font-medium">Outcome:</span>
                  {entry.outcome === 'ejected' ? (
                    <span className="flex items-center space-x-1 font-bold text-red-300">
                      {entry.ejectedColorId && <Bean colorId={entry.ejectedColorId} size={14} dead />}
                      <span>Ejected {entry.ejectedName}</span>
                      {entry.wasImpostor !== undefined && (
                        <span
                          className={`text-[9px] px-1 py-0.2 rounded font-black ${
                            entry.wasImpostor ? 'bg-red-500/30 text-red-400' : 'bg-slate-700 text-slate-300'
                          }`}
                        >
                          {entry.wasImpostor ? 'IMPOSTOR' : 'CREWMATE'}
                        </span>
                      )}
                    </span>
                  ) : entry.outcome === 'skip' ? (
                    <span className="text-slate-400 italic font-semibold">Skipped (No ejection)</span>
                  ) : entry.outcome === 'tie' ? (
                    <span className="text-yellow-400 italic font-semibold">Tie (No ejection)</span>
                  ) : (
                    <span className="text-cyan-400 font-bold animate-pulse">In Deliberation...</span>
                  )}
                </div>
              </div>
            );
          })
        )}
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
  const [sideTab, setSideTab] = useState<'chat' | 'log'>('chat');
  const chatEnd = useRef<HTMLDivElement>(null);
  const meetingKey = useRef('');

  useEffect(() => net.onChat((m) => setChat((c) => [...c.slice(-60), m])), []);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: 'end' });
  }, [chat]);

  // New meeting => fresh chat & sound
  const key = meeting ? `${meeting.callerName}:${meeting.reason}:${meeting.bodyColorId || ''}:${meeting.bodyRoom || ''}` : '';
  useEffect(() => {
    if (meeting && meeting.phase === 'INTRO' && meetingKey.current !== key) {
      meetingKey.current = key + Date.now();
      setChat([]);
      setSelected(null);
      if (meeting.reason === 'body') {
        soundEngine.playReportSting();
      } else {
        soundEngine.playEmergencyAlarm();
      }
    }
  }, [meeting, key]);

  if (!meeting) return null;
  const me = snapshot.players[myId];
  const iAmAlive = !!me?.isAlive;
  const players = Object.values(snapshot.players);
  const hasVoted = meeting.voted.includes(myId);
  const secs = Math.ceil(meeting.remainingMs / 1000);
  const history = meeting.history || snapshot.meetingHistory || [];
  const currentRound = history.length > 0 ? history[history.length - 1].roundNumber : 1;

  if (meeting.phase === 'INTRO') {
    return (
      <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-red-950/95 pointer-events-auto p-4 select-none">
        <div className="w-20 h-20 rounded-full bg-red-600/30 border-2 border-red-500 flex items-center justify-center animate-ping mb-4">
          <div className="w-12 h-12 rounded-full bg-red-500 shadow-[0_0_30px_rgba(239,68,68,1)]" />
        </div>
        <div className="text-4xl sm:text-6xl md:text-7xl font-black text-red-400 tracking-widest text-center animate-pulse drop-shadow-[0_5px_15px_rgba(239,68,68,0.6)]">
          {meeting.reason === 'body' ? 'DEAD BODY REPORTED' : 'EMERGENCY MEETING'}
        </div>
        <div className="mt-3 text-slate-200 font-bold text-base sm:text-xl flex items-center space-x-2">
          <span>Reported by</span>
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-slate-900 border border-red-500/50">
            <Bean colorId={meeting.callerColorId || ''} size={22} />
            <span className="text-white font-black underline decoration-red-500" style={{ color: colorHex(meeting.callerColorId || '') }}>
              {meeting.callerName}
            </span>
          </div>
        </div>
        {meeting.reason === 'body' && (
          <div className="mt-6 flex flex-col items-center">
            {meeting.bodyColorId && <Bean colorId={meeting.bodyColorId} size={84} dead />}
            {meeting.bodyRoom && (
              <div className="mt-4 px-4 py-1.5 rounded-full bg-slate-900/90 border border-red-500/80 text-red-300 font-black text-xs sm:text-sm tracking-wider uppercase shadow-lg flex items-center space-x-1.5">
                <MapPin size={15} />
                <span>Location: {meeting.bodyRoom}</span>
              </div>
            )}
          </div>
        )}
        <div className="mt-8 text-xs font-bold tracking-widest uppercase text-slate-400 animate-pulse">
          Assembling all crew members...
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
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="text-xl sm:text-2xl font-black text-white tracking-wider">
            {meeting.phase === 'DISCUSSION' && 'WHO IS THE IMPOSTOR?'}
            {meeting.phase === 'VOTING' && (iAmAlive ? (hasVoted ? 'VOTE CAST' : 'VOTE NOW') : 'VOTING (YOU ARE A GHOST)')}
            {meeting.phase === 'RESULTS' && 'VOTING RESULTS'}
          </div>
          <div className="text-lg font-black text-cyan-300">{secs}s</div>
        </div>

        {/* Incident Alert Strip */}
        <div className="mb-3 px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-700/80 flex flex-wrap items-center justify-between gap-2 shadow-inner">
          <div className="flex items-center space-x-2.5 min-w-0">
            {meeting.reason === 'body' ? (
              <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-black bg-red-600/90 text-white tracking-wide shrink-0 animate-pulse">
                <Skull size={13} className="shrink-0" />
                <span>DEAD BODY</span>
              </span>
            ) : (
              <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-black bg-amber-500/90 text-black tracking-wide shrink-0">
                <Megaphone size={13} className="shrink-0" />
                <span>EMERGENCY</span>
              </span>
            )}
            <div className="flex items-center space-x-1.5 text-xs sm:text-sm text-slate-300 font-semibold truncate">
              <span>Caller:</span>
              <div className="flex items-center space-x-1 font-bold text-white">
                <Bean colorId={meeting.callerColorId || ''} size={18} />
                <span style={{ color: colorHex(meeting.callerColorId || '') }}>{meeting.callerName}</span>
              </div>
              {meeting.reason === 'body' && (
                <>
                  <span className="text-slate-500">•</span>
                  <span>Corpse:</span>
                  <div className="flex items-center space-x-1">
                    {meeting.bodyColorId && <Bean colorId={meeting.bodyColorId} size={18} dead />}
                    <span className="font-bold text-white">
                      {PLAYER_COLORS.find((c) => c.id === meeting.bodyColorId)?.name || 'Crewmate'}
                    </span>
                  </div>
                  {meeting.bodyRoom && (
                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-slate-800 text-cyan-300 text-[11px] font-bold border border-slate-700">
                      <MapPin size={11} />
                      <span>{meeting.bodyRoom}</span>
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          <button
            onClick={() => setSideTab((cur) => (cur === 'log' ? 'chat' : 'log'))}
            className={`px-2.5 py-1 rounded-lg text-xs font-black flex items-center space-x-1.5 transition-colors border ${
              sideTab === 'log'
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
          >
            <ClipboardList size={13} />
            <span>{sideTab === 'log' ? 'View Chat' : `Incident Log (${history.length})`}</span>
          </button>
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

          {/* Side Panel: Tabbed Chat & Incident Log */}
          <div className="md:col-span-2 flex flex-col bg-slate-950/70 rounded-2xl border border-slate-700 h-80 md:h-auto min-h-[18rem] overflow-hidden">
            {/* Tab switch header */}
            <div className="flex border-b border-slate-800 bg-slate-900/60 p-1 gap-1 shrink-0">
              <button
                onClick={() => setSideTab('chat')}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-black flex items-center justify-center space-x-1.5 transition-all ${
                  sideTab === 'chat'
                    ? 'bg-slate-800 text-cyan-300 shadow-sm border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <MessageSquare size={13} />
                <span>CHAT</span>
                {chat.length > 0 && (
                  <span className="text-[10px] bg-slate-700 text-slate-200 px-1.5 py-0.2 rounded-full font-bold">
                    {chat.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setSideTab('log')}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-black flex items-center justify-center space-x-1.5 transition-all ${
                  sideTab === 'log'
                    ? 'bg-slate-800 text-amber-300 shadow-sm border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <ClipboardList size={13} />
                <span>INCIDENT LOG</span>
                {history.length > 0 && (
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded-full font-bold">
                    {history.length}
                  </span>
                )}
              </button>
            </div>

            {sideTab === 'chat' ? (
              <>
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
                <div className="p-2 flex space-x-1 border-t border-slate-800 shrink-0">
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
              </>
            ) : (
              <IncidentLogView history={history} currentRound={currentRound} />
            )}
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

// ---------------------------------------------------------------------------
// Admin Table Living Crewmate Minimap Overlay
// ---------------------------------------------------------------------------

export const AdminMapOverlay: React.FC<{
  snapshot: GameStateSnapshot;
  onClose: () => void;
}> = ({ snapshot, onClose }) => {
  // Count living players in each room
  const livingCounts: Record<string, number> = {};
  for (const p of Object.values(snapshot.players)) {
    if (p.isAlive) {
      livingCounts[p.room] = (livingCounts[p.room] || 0) + 1;
    }
  }

  const totalLiving = Object.values(snapshot.players).filter((p) => p.isAlive).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 pointer-events-auto">
      <div className="relative w-full max-w-5xl bg-emerald-950/90 border-2 border-emerald-500 rounded-3xl p-5 shadow-2xl flex flex-col space-y-3 font-mono">
        <div className="flex items-center justify-between border-b border-emerald-800 pb-2">
          <div className="flex items-center space-x-3">
            <Users className="w-6 h-6 text-emerald-400" />
            <div>
              <h3 className="text-xl font-black text-emerald-300 tracking-wider">ADMIN CONSOLE • THE SKELD</h3>
              <p className="text-xs text-emerald-400/80">LIVE CREW BIOMETRIC OCCUPANCY TRACKER</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-emerald-900/80 hover:bg-emerald-800 text-emerald-200 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative w-full bg-slate-950/95 rounded-2xl border-2 border-emerald-800/80 p-2 overflow-hidden">
          <svg
            viewBox={`${MAP_BOUNDS.minX} ${MAP_BOUNDS.minZ} ${MAP_BOUNDS.maxX - MAP_BOUNDS.minX} ${MAP_BOUNDS.maxZ - MAP_BOUNDS.minZ}`}
            className="w-full h-auto max-h-[65vh]"
          >
            {/* Grid scanlines effect */}
            <defs>
              <pattern id="adminGrid" width="4" height="4" patternUnits="userSpaceOnUse">
                <path d="M 4 0 L 0 0 0 4" fill="none" stroke="#064e3b" strokeWidth="0.15" />
              </pattern>
            </defs>
            <rect
              x={MAP_BOUNDS.minX}
              y={MAP_BOUNDS.minZ}
              width={MAP_BOUNDS.maxX - MAP_BOUNDS.minX}
              height={MAP_BOUNDS.maxZ - MAP_BOUNDS.minZ}
              fill="url(#adminGrid)"
            />

            {/* Corridors */}
            {MAP_CORRIDORS.map((c) => (
              <rect
                key={c.id}
                x={c.bounds.minX}
                y={c.bounds.minZ}
                width={c.bounds.maxX - c.bounds.minX}
                height={c.bounds.maxZ - c.bounds.minZ}
                fill="#062e24"
                stroke="#065f46"
                strokeWidth="0.2"
                opacity="0.8"
              />
            ))}

            {/* Rooms */}
            {MAP_ROOMS_DETAIL.map((r) => {
              const count = livingCounts[r.name] || 0;
              return (
                <g key={r.id}>
                  <rect
                    x={r.bounds.minX}
                    y={r.bounds.minZ}
                    width={r.bounds.maxX - r.bounds.minX}
                    height={r.bounds.maxZ - r.bounds.minZ}
                    fill="#022c22"
                    stroke="#10b981"
                    strokeWidth="0.4"
                    opacity="0.9"
                  />
                  <text
                    x={r.labelPos.x}
                    y={r.labelPos.z - 1.2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#6ee7b7"
                    fontSize="2.1"
                    fontWeight="bold"
                    fontFamily="Fredoka, monospace"
                  >
                    {r.name.toUpperCase()}
                  </text>

                  {/* Headcount indicator icons */}
                  {count > 0 ? (
                    <g transform={`translate(${r.labelPos.x}, ${r.labelPos.z + 2.2})`}>
                      <rect x="-3" y="-1.6" width="6" height="3.2" rx="1.6" fill="#facc15" stroke="#713f12" strokeWidth="0.3" />
                      <circle cx="-1.4" cy="0" r="0.8" fill="#713f12" />
                      <text
                        x="1.1"
                        y="0.1"
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="#713f12"
                        fontSize="2.0"
                        fontWeight="black"
                      >
                        {count}
                      </text>
                    </g>
                  ) : (
                    <text
                      x={r.labelPos.x}
                      y={r.labelPos.z + 2.2}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="#047857"
                      fontSize="1.6"
                      fontFamily="monospace"
                    >
                      EMPTY
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        <div className="flex items-center justify-between text-xs text-emerald-300">
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded-full bg-yellow-400 inline-block animate-pulse" />
              <span className="font-bold text-yellow-300">Active Lifeform Presence</span>
            </span>
            <span>Total Living Aboard: <strong>{totalLiving}</strong></span>
          </div>
          <span>Press [E] or [Esc] to exit terminal</span>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Security CCTV Surveillance Overlay (4 Cameras)
// ---------------------------------------------------------------------------

export const SecurityCamerasOverlay: React.FC<{
  snapshot: GameStateSnapshot;
  onClose: () => void;
}> = ({ snapshot, onClose }) => {
  const [timecode, setTimecode] = useState('00:12:44:09');

  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      setTimecode(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}:${pad(Math.floor(d.getMilliseconds() / 10))}`);
    }, 100);
    return () => clearInterval(id);
  }, []);

  const cams: { id: string; name: string; corridorId: string; roomKeywords: string[] }[] = [
    { id: 'CAM-01', name: 'CAFETERIA WEST CORRIDOR', corridorId: 'hall_upper_cafeteria', roomKeywords: ['Upper West Hallway', 'Cafeteria'] },
    { id: 'CAM-02', name: 'MEDBAY SPINE HALLWAY', corridorId: 'hall_medbay', roomKeywords: ['Medbay Hallway', 'West Corridor'] },
    { id: 'CAM-03', name: 'NAVIGATION EAST CORRIDOR', corridorId: 'hall_o2_nav', roomKeywords: ['Navigation Hallway', 'East Corridor'] },
    { id: 'CAM-04', name: 'SECURITY & REACTOR SPINE', corridorId: 'hall_reactor_security', roomKeywords: ['Security Hallway', 'Security Link', 'Reactor Hallway'] },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-4 pointer-events-auto font-mono">
      <div className="relative w-full max-w-5xl bg-slate-950 border-2 border-cyan-500 rounded-3xl p-5 shadow-2xl flex flex-col space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center space-x-3">
            <Camera className="w-6 h-6 text-cyan-400" />
            <div>
              <h3 className="text-xl font-black text-cyan-300 tracking-wider">SECURITY MONITOR • CCTV GRID</h3>
              <p className="text-xs text-slate-400">THE SKELD CORRIDOR SURVEILLANCE FEED</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1.5 text-xs text-red-400 font-bold animate-pulse">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
              <span>REC</span>
            </span>
            <span className="text-xs text-slate-400">{timecode}</span>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 4 Camera Feeds 2x2 Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {cams.map((cam) => {
            // Find any living players currently seen in this hallway
            const present = Object.values(snapshot.players).filter((p) =>
              p.isAlive && cam.roomKeywords.some((kw) => p.room.includes(kw))
            );

            return (
              <div
                key={cam.id}
                className="relative bg-slate-900/90 border-2 border-slate-700 rounded-2xl h-44 sm:h-52 p-3 flex flex-col justify-between overflow-hidden shadow-inner"
              >
                {/* Scanline CRT overlay */}
                <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0)_0%,rgba(0,0,0,0.6)_100%)]" />
                <div className="absolute inset-0 pointer-events-none bg-[repeating-linear-gradient(0deg,rgba(0,0,0,0.15)_0px,rgba(0,0,0,0.15)_1px,transparent_1px,transparent_3px)]" />

                <div className="flex items-center justify-between text-xs z-10">
                  <span className="bg-black/60 px-2 py-0.5 rounded text-cyan-300 font-bold">{cam.id}</span>
                  <span className="text-slate-400 text-[11px] truncate max-w-[12rem]">{cam.name}</span>
                </div>

                {/* Corridor feed visualization */}
                <div className="relative flex-1 flex items-center justify-center my-1 border border-slate-800/80 rounded-lg bg-slate-950/80">
                  {present.length === 0 ? (
                    <span className="text-xs text-slate-600 font-bold tracking-widest uppercase">CORRIDOR CLEAR</span>
                  ) : (
                    <div className="flex items-center space-x-3">
                      {present.map((p) => (
                        <div key={p.id} className="flex flex-col items-center animate-pulse">
                          <Bean colorId={p.colorId} size={38} />
                          <span className="text-[10px] text-white font-bold mt-1 bg-black/60 px-1 rounded">{p.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400 z-10">
                  <span>HD 1080P • 30FPS</span>
                  <span className={present.length > 0 ? 'text-amber-400 font-bold' : 'text-emerald-400'}>
                    {present.length > 0 ? `MOTION DETECTED (${present.length})` : 'SECURE'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Camera feeds update in real time based on ship network.</span>
          <span>Press [E] or [Esc] to exit Security</span>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tactical Sabotage Map Overlay (Impostors Only)
// ---------------------------------------------------------------------------

export const SabotageMapOverlay: React.FC<{
  snapshot: GameStateSnapshot;
  onClose: () => void;
}> = ({ snapshot, onClose }) => {
  const cdMs = snapshot.you?.sabotageCooldownMs || 0;
  const cdSec = Math.ceil(cdMs / 1000);
  const ready = cdMs <= 0;
  const sab = snapshot.sabotage;

  const trigger = (type: 'lights' | 'reactor' | 'o2' | 'doors', room?: 'Cafeteria' | 'Storage') => {
    if (!ready) return;
    soundEngine.playClick();
    net.sabotage(type, room);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 pointer-events-auto">
      <div className="relative w-full max-w-4xl bg-red-950/90 border-2 border-red-500 rounded-3xl p-5 shadow-2xl flex flex-col space-y-4">
        <div className="flex items-center justify-between border-b border-red-800 pb-2">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-6 h-6 text-red-400 animate-pulse" />
            <div>
              <h3 className="text-xl font-black text-red-300 tracking-wider">TACTICAL SABOTAGE SYSTEM</h3>
              <p className="text-xs text-red-300/70">SELECT SHIP COMPONENT TO DISRUPT CREW PROTOCOLS</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <span className={`px-3 py-1 rounded-xl text-xs font-black ${ready ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
              {ready ? 'READY' : `COOLDOWN: ${cdSec}s`}
            </span>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-red-900/80 hover:bg-red-800 text-red-200 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tactical Sabotage Options Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* 1. Reactor Meltdown */}
          <div className="bg-slate-900/90 border-2 border-red-700/80 rounded-2xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-2 text-red-400 mb-1">
                <Flame className="w-5 h-5" />
                <h4 className="font-black text-white text-sm">REACTOR MELTDOWN</h4>
              </div>
              <p className="text-xs text-slate-400 leading-snug">
                Critical sabotage. Triggers a 45s countdown. Impostors win if not dual-repaired in Reactor.
              </p>
            </div>
            <button
              disabled={!ready || !!sab}
              onClick={() => trigger('reactor')}
              className="mt-3 py-2 px-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 disabled:opacity-40 text-white text-xs font-black uppercase tracking-wider cursor-pointer"
            >
              TRIGGER MELTDOWN
            </button>
          </div>

          {/* 2. O2 Depletion */}
          <div className="bg-slate-900/90 border-2 border-red-700/80 rounded-2xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-2 text-emerald-400 mb-1">
                <Wind className="w-5 h-5" />
                <h4 className="font-black text-white text-sm">O2 DEPLETION</h4>
              </div>
              <p className="text-xs text-slate-400 leading-snug">
                Critical sabotage. Oxygen purges over 45s. Requires emergency keypad resets in O2 and Admin.
              </p>
            </div>
            <button
              disabled={!ready || !!sab}
              onClick={() => trigger('o2')}
              className="mt-3 py-2 px-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 disabled:opacity-40 text-white text-xs font-black uppercase tracking-wider cursor-pointer"
            >
              PURGE OXYGEN
            </button>
          </div>

          {/* 3. Fix Lights (Electrical) */}
          <div className="bg-slate-900/90 border-2 border-yellow-600/80 rounded-2xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-2 text-yellow-400 mb-1">
                <Zap className="w-5 h-5" />
                <h4 className="font-black text-white text-sm">ELECTRICAL LIGHTS</h4>
              </div>
              <p className="text-xs text-slate-400 leading-snug">
                Reduces Crewmate vision radius to a tight circle while Impostor vision remains full.
              </p>
            </div>
            <button
              disabled={!ready || !!sab}
              onClick={() => trigger('lights')}
              className="mt-3 py-2 px-3 rounded-xl bg-gradient-to-r from-yellow-600 to-amber-700 hover:from-yellow-500 hover:to-amber-600 disabled:opacity-40 text-white text-xs font-black uppercase tracking-wider cursor-pointer"
            >
              KILL POWER
            </button>
          </div>

          {/* 4. Lock Cafeteria Doors */}
          <div className="bg-slate-900/90 border-2 border-amber-700/80 rounded-2xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-2 text-amber-400 mb-1">
                <Lock className="w-5 h-5" />
                <h4 className="font-black text-white text-sm">LOCK CAFETERIA DOORS</h4>
              </div>
              <p className="text-xs text-slate-400 leading-snug">
                Deploys physical 3D blast doors and impassable collision barriers to Cafeteria for 10 seconds.
              </p>
            </div>
            <button
              disabled={!ready}
              onClick={() => trigger('doors', 'Cafeteria')}
              className="mt-3 py-2 px-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-700 hover:from-amber-500 hover:to-orange-600 disabled:opacity-40 text-white text-xs font-black uppercase tracking-wider cursor-pointer"
            >
              SEAL CAFETERIA
            </button>
          </div>

          {/* 5. Lock Storage Doors */}
          <div className="bg-slate-900/90 border-2 border-amber-700/80 rounded-2xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-2 text-amber-400 mb-1">
                <Lock className="w-5 h-5" />
                <h4 className="font-black text-white text-sm">LOCK STORAGE DOORS</h4>
              </div>
              <p className="text-xs text-slate-400 leading-snug">
                Deploys heavy blast doors and blocks movement into and out of Storage for 10 seconds.
              </p>
            </div>
            <button
              disabled={!ready}
              onClick={() => trigger('doors', 'Storage')}
              className="mt-3 py-2 px-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-700 hover:from-amber-500 hover:to-orange-600 disabled:opacity-40 text-white text-xs font-black uppercase tracking-wider cursor-pointer"
            >
              SEAL STORAGE
            </button>
          </div>
        </div>

        <div className="text-xs text-red-300/70 text-center pt-2 border-t border-red-900">
          Sabotages have a shared 30-second cooldown. Emergency meetings are prohibited during active critical meltdowns.
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Electrical Breaker Box Overlay (5 Switches)
// ---------------------------------------------------------------------------

export const BreakerPanelOverlay: React.FC<{
  snapshot: GameStateSnapshot;
  onClose: () => void;
}> = ({ snapshot, onClose }) => {
  const switches = snapshot.sabotage?.switches || [false, false, false, false, false];

  const toggle = (idx: number) => {
    soundEngine.playSwitchToggle();
    net.fixSabotage('lights', idx);
  };

  const allOn = switches.every((s) => s === true);
  useEffect(() => {
    if (allOn && snapshot.sabotage?.type !== 'lights') {
      setTimeout(onClose, 400);
    }
  }, [allOn, snapshot.sabotage, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 pointer-events-auto font-mono">
      <div className="relative w-full max-w-md bg-slate-900 border-4 border-yellow-600 rounded-3xl p-6 shadow-2xl flex flex-col space-y-5">
        <div className="flex items-center justify-between border-b border-yellow-700/60 pb-3">
          <div className="flex items-center space-x-2">
            <Zap className="w-6 h-6 text-yellow-400" />
            <div>
              <h3 className="text-xl font-black text-yellow-300 tracking-wider">ELECTRICAL BREAKER PANEL</h3>
              <p className="text-xs text-yellow-500">FLIP ALL 5 SWITCHES TO [ON] TO RESTORE POWER</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 5 Toggle Switches */}
        <div className="grid grid-cols-5 gap-3 bg-slate-950 p-4 rounded-2xl border-2 border-slate-800">
          {switches.map((isOn, idx) => (
            <div key={idx} className="flex flex-col items-center space-y-3">
              {/* LED Indicator */}
              <div
                className={`w-3.5 h-3.5 rounded-full border border-black transition-all ${
                  isOn ? 'bg-emerald-400 shadow-[0_0_10px_#10b981]' : 'bg-red-600 shadow-[0_0_10px_#ef4444]'
                }`}
              />

              {/* Physical Lever */}
              <button
                onClick={() => toggle(idx)}
                className={`w-12 h-24 rounded-xl border-2 flex flex-col items-center justify-between p-1.5 transition-all cursor-pointer ${
                  isOn ? 'bg-slate-700 border-emerald-400' : 'bg-slate-800 border-red-500'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg font-black text-[11px] flex items-center justify-center text-white transition-all shadow-md ${
                    isOn ? 'bg-emerald-500 transform translate-y-0' : 'bg-red-500 transform translate-y-12'
                  }`}
                >
                  {isOn ? 'ON' : 'OFF'}
                </div>
              </button>
              <span className="text-[10px] text-slate-400 font-bold">SW-0{idx + 1}</span>
            </div>
          ))}
        </div>

        <div className="text-center text-xs font-bold text-yellow-400">
          {allOn ? 'ALL SWITCHES ACTIVE • POWER RESTORED' : 'POWER OUTAGE ACTIVE • VISION REDUCED'}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Reactor Meltdown Override Handpad Overlay
// ---------------------------------------------------------------------------

export const ReactorPanelOverlay: React.FC<{
  pad: 'top' | 'bottom';
  snapshot: GameStateSnapshot;
  onClose: () => void;
}> = ({ pad, snapshot, onClose }) => {
  const [holding, setHolding] = useState(false);
  const sab = snapshot.sabotage;

  const handleTouch = () => {
    soundEngine.playClick();
    setHolding(true);
    net.fixSabotage('reactor', undefined, pad);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 pointer-events-auto font-mono">
      <div className="relative w-full max-w-md bg-slate-900 border-4 border-red-600 rounded-3xl p-6 shadow-2xl flex flex-col space-y-4">
        <div className="flex items-center justify-between border-b border-red-700/60 pb-3">
          <div className="flex items-center space-x-2">
            <Flame className="w-6 h-6 text-red-400 animate-pulse" />
            <div>
              <h3 className="text-xl font-black text-red-300 tracking-wider">REACTOR OVERRIDE</h3>
              <p className="text-xs text-red-400">DUAL HANDPADS REQUIRED • PAD: {pad.toUpperCase()}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="text-center text-2xl font-black text-red-400 animate-pulse">
          COUNTDOWN: {sab?.countdown || 0}s
        </div>

        {/* Handpad Press Area */}
        <div className="flex flex-col items-center justify-center p-6 bg-slate-950 rounded-2xl border-2 border-red-800">
          <button
            onPointerDown={handleTouch}
            className={`w-36 h-36 rounded-full border-4 flex flex-col items-center justify-center font-black transition-all cursor-pointer ${
              holding
                ? 'bg-emerald-600 border-emerald-300 text-white shadow-[0_0_25px_#10b981]'
                : 'bg-red-700 hover:bg-red-600 border-red-300 text-white active:scale-95 shadow-[0_0_20px_rgba(239,68,68,0.5)]'
            }`}
          >
            <span className="text-3xl mb-1">✋</span>
            <span className="text-xs">{holding ? 'HOLDING PAD' : 'PRESS & HOLD'}</span>
          </button>
        </div>

        <div className="flex justify-between text-xs text-slate-400">
          <span>Top Pad: {sab?.reactorPads?.top ? '✓ ACTIVE' : 'WAITING'}</span>
          <span>Bottom Pad: {sab?.reactorPads?.bottom ? '✓ ACTIVE' : 'WAITING'}</span>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// O2 Keypad Override Overlay
// ---------------------------------------------------------------------------

export const O2KeypadOverlay: React.FC<{
  pad: 'o2' | 'admin';
  snapshot: GameStateSnapshot;
  onClose: () => void;
}> = ({ pad, snapshot, onClose }) => {
  const [code, setCode] = useState('');
  const targetCode = '82941';

  const press = (num: string) => {
    soundEngine.playClick();
    if (code.length < 5) {
      const next = code + num;
      setCode(next);
      if (next === targetCode) {
        net.fixSabotage('o2', undefined, pad);
        setTimeout(onClose, 400);
      }
    }
  };

  const clear = () => {
    soundEngine.playClick();
    setCode('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 pointer-events-auto font-mono">
      <div className="relative w-full max-w-sm bg-slate-900 border-4 border-emerald-600 rounded-3xl p-6 shadow-2xl flex flex-col space-y-4">
        <div className="flex items-center justify-between border-b border-emerald-700/60 pb-3">
          <div className="flex items-center space-x-2">
            <Wind className="w-6 h-6 text-emerald-400" />
            <div>
              <h3 className="text-lg font-black text-emerald-300">O2 OVERRIDE KEYPAD</h3>
              <p className="text-xs text-emerald-400/80">LOCATION: {pad.toUpperCase()}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Display */}
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
          <div className="text-[10px] text-slate-400 mb-1">ENTER CODE: <strong>{targetCode}</strong></div>
          <div className="text-3xl font-black text-emerald-400 tracking-widest min-h-[2.5rem]">
            {code || '-----'}
          </div>
        </div>

        {/* 1-9 Keypad */}
        <div className="grid grid-cols-3 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
            <button
              key={n}
              onClick={() => press(n)}
              className="py-3 bg-slate-800 hover:bg-slate-700 active:bg-emerald-600 text-white font-black text-lg rounded-xl transition-all cursor-pointer"
            >
              {n}
            </button>
          ))}
          <button
            onClick={clear}
            className="py-3 bg-red-900/80 hover:bg-red-800 text-red-200 font-black text-sm rounded-xl cursor-pointer"
          >
            CLR
          </button>
          <button
            onClick={() => press('0')}
            className="py-3 bg-slate-800 hover:bg-slate-700 text-white font-black text-lg rounded-xl cursor-pointer"
          >
            0
          </button>
          <button
            onClick={() => {
              if (code === targetCode) {
                net.fixSabotage('o2', undefined, pad);
                onClose();
              }
            }}
            className="py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm rounded-xl cursor-pointer"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

