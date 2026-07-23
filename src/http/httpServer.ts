import { promises as fs } from "node:fs";
import http from "node:http";

import type { Logger } from "../logging/logger";
import { createRequestContext } from "./requestContext";
import type { HttpHandler } from "./httpHandlerContext";

export interface CreateHttpServerOptions {
  authHandler: HttpHandler;
  logger: Logger;
  publicIndexPath: string;
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

export function createHttpServer(options: CreateHttpServerOptions): http.Server {
  return http.createServer((request, response) => {
    void (async () => {
      const context = createRequestContext(request);
      const requestLogger = options.logger.child({
        requestId: context.requestId,
        method: context.method,
        path: context.path,
      });

      response.setHeader("X-Request-ID", context.requestId);
      requestLogger.info("HTTP request started");

      try {
        if (await options.authHandler(request, response, {
          requestId: context.requestId,
          logger: requestLogger,
        })) return;

        if (request.method === "GET" && context.path === "/") {
          const data = await fs.readFile(options.publicIndexPath);
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
      } catch (error) {
        requestLogger.error("Unhandled HTTP request error", { error });
        if (!response.headersSent) {
          sendJson(response, 500, { message: "서버 내부 오류가 발생했습니다." });
        } else if (!response.writableEnded) {
          response.destroy(error instanceof Error ? error : undefined);
        }
      } finally {
        requestLogger.info("HTTP request completed", {
          statusCode: response.statusCode,
          durationMs: Math.round((performance.now() - context.startedAt) * 100) / 100,
        });
      }
    })();
  });
}
