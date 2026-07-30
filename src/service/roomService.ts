import type { WebSocketServer } from "ws";

import type { ServerMessage } from "../types/messages";
import type { ChatWebSocket } from "../types/websocket";
import {
  createBroadcastService,
  type BroadcastService,
} from "../websocket/broadcastService";
import {
  createConnectionRegistry,
  type ConnectionRegistry,
} from "../websocket/connectionRegistry";

export interface RoomService {
  join(ws: ChatWebSocket, roomId: string): string;
  leave(ws: ChatWebSocket | null | undefined): string | null;
  getClients(roomId: string): ChatWebSocket[];
  getConnectionCount(roomId: string): number;
  getUserCount(roomId: string): number;
  getUserConnections(userId: string): ChatWebSocket[];
  sendToUser(userId: string, payload: ServerMessage): number;
  broadcastToRoom(roomId: string, payload: ServerMessage): number;
}

export interface CreateRoomServiceOptions {
  connectionRegistry?: ConnectionRegistry;
  broadcastService?: BroadcastService;
  webSocketServer?: WebSocketServer;
}

function createRoomService(options: CreateRoomServiceOptions): RoomService {
  const connectionRegistry = options.connectionRegistry ??
    createConnectionRegistry({ webSocketServer: options.webSocketServer });
  const broadcastService = options.broadcastService ??
    createBroadcastService(connectionRegistry);

  function getUserCount(roomId: string): number {
    const userIds = new Set<string>();

    connectionRegistry.findByRoomId(roomId).forEach((ws) => {
      if (ws.userId) {
        userIds.add(ws.userId);
      }
    });

    return userIds.size;
  }

  function broadcastToRoom(roomId: string, payload: ServerMessage): number {
    if (!roomId) {
      return 0;
    }

    return broadcastService.toRoom(roomId, payload);
  }

  function getConnectionCount(roomId: string): number {
    if (!roomId) {
      return 0;
    }

    return connectionRegistry.findByRoomId(roomId).length;
  }

  function getClients(roomId: string): ChatWebSocket[] {
    if (!roomId) {
      return [];
    }

    return connectionRegistry.findByRoomId(roomId);
  }

  function getUserConnections(userId: string): ChatWebSocket[] {
    return connectionRegistry.findByUserId(userId);
  }

  function sendToUser(userId: string, payload: ServerMessage): number {
    return broadcastService.toUser(userId, payload);
  }

  function join(ws: ChatWebSocket, roomId: string): string {
    if (!ws) {
      throw new Error("WebSocket 연결이 필요합니다.");
    }

    if (typeof roomId !== "string") {
      throw new TypeError("roomId는 문자열이어야 합니다.");
    }

    const normalizedRoomId = roomId.trim();

    if (!normalizedRoomId) {
      throw new Error("roomId는 비어 있을 수 없습니다.");
    }

    ws.room_id = normalizedRoomId;

    return normalizedRoomId;
  }

  function leave(ws: ChatWebSocket | null | undefined): string | null {
    if (!ws) {
      return null;
    }

    const previousRoomId = ws.room_id;
    ws.room_id = null;

    return previousRoomId;
  }

  return {
    join,
    leave,
    getClients,
    getConnectionCount,
    getUserCount,
    getUserConnections,
    sendToUser,
    broadcastToRoom,
  };
}

export default createRoomService;
