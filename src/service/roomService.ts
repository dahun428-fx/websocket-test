import WebSocket, { WebSocketServer } from "ws";

import type { ServerMessage } from "../types/messages";
import type { ChatWebSocket } from "../types/websocket";

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
  webSocketServer: WebSocketServer;
}

function createRoomService(options: CreateRoomServiceOptions): RoomService {
  const wss = options.webSocketServer;
  if (!wss || !wss.clients) {
    throw new Error("createRoomService에는 WebSocketServer 인스턴스가 필요합니다.");
  }

  function getUserCount(roomId: string): number {
    const userIds = new Set<string>();

    wss.clients.forEach((client) => {
      const ws = client as ChatWebSocket;
      const isOpen = ws.readyState === WebSocket.OPEN;
      const isSameRoom = ws.room_id === roomId;

      if (isOpen && isSameRoom && ws.userId) {
        userIds.add(ws.userId);
      }
    });

    return userIds.size;
  }

  function broadcastToRoom(roomId: string, payload: ServerMessage): number {
    if (!roomId) {
      return 0;
    }

    const json = JSON.stringify(payload);
    let sentCount = 0;

    wss.clients.forEach((client) => {
      const chatClient = client as ChatWebSocket;
      const isOpen = chatClient.readyState === WebSocket.OPEN;
      const isSameRoom = chatClient.room_id === roomId;

      if (!isOpen || !isSameRoom) {
        return;
      }

      chatClient.send(json);
      sentCount += 1;
    });

    return sentCount;
  }

  function getConnectionCount(roomId: string): number {
    if (!roomId) {
      return 0;
    }

    let count = 0;

    wss.clients.forEach((client) => {
      const chatClient = client as ChatWebSocket;

      if (
        chatClient.readyState === WebSocket.OPEN &&
        chatClient.room_id === roomId
      ) {
        count += 1;
      }
    });

    return count;
  }

  function getClients(roomId: string): ChatWebSocket[] {
    if (!roomId) {
      return [];
    }

    return [...wss.clients].filter((client): client is ChatWebSocket => {
      const chatClient = client as ChatWebSocket;

      return (
        chatClient.readyState === WebSocket.OPEN &&
        chatClient.room_id === roomId
      );
    });
  }

  function getUserConnections(userId: string): ChatWebSocket[] {
    return [...wss.clients].filter((client): client is ChatWebSocket => {
      const chatClient = client as ChatWebSocket;

      return (
        chatClient.readyState === WebSocket.OPEN &&
        chatClient.userId === userId
      );
    });
  }

  function sendToUser(userId: string, payload: ServerMessage): number {
    const clients = getUserConnections(userId);
    const json = JSON.stringify(payload);

    clients.forEach((client) => {
      client.send(json);
    });

    return clients.length;
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
