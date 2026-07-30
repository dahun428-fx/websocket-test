import WebSocket, { type WebSocketServer } from "ws";

import type { ChatWebSocket } from "../types/websocket";
import type { WebSocketConnection } from "./webSocketConnection";

export interface ConnectionRegistry {
  add(connection: WebSocketConnection): void;
  remove(connectionId: string): void;
  findById(connectionId: string): WebSocketConnection | null;
  findByRoomId(roomId: string): WebSocketConnection[];
  findByUserId(userId: string): WebSocketConnection[];
  list(): WebSocketConnection[];
  closeAll(): Promise<void>;
}

interface CreateConnectionRegistryOptions {
  webSocketServer?: WebSocketServer;
}

export function createConnectionRegistry(
  options: CreateConnectionRegistryOptions = {},
): ConnectionRegistry {
  const connections = new Map<string, WebSocketConnection>();

  if (options.webSocketServer) {
    for (const connection of options.webSocketServer.clients) {
      const socket = connection as ChatWebSocket;
      if (socket.connectionId) {
        connections.set(socket.connectionId, socket);
      }
    }
  }

  function list(): WebSocketConnection[] {
    return [...connections.values()];
  }

  return {
    add(connection) {
      connections.set(connection.connectionId, connection);
    },
    remove(connectionId) {
      connections.delete(connectionId);
    },
    findById(connectionId) {
      return connections.get(connectionId) ?? null;
    },
    findByRoomId(roomId) {
      return list().filter((connection) => (
        connection.readyState === WebSocket.OPEN &&
        connection.room_id === roomId
      ));
    },
    findByUserId(userId) {
      return list().filter((connection) => (
        connection.readyState === WebSocket.OPEN &&
        connection.userId === userId
      ));
    },
    list,
    async closeAll() {
      await Promise.all([...connections.values()].map(closeConnection));
      connections.clear();
    },
  };
}

async function closeConnection(connection: WebSocketConnection): Promise<void> {
  if (
    connection.readyState === WebSocket.CLOSED ||
    connection.readyState === WebSocket.CLOSING
  ) {
    return;
  }

  await new Promise<void>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const complete = () => {
      if (timer) clearTimeout(timer);
      resolve();
    };
    connection.once("close", complete);
    connection.close(1001, "Server is shutting down");
    timer = setTimeout(() => {
      connection.off("close", complete);
      connection.terminate();
      resolve();
    }, 1_000);
    timer.unref?.();
  });
}
