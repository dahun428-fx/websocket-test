import WebSocket, { type WebSocketServer } from "ws";

import type { Logger } from "../logging/logger";
import type { ChatWebSocket } from "../types/websocket";

const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
type HeartbeatEvent = "ping" | "pong";

export function resolveHeartbeatIntervalMs(value: string | number | undefined): number {
  const intervalMs = Number(value);

  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    return DEFAULT_HEARTBEAT_INTERVAL_MS;
  }

  return intervalMs;
}

export function logHeartbeat(
  event: HeartbeatEvent,
  ws: ChatWebSocket,
  logger: Logger,
  debug: boolean,
): void {
  if (!debug) {
    return;
  }

  logger.debug(event === "ping" ? "Heartbeat ping sent" : "Heartbeat pong received", {
    connectionId: ws.connectionId,
    nickname: ws.nickname,
    roomId: ws.room_id,
  });
}

export function runHeartbeat(wss: WebSocketServer, logger: Logger, debug: boolean): void {
  wss.clients.forEach((client) => {
    const ws = client as ChatWebSocket;

    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }

    if (!ws.isAlive) {
      logger.warn("Heartbeat timed out", {
        connectionId: ws.connectionId,
        nickname: ws.nickname,
        roomId: ws.room_id,
      });
      ws.terminate();
      return;
    }

    ws.isAlive = false;
    logHeartbeat("ping", ws, logger, debug);
    ws.ping();
  });
}

export function startHeartbeat(
  wss: WebSocketServer,
  intervalMs: number,
  logger: Logger,
  debug: boolean,
): NodeJS.Timeout {
  return setInterval(() => runHeartbeat(wss, logger, debug), intervalMs);
}
