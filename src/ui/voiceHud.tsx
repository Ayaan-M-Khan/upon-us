/**
 * Impostor Protocol - Proximity Voice Chat HUD
 * Floating tactical radio communicator with PTT controls, live VU meter,
 * occlusion indicator, and nearby crew proximity monitoring.
 */

import React, { useEffect, useState } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Radio,
  RadioTower,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Wifi,
  ShieldAlert,
} from 'lucide-react';
import { GameStateSnapshot } from '../../shared/events';
import { GAME_STATES, PLAYER_COLORS } from '../../shared/constants';
import { proximityVoice, VoiceSystemState } from '../audio/proximityVoice';
import { soundEngine } from '../audio';

interface VoiceHudProps {
  snapshot: GameStateSnapshot | null;
}

export const VoiceHud: React.FC<VoiceHudProps> = ({ snapshot }) => {
  const [voiceState, setVoiceState] = useState<VoiceSystemState>(proximityVoice.getState());
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [pttHeld, setPttHeld] = useState<boolean>(false);

  useEffect(() => {
    const unsub = proximityVoice.subscribe((s) => {
      setVoiceState(s);
    });
    return () => unsub();
  }, []);

  const handleToggleMic = async () => {
    soundEngine.playClick();
    if (!voiceState.isMicActive) {
      await proximityVoice.startMicrophone();
    } else {
      proximityVoice.toggleMute();
    }
  };

  const handleToggleDeafen = () => {
    soundEngine.playClick();
    proximityVoice.toggleDeafen();
  };

  const handleTogglePtt = () => {
    soundEngine.playClick();
    proximityVoice.togglePushToTalk();
  };

  const handlePttDown = () => {
    setPttHeld(true);
    proximityVoice.setPushToTalkActive(true);
  };

  const handlePttUp = () => {
    setPttHeld(false);
    proximityVoice.setPushToTalkActive(false);
  };

  const isMeeting = snapshot?.state === GAME_STATES.MEETING;
  const playersMap = snapshot?.players || {};

  // Audible peers: either within distance or all during meeting
  const audiblePeers = voiceState.activePeers
    .filter((p) => isMeeting || p.volumePct > 0)
    .sort((a, b) => a.distance - b.distance);

  return (
    <div className="absolute top-20 left-4 z-30 pointer-events-auto flex flex-col items-start select-none font-sans">
      {/* Main Communicator Badge */}
      <div
        className={`flex items-center space-x-2.5 px-3 py-2 rounded-2xl backdrop-blur-md border transition-all shadow-xl ${
          voiceState.isTransmitting
            ? 'bg-emerald-950/90 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.35)]'
            : voiceState.isMuted
            ? 'bg-slate-900/85 border-rose-800/80 text-rose-300'
            : 'bg-slate-900/85 border-slate-700/80 text-slate-200'
        }`}
      >
        {/* Mic Toggle Button */}
        <button
          onClick={handleToggleMic}
          className={`p-2 rounded-xl transition-all flex items-center justify-center cursor-pointer ${
            !voiceState.isMicActive
              ? 'bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 border border-amber-500/50'
              : voiceState.isMuted
              ? 'bg-rose-900/50 hover:bg-rose-900/80 text-rose-300 border border-rose-700/50'
              : voiceState.isTransmitting
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg animate-pulse'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600'
          }`}
          title={
            !voiceState.isMicActive
              ? 'Click to Enable Microphone'
              : voiceState.isMuted
              ? 'Microphone Muted (Click to Unmute)'
              : 'Microphone Active'
          }
        >
          {!voiceState.isMicActive ? (
            <RadioTower className="w-4 h-4" />
          ) : voiceState.isMuted ? (
            <MicOff className="w-4 h-4" />
          ) : (
            <Mic className="w-4 h-4" />
          )}
        </button>

        {/* Live Audio / Status info */}
        <div className="flex flex-col min-w-[5.5rem]">
          <div className="flex items-center justify-between text-[11px] font-black tracking-wider leading-none">
            <span
              className={
                voiceState.isTransmitting
                  ? 'text-emerald-400 font-extrabold'
                  : voiceState.isMuted
                  ? 'text-rose-400'
                  : 'text-slate-300'
              }
            >
              {!voiceState.isMicActive
                ? 'VOICE OFF'
                : voiceState.isMuted
                ? 'MUTED'
                : voiceState.isTransmitting
                ? 'TRANSMITTING'
                : voiceState.isPushToTalk
                ? 'PTT (HOLD V)'
                : 'OPEN MIC'}
            </span>
          </div>

          {/* VU Meter Bar */}
          <div className="w-full h-1.5 rounded-full bg-slate-950/80 overflow-hidden mt-1.5 border border-slate-700/50">
            <div
              className={`h-full transition-all duration-75 ${
                voiceState.isTransmitting
                  ? 'bg-gradient-to-r from-emerald-500 to-cyan-400'
                  : voiceState.isMuted
                  ? 'bg-rose-500/30'
                  : 'bg-slate-600'
              }`}
              style={{
                width: `${voiceState.isMuted ? 0 : Math.round(voiceState.micInputLevel * 100)}%`,
              }}
            />
          </div>
        </div>

        {/* Deafen Toggle */}
        <button
          onClick={handleToggleDeafen}
          className={`p-1.5 rounded-xl transition-all cursor-pointer ${
            voiceState.isDeafened
              ? 'bg-rose-900/60 text-rose-300 border border-rose-700/60'
              : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
          }`}
          title={voiceState.isDeafened ? 'Audio Deafened (Click to Undeafen)' : 'Deafen Audio'}
        >
          {voiceState.isDeafened ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>

        {/* Proximity / Peer Count Pill */}
        <button
          onClick={() => {
            soundEngine.playClick();
            setIsExpanded(!isExpanded);
          }}
          className="flex items-center space-x-1 px-2 py-1 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700/70 text-slate-300 text-xs font-bold cursor-pointer"
          title="Toggle Proximity Diagnostics"
        >
          <Radio className="w-3.5 h-3.5 text-cyan-400" />
          <span className="tabular-nums">{audiblePeers.length}</span>
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Push-to-Talk On-Screen Button (Touch & Mouse Support) */}
      {voiceState.isMicActive && !voiceState.isMuted && voiceState.isPushToTalk && (
        <button
          onMouseDown={handlePttDown}
          onMouseUp={handlePttUp}
          onTouchStart={handlePttDown}
          onTouchEnd={handlePttUp}
          className={`mt-2 px-3.5 py-1.5 rounded-xl font-black text-[11px] tracking-wider uppercase border transition-all cursor-pointer shadow-lg ${
            pttHeld
              ? 'bg-emerald-600 text-white border-emerald-300 scale-95 shadow-[0_0_15px_rgba(16,185,129,0.5)]'
              : 'bg-slate-900/85 hover:bg-slate-800 text-emerald-400 border-emerald-500/40 hover:border-emerald-400'
          }`}
        >
          {pttHeld ? '● Transmitting [V]' : 'Hold [V] to Talk'}
        </button>
      )}

      {/* Mic Permission Banner if blocked */}
      {voiceState.micPermissionError && (
        <div
          onClick={handleToggleMic}
          className="mt-2 max-w-xs p-2.5 rounded-xl bg-amber-950/90 border border-amber-600/70 text-amber-200 text-xs flex items-center space-x-2 cursor-pointer shadow-lg animate-pulse"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-400" />
          <span>Mic access needed for proximity voice. Click to enable.</span>
        </div>
      )}

      {/* Expanded Diagnostics & Nearby Audio List */}
      {isExpanded && (
        <div className="mt-2 w-72 p-3 rounded-2xl bg-slate-900/95 backdrop-blur-md border border-slate-700 shadow-2xl text-xs space-y-2.5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="font-extrabold text-slate-200 uppercase tracking-wider text-[11px] flex items-center space-x-1.5">
              <Wifi className="w-3.5 h-3.5 text-cyan-400" />
              <span>Spatial Proximity Audio</span>
            </span>
            <button
              onClick={handleTogglePtt}
              className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 cursor-pointer"
            >
              Mode: {voiceState.isPushToTalk ? 'PTT' : 'Open'}
            </button>
          </div>

          {/* Meeting Mode Notice */}
          {isMeeting && (
            <div className="p-2 rounded-xl bg-cyan-950/80 border border-cyan-700/60 text-cyan-200 text-[11px] flex items-center space-x-2">
              <Radio className="w-3.5 h-3.5 flex-shrink-0 text-cyan-400" />
              <span>Emergency Meeting broadcast: all crewmates in full intercom audio.</span>
            </div>
          )}

          {/* Nearby Crewmates */}
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {audiblePeers.length === 0 ? (
              <div className="text-center py-3 text-slate-500 italic text-[11px]">
                No human crewmates within 18m audible radius
              </div>
            ) : (
              audiblePeers.map((peer) => {
                const pInfo = playersMap[peer.id];
                const colorConfig =
                  PLAYER_COLORS.find((c) => c.id === pInfo?.colorId) || PLAYER_COLORS[0];
                const name = pInfo?.name || peer.id.slice(0, 5);

                return (
                  <div
                    key={peer.id}
                    className={`flex items-center justify-between p-2 rounded-xl border transition-all ${
                      peer.isSpeaking
                        ? 'bg-emerald-950/60 border-emerald-500/60 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                        : 'bg-slate-800/60 border-slate-700/50'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <div
                        className="w-3.5 h-3.5 rounded-full flex-shrink-0 border border-white/20"
                        style={{ backgroundColor: colorConfig.hex }}
                      />
                      <span className="font-bold text-slate-200 truncate">{name}</span>
                    </div>

                    <div className="flex items-center space-x-2 flex-shrink-0 text-[10px] tabular-nums">
                      {peer.isOccluded && !isMeeting && (
                        <span
                          className="px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 font-semibold flex items-center space-x-1"
                          title="Occluded by bulkhead steel wall (lowpass filtered 650Hz, 35% vol)"
                        >
                          <ShieldAlert className="w-2.5 h-2.5" />
                          <span>WALL</span>
                        </span>
                      )}
                      <span className="text-slate-400">{peer.distance}m</span>
                      <span
                        className={`font-black ${
                          peer.volumePct > 50
                            ? 'text-emerald-400'
                            : peer.volumePct > 0
                            ? 'text-cyan-400'
                            : 'text-slate-500'
                        }`}
                      >
                        {peer.volumePct}%
                      </span>
                      {peer.isSpeaking && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-slate-800 pt-1.5 text-[10px] text-slate-500 flex justify-between">
            <span>Falloff: &le;3.5m 100% &bull; &gt;18m 0%</span>
            <span>Wall: 650Hz lowpass</span>
          </div>
        </div>
      )}
    </div>
  );
};
