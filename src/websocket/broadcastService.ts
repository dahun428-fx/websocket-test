import WebSocket from "ws";

import type { ServerMessage } from "../types/messages";
import type { ConnectionRegistry } from "./connectionRegistry";

export interface BroadcastService {
  toRoom(roomId: string, payload: ServerMessage): number;
  toUser(userId: string, payload: ServerMessage): number;
}

export function createBroadcastService(
  connectionRegistry: ConnectionRegistry,
): BroadcastService {
  function send(
    connections: ReturnType<ConnectionRegistry["list"]>,
    payload: ServerMessage,
  ): number {
    const serialized = JSON.stringify(payload);
    let sentCount = 0;

    for (const connection of connections) {
      if (connection.readyState !== WebSocket.OPEN) continue;
      connection.send(serialized);
      sentCount += 1;
    }
    return sentCount;
  }

  return {
    toRoom(roomId, payload) {
      if (!roomId) return 0;
      return send(connectionRegistry.findByRoomId(roomId), payload);
    },
    toUser(userId, payload) {
      if (!userId) return 0;
      return send(connectionRegistry.findByUserId(userId), payload);
    },
  };
}
