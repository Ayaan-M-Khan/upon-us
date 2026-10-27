/**
 * Impostor Protocol - Real-Time Chat Interface
 * Supports Team-wide (All / Radio) and Local Spatial Proximity messaging,
 * Impostor-only encrypted channel, quick tactical callouts, and 3D speech bubble integration.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  MessageSquare,
  Radio,
  Wifi,
  Send,
  X,
  ChevronDown,
  Volume2,
  Skull,
  ShieldAlert,
  Zap,
  Flame,
  CornerDownLeft,
  Sparkles,
} from 'lucide-react';
import { MAX_CHAT_MESSAGE_LENGTH, PLAYER_COLORS } from '../../shared/constants';
import { ChatBroadcastMessage, ChatScope, LobbyPlayer, PlayerSnapshot } from '../../shared/events';
import { soundEngine } from '../audio';
import { net } from '../net';

interface ChatOverlayProps {
  currentRoom?: string;
  isGameMatch?: boolean; // true if inside 3D spaceship match, false if in lobby
  players?: (LobbyPlayer | PlayerSnapshot)[];
  localPlayerId?: string;
  myRole?: string; // 'crewmate' | 'impostor'
  onDisplayChatBubble?: (playerId: string, text: string, scope: ChatScope) => void;
}

export const ChatOverlay: React.FC<ChatOverlayProps> = ({
  currentRoom = 'Dropship',
  isGameMatch = false,
  players = [],
  localPlayerId = net.getSocketId() || '',
  myRole = net.getMyRole(),
  onDisplayChatBubble,
}) => {
  const [messages, setMessages] = useState<ChatBroadcastMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeScope, setActiveScope] = useState<ChatScope>('team');
  const [unreadCount, setUnreadCount] = useState(0);
  const [recentToast, setRecentToast] = useState<ChatBroadcastMessage | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isImpostor = myRole === 'impostor';
  const localPlayerObj = players.find((p) => p.id === localPlayerId);
  const isGhost = (localPlayerObj as any)?.isAlive === false;

  // Auto-switch to dedicated Haunt channel when eliminated
  useEffect(() => {
    if (isGhost) {
      setActiveScope('haunt');
    }
  }, [isGhost]);

  // Listen to incoming chat broadcasts from server
  useEffect(() => {
    const unsubChat = net.onChatMessage((msg) => {
      setMessages((prev) => [...prev.slice(-99), msg]);

      // Audio cue
      soundEngine.playChatMessage(msg.scope);

      // Trigger 3D speech bubble
      if (onDisplayChatBubble) {
        onDisplayChatBubble(msg.senderId, msg.text, msg.scope);
      }

      // Show floating toast when chat is collapsed
      if (!isOpen) {
        setUnreadCount((c) => c + 1);
        setRecentToast(msg);
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = setTimeout(() => {
          setRecentToast(null);
        }, 4500);
      }
    });

    return () => {
      unsubChat();
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, [isOpen, onDisplayChatBubble]);

  // Global keybindings: Enter or T opens and focuses chat; Escape closes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInputActive =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if (e.code === 'Enter' || e.code === 'KeyT') {
        if (!isInputActive) {
          e.preventDefault();
          setIsOpen(true);
          setUnreadCount(0);
          setTimeout(() => inputRef.current?.focus(), 50);
        }
      } else if (e.code === 'Escape') {
        if (isOpen) {
          e.preventDefault();
          setIsOpen(false);
          inputRef.current?.blur();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputText.trim();
    if (!text) return;

    soundEngine.playClick();
    net.sendChatMessage(text, activeScope);
    setInputText('');
  };

  const handleSendQuickPhrase = (phrase: string) => {
    soundEngine.playClick();
    net.sendChatMessage(phrase, activeScope);
    if (!isOpen) {
      setIsOpen(true);
    }
  };

  // Filter messages by active scope or show all with indicators
  const displayedMessages = messages;

  // Count nearby players if spatial proximity applies
  const nearbyPlayersCount = React.useMemo(() => {
    if (!players || players.length <= 1) return 0;
    const me = players.find((p) => p.id === localPlayerId);
    if (!me) return 0;

    const radius = isGameMatch ? 14 : 8;
    return players.filter((p) => {
      if (p.id === localPlayerId) return false;
      const dist = Math.hypot(p.x - me.x, p.z - me.z);
      return dist <= radius;
    }).length;
  }, [players, localPlayerId, isGameMatch]);

  const quickPhrases = isGhost
    ? [
        'Ghost noclip active! 👻',
        'I was eliminated! Watch vents!',
        'Doing my ghost tasks ⚡',
        'Haunt chat only 🔮',
        'Finish your tasks crewmates!',
        'GG everyone!',
      ]
    : isGameMatch
    ? [
        'Where?',
        'I was in MedBay',
        'Suspicious near vents! 👀',
        'Follow me',
        'Doing wires in Electrical',
        'Self-report?',
        'Skip vote',
      ]
    : [
        'Ready to launch! 🚀',
        'Start test game',
        'Love this color suit',
        'Who is host?',
        'GG everyone!',
      ];

  return (
    <aside aria-label="Game Chat" className="fixed bottom-4 left-4 z-40 pointer-events-auto flex flex-col items-start select-none font-sans">
      {/* COLLAPSED HUD BUTTON & RECENT TOAST */}
      {!isOpen && (
        <div className="flex flex-col items-start space-y-2">
          {/* Floating mini toast preview */}
          {recentToast && (
            <div
              onClick={() => {
                setIsOpen(true);
                setUnreadCount(0);
              }}
              className="animate-fadeIn max-w-xs sm:max-w-sm bg-slate-900/95 backdrop-blur-md border-2 border-slate-700 p-2.5 rounded-2xl shadow-2xl cursor-pointer hover:border-cyan-400 transition-all flex items-start space-x-2.5 text-xs"
            >
              <div
                className="w-5 h-5 rounded-full border border-white/50 shrink-0 mt-0.5"
                style={{
                  backgroundColor:
                    PLAYER_COLORS.find((c) => c.id === recentToast.senderColorId)?.hex || '#38bdf8',
                }}
              />
              <div className="overflow-hidden">
                <div className="flex items-center space-x-1.5">
                  <span className="font-bold text-white truncate">{recentToast.senderName}</span>
                  <span
                    className={`text-[9px] font-black uppercase px-1 rounded ${
                      recentToast.scope === 'proximity'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/50'
                        : recentToast.scope === 'impostor'
                        ? 'bg-red-950 text-red-300 border border-red-600/50'
                        : 'bg-cyan-950 text-cyan-300 border border-cyan-600/50'
                    }`}
                  >
                    {recentToast.scope === 'proximity'
                      ? `LOCAL • ${recentToast.distance ?? 0}m`
                      : recentToast.scope === 'impostor'
                      ? 'IMPOSTOR'
                      : 'RADIO'}
                  </span>
                </div>
                <p className="text-slate-200 truncate mt-0.5">{recentToast.text}</p>
              </div>
            </div>
          )}

          {/* Chat Toggle Button */}
          <button
            onClick={() => {
              soundEngine.playClick();
              setIsOpen(true);
              setUnreadCount(0);
              setTimeout(() => inputRef.current?.focus(), 50);
            }}
            className="flex items-center space-x-2.5 bg-slate-900/90 hover:bg-slate-800 backdrop-blur-xl border-2 border-slate-700/90 px-4 py-2.5 rounded-2xl shadow-[0_10px_25px_rgba(0,0,0,0.5)] text-slate-200 hover:text-white transition-all cursor-pointer group hover:border-cyan-400"
            title="Open Chat (Press Enter or T)"
          >
            <div className="relative">
              <MessageSquare className="w-5 h-5 text-cyan-400 group-hover:scale-110 transition-transform" />
              {unreadCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-600 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                  {unreadCount}
                </span>
              )}
            </div>
            <span className="text-xs font-black tracking-wider text-cyan-300">
              CHAT <span className="text-slate-500 font-mono text-[10px]">[T / ↵]</span>
            </span>
            {nearbyPlayersCount > 0 && (
              <span className="hidden sm:inline-flex items-center space-x-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-700/60">
                <Wifi className="w-3 h-3 animate-pulse" />
                <span>{nearbyPlayersCount} NEARBY</span>
              </span>
            )}
          </button>
        </div>
      )}

      {/* EXPANDED FULL-FEATURED CHAT DOCK */}
      {isOpen && (
        <div className="w-[90vw] sm:w-[420px] max-h-[72vh] flex flex-col bg-slate-950/95 backdrop-blur-2xl border-2 border-slate-700/90 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] overflow-hidden animate-fadeIn">
          {/* HEADER */}
          <div className="flex items-center justify-between p-3 bg-slate-900/90 border-b border-slate-800">
            <div className="flex items-center space-x-2">
              <Radio className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-black uppercase tracking-wider text-slate-200">
                COMMS MATRIX
              </span>
              <span className="text-[10px] text-slate-400 font-bold bg-slate-800/80 px-2 py-0.5 rounded-md">
                {currentRoom}
              </span>
            </div>

            <div className="flex items-center space-x-1.5">
              {/* Proximity status pill */}
              <div
                className="flex items-center space-x-1 px-2 py-1 rounded-lg bg-emerald-950/60 border border-emerald-700/50 text-[10px] font-bold text-emerald-300"
                title={`${nearbyPlayersCount} crew members within proximity range`}
              >
                <Wifi className="w-3 h-3 text-emerald-400" />
                <span>{nearbyPlayersCount} IN PROXIMITY</span>
              </div>

              <button
                onClick={() => {
                  soundEngine.playClick();
                  setIsOpen(false);
                }}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer"
                title="Minimize (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* CHANNEL SCOPE TABS */}
          <div className="flex bg-slate-950/80 p-1.5 border-b border-slate-800 space-x-1 text-xs">
            {/* Team / All Radio */}
            <button
              onClick={() => {
                soundEngine.playClick();
                setActiveScope('team');
              }}
              className={`flex-1 py-1.5 px-2 rounded-xl font-bold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                activeScope === 'team'
                  ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-500/50 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>RADIO (ALL)</span>
            </button>

            {/* Proximity Chat */}
            <button
              onClick={() => {
                soundEngine.playClick();
                setActiveScope('proximity');
              }}
              className={`flex-1 py-1.5 px-2 rounded-xl font-bold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                activeScope === 'proximity'
                  ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/50 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Wifi className="w-3.5 h-3.5" />
              <span>PROXIMITY</span>
            </button>

            {/* Impostor Channel (if player is an Impostor) */}
            {isImpostor && (
              <button
                onClick={() => {
                  soundEngine.playClick();
                  setActiveScope('impostor');
                }}
                className={`py-1.5 px-2.5 rounded-xl font-bold flex items-center justify-center space-x-1 transition-all cursor-pointer ${
                  activeScope === 'impostor'
                    ? 'bg-red-600/30 text-red-300 border border-red-500/60 shadow-sm'
                    : 'text-red-400/70 hover:text-red-300'
                }`}
                title="Secret encrypted channel between Impostors only"
              >
                <Skull className="w-3.5 h-3.5 text-red-400" />
                <span>IMPOSTOR</span>
              </button>
            )}

            {/* Haunt Chat (if player is a Ghost) */}
            {isGhost && (
              <button
                onClick={() => {
                  soundEngine.playClick();
                  setActiveScope('haunt');
                }}
                className={`py-1.5 px-2.5 rounded-xl font-bold flex items-center justify-center space-x-1 transition-all cursor-pointer ${
                  activeScope === 'haunt'
                    ? 'bg-purple-600/40 text-purple-200 border border-purple-400 shadow-sm'
                    : 'text-purple-400 hover:text-purple-200'
                }`}
                title="Haunt channel visible strictly to deceased ghosts"
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-300" />
                <span>HAUNT</span>
              </button>
            )}
          </div>

          {/* ACTIVE SCOPE EXPLANATION BANNER */}
          <div className="px-3 py-1 bg-slate-900/60 border-b border-slate-800/80 flex items-center justify-between text-[10px]">
            {activeScope === 'team' && (
              <span className="text-cyan-300/80 font-medium">
                📻 Broadcast to <strong>all players</strong> across the ship.
              </span>
            )}
            {activeScope === 'proximity' && (
              <span className="text-emerald-300/90 font-medium">
                🛰️ Only heard by crew within <strong>{isGameMatch ? '14m' : '8m'}</strong> proximity.
              </span>
            )}
            {activeScope === 'impostor' && (
              <span className="text-red-400 font-bold flex items-center space-x-1">
                <ShieldAlert className="w-3 h-3 shrink-0" />
                <span>Encrypted: only fellow Impostors can see this.</span>
              </span>
            )}
            {activeScope === 'haunt' && (
              <span className="text-purple-300 font-bold flex items-center space-x-1">
                <Sparkles className="w-3 h-3 shrink-0 text-purple-300" />
                <span>Haunt Channel: Only visible to other eliminated ghosts.</span>
              </span>
            )}
            <span className="text-slate-500 font-mono text-[9px]">[Esc to close]</span>
          </div>

          {/* MESSAGE LOG LIST */}
          <div className="flex-1 p-3 overflow-y-auto space-y-2.5 min-h-[160px] max-h-[36vh]">
            {displayedMessages.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs font-semibold">
                No communications yet. Broadcast a message or use quick tactical callouts below!
              </div>
            ) : (
              displayedMessages.map((msg) => {
                const colorConfig = PLAYER_COLORS.find((c) => c.id === msg.senderColorId) || PLAYER_COLORS[0];
                const isMe = msg.senderId === localPlayerId;
                const timeStr = new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                });

                return (
                  <div
                    key={msg.id}
                    className={`flex items-start space-x-2.5 p-2 rounded-2xl transition-colors ${
                      isMe ? 'bg-slate-900/60' : 'bg-slate-900/35 hover:bg-slate-900/50'
                    }`}
                  >
                    {/* Suit Color Avatar Dot */}
                    <div
                      className="w-7 h-7 rounded-full border-2 border-white/50 shrink-0 flex items-center justify-center shadow-md mt-0.5"
                      style={{ backgroundColor: colorConfig.hex }}
                    >
                      <span className="text-[10px] font-black text-white">
                        {msg.senderName.charAt(0).toUpperCase()}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-1.5 flex-wrap">
                        <span className="text-xs font-bold text-white">{msg.senderName}</span>
                        {isMe && <span className="text-[9px] text-cyan-400 font-extrabold">(YOU)</span>}

                        {/* Channel Badge */}
                        <span
                          className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded-md ${
                            msg.scope === 'haunt'
                              ? 'bg-purple-950 text-purple-200 border border-purple-500/80 shadow-[0_0_8px_rgba(168,85,247,0.3)]'
                              : msg.scope === 'proximity'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/60'
                              : msg.scope === 'impostor'
                              ? 'bg-red-950 text-red-300 border border-red-600/60'
                              : 'bg-cyan-950 text-cyan-300 border border-cyan-600/60'
                          }`}
                        >
                          {msg.scope === 'haunt'
                            ? '👻 HAUNT'
                            : msg.scope === 'proximity'
                            ? `LOCAL ${msg.distance !== undefined ? `• ${msg.distance}m` : ''}`
                            : msg.scope === 'impostor'
                            ? 'IMPOSTOR'
                            : 'RADIO'}
                        </span>

                        <span className="text-[9px] text-slate-500 font-mono ml-auto">{timeStr}</span>
                      </div>

                      {/* Text */}
                      <p className="text-xs text-slate-200 mt-1 break-words select-text font-medium leading-relaxed">
                        {msg.text}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* QUICK TACTICAL PHRASES SCROLLER */}
          <div className="px-3 py-1.5 bg-slate-900/80 border-t border-slate-800 flex items-center space-x-1.5 overflow-x-auto no-scrollbar">
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 shrink-0 flex items-center space-x-1">
              <Zap className="w-3 h-3 text-yellow-400" />
              <span>QUICK:</span>
            </span>
            {quickPhrases.map((phrase, idx) => (
              <button
                key={idx}
                onClick={() => handleSendQuickPhrase(phrase)}
                className="shrink-0 text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-2 py-1 rounded-lg border border-slate-700 hover:border-cyan-400 transition-all cursor-pointer whitespace-nowrap active:scale-95"
              >
                {phrase}
              </button>
            ))}
          </div>

          {/* INPUT FORM */}
          <form onSubmit={handleSendMessage} className="p-2.5 bg-slate-950 border-t border-slate-800 flex items-center space-x-2">
            {/* Scope indicator pill inside input */}
            <div
              className={`shrink-0 px-2 py-1.5 rounded-xl text-[10px] font-black uppercase flex items-center space-x-1 ${
                activeScope === 'proximity'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-600'
                  : activeScope === 'impostor'
                  ? 'bg-red-950 text-red-300 border border-red-600'
                  : 'bg-cyan-950 text-cyan-300 border border-cyan-600'
              }`}
            >
              {activeScope === 'proximity' ? (
                <>
                  <Wifi className="w-3 h-3" />
                  <span className="hidden sm:inline">PROX</span>
                </>
              ) : activeScope === 'impostor' ? (
                <>
                  <Skull className="w-3 h-3" />
                  <span className="hidden sm:inline">IMP</span>
                </>
              ) : (
                <>
                  <Radio className="w-3 h-3" />
                  <span className="hidden sm:inline">RAD</span>
                </>
              )}
            </div>

            <input
              ref={inputRef}
              type="text"
              maxLength={MAX_CHAT_MESSAGE_LENGTH}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={
                activeScope === 'proximity'
                  ? 'Say something to nearby crew...'
                  : activeScope === 'impostor'
                  ? 'Impostor encrypted comms...'
                  : 'Broadcast to ship radio...'
              }
              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-all"
            />

            <button
              type="submit"
              disabled={!inputText.trim()}
              className={`p-2 rounded-xl transition-all cursor-pointer flex items-center justify-center shadow-md ${
                inputText.trim()
                  ? activeScope === 'proximity'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
                    : activeScope === 'impostor'
                    ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/30'
                    : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-600/30'
                  : 'bg-slate-800 text-slate-600 cursor-not-allowed opacity-50'
              }`}
              title="Send (Enter)"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </aside>
  );
};
