/**
 * Impostor Protocol - Server Index
 * Express app & Socket.IO initialization with event routing
 */

import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { LobbyManager } from './lobbyManager';
import { EVENTS } from '../shared/events';

export function createGameServer() {
  const app = express();
  const server = http.createServer(app);

  const io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  const lobbyManager = new LobbyManager(io);

  io.on('connection', (socket) => {
    // Lobby creation & joining
    socket.on(EVENTS.CREATE_LOBBY, (data: { playerName: string; isPrivate?: boolean }) => {
      lobbyManager.createLobby(socket, data?.playerName || 'Crewmate', data?.isPrivate || false);
    });

    socket.on(EVENTS.JOIN_LOBBY, (data: { code: string; playerName: string }) => {
      lobbyManager.joinLobby(socket, data?.code || '', data?.playerName || 'Crewmate');
    });

    socket.on(EVENTS.LEAVE_LOBBY, () => {
      lobbyManager.leaveLobby(socket);
    });

    socket.on(EVENTS.SET_COLOR, (data: { colorId: string }) => {
      lobbyManager.setColor(socket, data?.colorId);
    });

    socket.on(EVENTS.SET_HAT, (data: { hatId: string }) => {
      lobbyManager.setHat(socket, data?.hatId);
    });

    socket.on(EVENTS.UPDATE_SETTINGS, (data: { settings: any }) => {
      lobbyManager.updateSettings(socket, data?.settings || {});
    });

    socket.on(EVENTS.KICK_PLAYER, (data: { targetSocketId: string }) => {
      lobbyManager.kickPlayer(socket, data?.targetSocketId);
    });

    socket.on(EVENTS.START_GAME, () => {
      lobbyManager.startGame(socket, false);
    });

    socket.on(EVENTS.START_TEST_GAME, () => {
      lobbyManager.startGame(socket, true);
    });

    socket.on(EVENTS.LOBBY_INPUT, (data: { x: number; z: number; rotation: number; isMoving: boolean }) => {
      lobbyManager.handleLobbyInput(socket, data);
    });

    socket.on(
      EVENTS.PLAYER_INPUT,
      (data: { seq: number; x: number; z: number; rotation: number; isMoving: boolean }) => {
        lobbyManager.handlePlayerInput(socket, data);
      }
    );

    // ---- In-game actions (all validated again by the GameRoom) ----
    const room = () => lobbyManager.gameRoomFor(socket);
    socket.on(EVENTS.USE_TASK, (d: { taskId: string }) => room()?.startTask(socket.id, String(d?.taskId)));
    socket.on(EVENTS.COMPLETE_TASK_STEP, (d: { taskId: string }) => room()?.completeTaskStep(socket.id, String(d?.taskId)));
    socket.on('cancelTask', () => room()?.cancelTask(socket.id));
    socket.on(EVENTS.KILL_ATTEMPT, (d: { targetId: string }) => room()?.killAttempt(socket.id, String(d?.targetId)));
    socket.on(EVENTS.REPORT_BODY, (d: { bodyId: string }) => room()?.reportBody(socket.id, String(d?.bodyId)));
    socket.on(EVENTS.CALL_EMERGENCY, () => room()?.callEmergency(socket.id));
    socket.on(EVENTS.VENT_ENTER, (d: { ventId: string }) => room()?.ventEnter(socket.id, String(d?.ventId)));
    socket.on(EVENTS.VENT_MOVE, (d: { ventId: string }) => room()?.ventMove(socket.id, String(d?.ventId)));
    socket.on(EVENTS.VENT_EXIT, () => room()?.ventExit(socket.id));
    socket.on(EVENTS.CAST_VOTE, (d: { targetId: string }) => room()?.castVote(socket.id, String(d?.targetId)));
    socket.on(EVENTS.SABOTAGE, (d: { type: string; room?: string }) => room()?.sabotage(socket.id, d));
    socket.on(EVENTS.FIX_SABOTAGE, (d: { type: string; switchIndex?: number; pad?: string }) => room()?.fixSabotage(socket.id, d));
    socket.on(EVENTS.CHAT_MESSAGE, (d: { text: string; scope?: any }) => {
      const activeRoom = room();
      if (activeRoom) {
        activeRoom.chat(socket.id, String(d?.text ?? ''));
      } else {
        lobbyManager.handleChatMessage(socket, d);
      }
    });

    // ---- WebRTC Proximity Voice Signaling ----
    socket.on(EVENTS.RTC_SIGNAL, (data: { targetId: string; signal: any }) => {
      if (data?.targetId && data?.signal) {
        io.to(data.targetId).emit(EVENTS.RTC_SIGNAL, {
          senderId: socket.id,
          signal: data.signal,
        });
      }
    });

    socket.on(EVENTS.RTC_INIT_PEER, (data: { targetId: string }) => {
      if (data?.targetId) {
        io.to(data.targetId).emit(EVENTS.RTC_INIT_PEER, {
          senderId: socket.id,
        });
      }
    });

    socket.on(EVENTS.VOICE_SPEAKING_UPDATE, (data: { isSpeaking: boolean }) => {
      const lobby = lobbyManager.getLobbyBySocket(socket);
      if (lobby) {
        socket.to(lobby.code).emit(EVENTS.VOICE_SPEAKING_UPDATE, {
          playerId: socket.id,
          isSpeaking: !!data?.isSpeaking,
        });
      }
    });

    socket.on('disconnect', () => {
      lobbyManager.leaveLobby(socket);
    });
  });

  return { app, server, io, lobbyManager };
}
