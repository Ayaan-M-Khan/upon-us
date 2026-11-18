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
    // Every handler runs inside try/catch: a malformed payload from one client must never throw out of
    // the socket's event emitter, which would crash the whole server process for every lobby.
    const on = <T extends unknown[]>(event: string, handler: (...args: T) => void) => {
      socket.on(event, (...args: unknown[]) => {
        try {
          handler(...(args as T));
        } catch (err) {
          console.error(`[Impostor Protocol] Error handling "${event}" from ${socket.id}:`, err);
        }
      });
    };

    // Lobby creation & joining
    on(EVENTS.CREATE_LOBBY, (data: { playerName: string; isPrivate?: boolean; hatId?: string; sessionId?: string }) => {
      lobbyManager.createLobby(socket, data?.playerName || 'Crewmate', data?.isPrivate === true, data?.hatId, data?.sessionId);
    });

    on(EVENTS.JOIN_LOBBY, (data: { code: string; playerName: string; hatId?: string; sessionId?: string }) => {
      lobbyManager.joinLobby(socket, data?.code || '', data?.playerName || 'Crewmate', data?.hatId, data?.sessionId);
    });

    on(EVENTS.REJOIN, (data: { sessionId?: string }) => {
      lobbyManager.rejoin(socket, data?.sessionId);
    });

    on(EVENTS.LEAVE_LOBBY, () => {
      lobbyManager.leaveLobby(socket);
    });

    on(EVENTS.SET_COLOR, (data: { colorId: string }) => {
      lobbyManager.setColor(socket, data?.colorId);
    });

    on(EVENTS.SET_HAT, (data: { hatId: string }) => {
      lobbyManager.setHat(socket, data?.hatId);
    });

    on(EVENTS.SET_READY, (data: { ready: boolean }) => {
      lobbyManager.setReady(socket, data?.ready === true);
    });

    on(EVENTS.UPDATE_SETTINGS, (data: { settings: any }) => {
      lobbyManager.updateSettings(socket, data?.settings || {});
    });

    on(EVENTS.KICK_PLAYER, (data: { targetSocketId: string }) => {
      lobbyManager.kickPlayer(socket, data?.targetSocketId);
    });

    on(EVENTS.START_GAME, () => {
      lobbyManager.startGame(socket, false);
    });

    on(EVENTS.START_TEST_GAME, () => {
      lobbyManager.startGame(socket, true);
    });

    on(EVENTS.LOBBY_INPUT, (data: { x: number; z: number; rotation: number; isMoving: boolean }) => {
      lobbyManager.handleLobbyInput(socket, data);
    });

    on(
      EVENTS.PLAYER_INPUT,
      (data: { seq: number; x: number; z: number; rotation: number; isMoving: boolean }) => {
        lobbyManager.handlePlayerInput(socket, data);
      }
    );

    // ---- In-game actions (all validated again by the GameRoom) ----
    const room = () => lobbyManager.gameRoomFor(socket);
    on(EVENTS.USE_TASK, (d: { taskId: string }) => room()?.startTask(socket.id, String(d?.taskId)));
    on(EVENTS.COMPLETE_TASK_STEP, (d: { taskId: string }) => room()?.completeTaskStep(socket.id, String(d?.taskId)));
    on('cancelTask', () => room()?.cancelTask(socket.id));
    on(EVENTS.KILL_ATTEMPT, (d: { targetId: string }) => room()?.killAttempt(socket.id, String(d?.targetId)));
    on(EVENTS.REPORT_BODY, (d: { bodyId: string }) => room()?.reportBody(socket.id, String(d?.bodyId)));
    on(EVENTS.CALL_EMERGENCY, () => room()?.callEmergency(socket.id));
    on(EVENTS.VENT_ENTER, (d: { ventId: string }) => room()?.ventEnter(socket.id, String(d?.ventId)));
    on(EVENTS.VENT_MOVE, (d: { ventId: string }) => room()?.ventMove(socket.id, String(d?.ventId)));
    on(EVENTS.VENT_EXIT, () => room()?.ventExit(socket.id));
    on(EVENTS.CAST_VOTE, (d: { targetId: string }) => room()?.castVote(socket.id, String(d?.targetId)));
    on(EVENTS.CHAT_MESSAGE, (d: { text: string }) => room()?.chat(socket.id, String(d?.text ?? '')));
    on(EVENTS.SABOTAGE, (d: { type: import('../shared/events').SabotageType; room?: string }) => room()?.triggerSabotage(socket.id, d?.type, d?.room));
    on(EVENTS.FIX_SABOTAGE, (d: { partId?: number; holding?: boolean }) => {
      if (typeof d?.holding === 'boolean' && typeof d.partId === 'number') {
        room()?.holdReactorScanner(socket.id, d.partId, d.holding);
      } else {
        room()?.fixSabotage(socket.id, d?.partId);
      }
    });

    on('disconnect', () => {
      lobbyManager.handleDisconnect(socket);
    });
  });

  return { app, server, io, lobbyManager };
}
