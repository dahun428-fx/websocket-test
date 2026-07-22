import { promises as fs } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

import { createAuthHttpHandler, type AuthHttpHandlerOptions } from "./auth/authHttpHandler";
import { attachChatRuntime, type ChatRuntime } from "./chat/chatRuntime";
import { openDatabase, type DatabaseConnection } from "./database/database";
import { createMessageRepository } from "./repositories/messageRepository";
import { createUserRepository } from "./repositories/userRepository";
import { createAuthService } from "./service/authService";
import { createRefreshTokenRepository } from "./repositories/refreshTokenRepository";

const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_WEBSOCKET_MAX_PAYLOAD_BYTES = 16 * 1024;

export interface ApplicationOptions {
  databasePath: string;
  host?: string;
  authHttp?: AuthHttpHandlerOptions;
  heartbeatIntervalMs?: number;
  websocketMaxPayloadBytes?: number;
  publicIndexPath?: string;
}

export interface Application {
  server: http.Server;
  start(port?: number): Promise<number>;
  stop(): Promise<void>;
}

function sendJson(response: http.ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
  });
  response.end(JSON.stringify(payload));
}

export async function createApplication(options: ApplicationOptions): Promise<Application> {
  const database: DatabaseConnection = await openDatabase(options.databasePath);
  const userRepository = createUserRepository(database);
  const refreshTokenRepository = createRefreshTokenRepository(database);
  const messageRepository = createMessageRepository(database);
  const authService = createAuthService(userRepository, refreshTokenRepository);
  const authHandler = createAuthHttpHandler(authService, options.authHttp);
  const publicIndexPath = options.publicIndexPath
    ?? path.join(__dirname, "..", "public", "index.html");

  const server = http.createServer((request, response) => {
    void (async () => {
      if (await authHandler(request, response)) return;

      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      if (request.method === "GET" && url.pathname === "/") {
        const data = await fs.readFile(publicIndexPath);
        response.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:",
          "X-Content-Type-Options": "nosniff",
          "X-Frame-Options": "DENY",
          "Referrer-Policy": "no-referrer",
        });
        response.end(data);
        return;
      }

      sendJson(response, 404, { message: "요청한 경로를 찾을 수 없습니다." });
    })().catch((error) => {
      console.error("HTTP 요청 처리 오류:", error);
      if (!response.headersSent) {
        sendJson(response, 500, { message: "서버 내부 오류가 발생했습니다." });
      } else {
        response.destroy(error instanceof Error ? error : undefined);
      }
    });
  });

  let chatRuntime: ChatRuntime | null = null;
  let stopped = false;
  let stopPromise: Promise<void> | null = null;

  async function start(port = 0): Promise<number> {
    if (stopped) throw new Error("종료된 애플리케이션은 다시 시작할 수 없습니다.");
    if (server.listening) return (server.address() as AddressInfo).port;

    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => {
          server.off("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          server.off("error", onError);
          resolve();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, options.host ?? "127.0.0.1");
      });
      chatRuntime = attachChatRuntime(server, {
        messageRepository,
        heartbeatIntervalMs: options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS,
        maxPayloadBytes: options.websocketMaxPayloadBytes ?? DEFAULT_WEBSOCKET_MAX_PAYLOAD_BYTES,
      });
      return (server.address() as AddressInfo).port;
    } catch (error) {
      await stop();
      throw error;
    }
  }

  function stop(): Promise<void> {
    if (stopPromise) return stopPromise;

    stopPromise = (async () => {
      const errors: unknown[] = [];
      try {
        await chatRuntime?.close();
      } catch (error) {
        errors.push(error);
      }
      if (server.listening) {
        try {
          await new Promise<void>((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
          });
        } catch (error) {
          errors.push(error);
        }
      }
      try {
        await database.close();
      } catch (error) {
        errors.push(error);
      }
      stopped = true;

      if (errors.length > 0) {
        throw new AggregateError(errors, "애플리케이션 종료 중 오류가 발생했습니다.");
      }
    })();

    return stopPromise;
  }

  return { server, start, stop };
}
