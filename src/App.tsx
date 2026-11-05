/**
 * Impostor Protocol - Main Application Component
 * Controls transitions between Main Menu, 3D Dropship Lobby, and 3D Spaceship Match View.
 */

import React, { useEffect, useState } from 'react';
import { GAME_STATES } from '../shared/constants';
import { LobbyData } from '../shared/events';
import { ConnectionState, net } from './net';
import { GameView } from './ui/gameView';
import { LobbyView } from './ui/lobby';
import { MainMenu } from './ui/menu';

export default function App() {
  const [currentLobby, setCurrentLobby] = useState<LobbyData | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [initialJoinCode, setInitialJoinCode] = useState<string>('');
  const [connectionState, setConnectionState] = useState<ConnectionState>(net.getConnectionState());
  const [connectionLost, setConnectionLost] = useState(false);

  useEffect(() => {
    const unsubConnection = net.onConnectionState((state) => {
      setConnectionState(state);
      if (state === 'reconnecting' || state === 'offline') setConnectionLost(true);
    });
    // 1. Initialize Network Client
    net.init();

    // 2. Parse invite link (?join=ABCDE)
    const params = new URLSearchParams(window.location.search);
    const joinParam = params.get('join');
    if (joinParam && joinParam.length === 5) {
      setInitialJoinCode(joinParam.toUpperCase());
    }

    // 3. Listen to authoritative lobby state
    const unsubLobby = net.onLobbyState((lobby) => {
      setCurrentLobby(lobby);
      if (lobby) setConnectionLost(false);
      if (lobby && lobby.state === GAME_STATES.PLAYING) {
        setIsPlaying(true);
      } else if (!lobby || lobby.state === GAME_STATES.LOBBY) {
        setIsPlaying(false);
      }
    });

    // 4. Listen to Game Started event
    const unsubGameStarted = net.onGameStarted(() => {
      setIsPlaying(true);
    });

    return () => {
      unsubLobby();
      unsubGameStarted();
      unsubConnection();
    };
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans">
      {isPlaying && currentLobby ? (
        <GameView
          settings={currentLobby.settings}
          onLeave={() => {
            setIsPlaying(false);
            setCurrentLobby(null);
          }}
        />
      ) : currentLobby ? (
        <LobbyView
          onLeave={() => {
            setIsPlaying(false);
            setCurrentLobby(null);
          }}
        />
      ) : (
        <MainMenu onLobbyJoined={() => {}} initialJoinCode={initialJoinCode} />
      )}
      {!currentLobby && (connectionState !== 'connected' || connectionLost) && (
        <div role="status" aria-live="polite" className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%_-_2rem)] max-w-md rounded-xl border border-slate-600/60 bg-slate-950/95 px-4 py-3 shadow-xl flex items-center justify-between gap-3 text-sm text-slate-200">
          <span>
            {connectionState === 'connecting' && 'Connecting to the ship server…'}
            {connectionState === 'reconnecting' && 'Connection lost. Reconnecting to the ship server…'}
            {connectionState === 'offline' && 'The ship server is unavailable. Try connecting again.'}
            {connectionState === 'connected' && 'Connection restored. Create or join a lobby to continue.'}
          </span>
          {connectionState === 'offline' && (
            <button onClick={() => net.retryConnection()} className="shrink-0 rounded-lg px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold cursor-pointer focus-visible:outline-2 focus-visible:outline-cyan-200">Retry</button>
          )}
          {connectionState === 'connected' && (
            <button onClick={() => setConnectionLost(false)} className="shrink-0 rounded-lg px-2 py-2 text-slate-400 hover:text-white cursor-pointer focus-visible:outline-2 focus-visible:outline-cyan-200" aria-label="Dismiss connection message">Dismiss</button>
          )}
        </div>
      )}
    </main>
  );
}
