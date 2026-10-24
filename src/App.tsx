/**
 * Impostor Protocol - Main Application Component
 * Controls transitions between Main Menu, 3D Dropship Lobby, and 3D Spaceship Match View.
 */

import React, { useEffect, useState } from 'react';
import { GAME_STATES } from '../shared/constants';
import { LobbyData } from '../shared/events';
import { net } from './net';
import { GameView } from './ui/gameView';
import { LobbyView } from './ui/lobby';
import { MainMenu } from './ui/menu';

export default function App() {
  const [currentLobby, setCurrentLobby] = useState<LobbyData | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [initialJoinCode, setInitialJoinCode] = useState<string>('');

  useEffect(() => {
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
    };
  }, []);

  return (
    <main className="w-screen h-screen overflow-hidden bg-slate-950 font-sans">
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
    </main>
  );
}
