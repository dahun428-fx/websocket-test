import type { IncomingMessage, ServerResponse } from "node:http";

import type { z } from "zod";

import { loginRequestSchema } from "../schemas/loginSchema";
import { signupRequestSchema } from "../schemas/signupSchema";
import type { AuthService } from "../service/authService";

const DEFAULT_MAX_BODY_BYTES = 16 * 1024;

class BodyTooLargeError extends Error {}

interface LoginRateLimitOptions {
  maxAttempts: number;
  windowMs: number;
}

export interface AuthHttpHandlerOptions {
  maxBodyBytes?: number;
  loginRateLimit?: LoginRateLimitOptions;
  now?: () => number;
}

interface RateLimitEntry {
  attempts: number;
  resetAt: number;
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
  headers: Record<string, string> = {},
): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

function readRequestBody(
  request: IncomingMessage,
  maxBodyBytes: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const contentLength = Number(request.headers["content-length"]);
    if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
      request.resume();
      reject(new BodyTooLargeError());
      return;
    }

    let body = "";
    let bytes = 0;
    let exceeded = false;

    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      if (exceeded) return;
      bytes += Buffer.byteLength(chunk);
      if (bytes > maxBodyBytes) {
        exceeded = true;
        reject(new BodyTooLargeError());
        return;
      }
      body += chunk;
    });
    request.on("end", () => {
      if (!exceeded) resolve(body);
    });
    request.on("error", reject);
  });
}

async function parseJsonBody<T>(
  request: IncomingMessage,
  response: ServerResponse,
  schema: z.ZodType<T>,
  maxBodyBytes: number,
): Promise<T | null> {
  let body: unknown;

  try {
    const rawBody = await readRequestBody(request, maxBodyBytes);
    body = JSON.parse(rawBody);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      sendJson(response, 413, { message: "요청 본문이 너무 큽니다." });
    } else {
      sendJson(response, 400, { message: "올바른 JSON 형식이 아닙니다." });
    }
    return null;
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    sendJson(response, 400, {
      message: result.error.issues[0]?.message ?? "올바르지 않은 요청입니다.",
    });
    return null;
  }
  return result.data;
}

function createLoginLimiter(
  options: LoginRateLimitOptions,
  now: () => number,
) {
  const entries = new Map<string, RateLimitEntry>();

  return {
    consume(key: string): number | null {
      const currentTime = now();
      const current = entries.get(key);
      const entry = !current || current.resetAt <= currentTime
        ? { attempts: 0, resetAt: currentTime + options.windowMs }
        : current;

      if (entry.attempts >= options.maxAttempts) {
        return Math.max(1, Math.ceil((entry.resetAt - currentTime) / 1000));
      }

      entry.attempts += 1;
      entries.set(key, entry);
      return null;
    },
    reset(key: string): void {
      entries.delete(key);
    },
  };
}

export function createAuthHttpHandler(
  authService: AuthService,
  options: AuthHttpHandlerOptions = {},
) {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const limiter = createLoginLimiter(
    options.loginRateLimit ?? { maxAttempts: 10, windowMs: 15 * 60_000 },
    options.now ?? Date.now,
  );

  return async function handleAuthRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<boolean> {
    const url = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? "localhost"}`,
    );

    if (url.pathname !== "/login" && url.pathname !== "/signup") {
      return false;
    }

    if (request.method !== "POST") {
      sendJson(response, 405, { message: "POST 요청만 허용됩니다." }, { Allow: "POST" });
      return true;
    }

    if (url.pathname === "/login") {
      const input = await parseJsonBody(request, response, loginRequestSchema, maxBodyBytes);
      if (!input) return true;

      const remoteAddress = request.socket.remoteAddress ?? "unknown";
      const ipKey = `ip:${remoteAddress}`;
      const accountKey = `account:${remoteAddress}:${input.userId}`;
      const retryAfter = limiter.consume(ipKey) ?? limiter.consume(accountKey);
      if (retryAfter !== null) {
        sendJson(
          response,
          429,
          { message: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요." },
          { "Retry-After": String(retryAfter) },
        );
        return true;
      }

      const result = await authService.login(input.userId, input.password);
      if (!result) {
        sendJson(response, 401, { message: "사용자 ID 또는 비밀번호가 올바르지 않습니다." });
        return true;
      }

      limiter.reset(accountKey);
      sendJson(response, 200, result);
      return true;
    }

    const input = await parseJsonBody(request, response, signupRequestSchema, maxBodyBytes);
    if (!input) return true;

    const result = await authService.signup(input);
    if (!result.success) {
      sendJson(response, 409, { message: "이미 사용 중인 사용자 ID입니다." });
      return true;
    }

    sendJson(response, 201, result.data);
    return true;
  };
}
