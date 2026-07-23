import type http from "node:http";

import { WebSocketServer } from "ws";

export interface CreateWebSocketServerOptions {
  httpServer: http.Server;
  maxPayloadBytes: number;
}

export function createWebSocketServer(options: CreateWebSocketServerOptions): WebSocketServer {
  return new WebSocketServer({
    server: options.httpServer,
    maxPayload: options.maxPayloadBytes,
  });
}
