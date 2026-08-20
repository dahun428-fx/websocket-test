import WebSocket from "ws";

import type { ServerMessage } from "../types/messages";
import type { ConnectionRegistry } from "./connectionRegistry";
import { Metrics } from "../metrics/metrics";

export interface BroadcastService {
  toRoom(roomId: string, payload: ServerMessage): number;
  toUser(userId: string, payload: ServerMessage): number;
}

export interface CreateBroadcastServiceOptions {
  connectionRegistry: ConnectionRegistry;
  /** 주입되지 않으면 계측만 생략한다(테스트 등 계측이 불필요한 경로). */
  metrics?: Metrics;
}

export function createBroadcastService(
  options: CreateBroadcastServiceOptions
): BroadcastService {

  const { connectionRegistry, metrics } = options

  function send(
    connections: ReturnType<ConnectionRegistry["list"]>,
    payload: ServerMessage,
  ): number {
    const serialized = JSON.stringify(payload);
    let scheduledCount = 0;

    for (const connection of connections) {
      if (connection.readyState !== WebSocket.OPEN) continue;
      connection.send(serialized, (error) => {
        if (error) {
          metrics?.webSocketMessageSendFailed("broadcast")
          return;
        }
        metrics?.webSocketMessageSent("broadcast")
      });
      scheduledCount += 1;
    }
    return scheduledCount;
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
