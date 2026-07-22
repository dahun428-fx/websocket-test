import type { IncomingMessage, ServerResponse } from "node:http";

import type { z } from "zod";

import { loginRequestSchema } from "../schemas/loginSchema";
import { signupRequestSchema } from "../schemas/signupSchema";
import type { AuthService } from "../service/authService";
import { getCookie } from "../http/cookieUtils";
import type { HttpHandlerContext } from "../http/httpHandlerContext";

class BodyTooLargeError extends Error { }

export interface LoginRateLimitOptions {
  maxAttempts: number;
  windowMs: number;
}

export interface RefreshTokenCookieOptions {
  name: string;
  maxAgeSeconds: number;
  secure: boolean;
}

export interface AuthHttpHandlerConfig {
  maxBodyBytes: number;
  loginRateLimit: LoginRateLimitOptions;
  refreshTokenCookie: RefreshTokenCookieOptions;
}

export interface AuthHttpHandlerRuntimeOptions {
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


function createRefreshTokenCookie(
  refreshToken: string,
  expiresAt: string,
  options: RefreshTokenCookieOptions,
): string {
  const secure = options.secure ? "; Secure" : "";
  const tokenMaxAge = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1_000));
  const maxAge = Math.min(tokenMaxAge, options.maxAgeSeconds);
  return [
    `${options.name}=${encodeURIComponent(refreshToken)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Strict",
    `Max-Age=${maxAge}`,
    secure,
  ]
    .filter(Boolean)
    .join("; ")
}

function clearRefreshTokenCookie(options: RefreshTokenCookieOptions): string {
  const secure = options.secure ? "; Secure" : "";
  return [
    `${options.name}=`,
    "HttpOnly",
    "Path=/",
    "SameSite=Strict",
    "Max-Age=0",
    secure,
  ].join("; ")
}

export function createAuthHttpHandler(
  authService: AuthService,
  config: AuthHttpHandlerConfig,
  options: AuthHttpHandlerRuntimeOptions = {},
) {
  const limiter = createLoginLimiter(
    config.loginRateLimit,
    options.now ?? Date.now,
  );
  const { maxBodyBytes, refreshTokenCookie } = config;

  return async function handleAuthRequest(
    request: IncomingMessage,
    response: ServerResponse,
    context: HttpHandlerContext,
  ): Promise<boolean> {
    const url = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? "localhost"}`,
    );

    if (!["/login", "/signup", "/refresh", "/logout"].includes(url.pathname)) {
      return false;
    }

    if (request.method !== "POST") {
      sendJson(response, 405, { message: "POST 요청만 허용됩니다." }, { Allow: "POST" });
      return true;
    }

    if (url.pathname === "/login") {
      const input = await parseJsonBody(request, response, loginRequestSchema, maxBodyBytes);
      if (!input) return true;

      context.logger.info("Login attempt", { userId: input.userId });

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
        context.logger.warn("Login failed", {
          userId: input.userId,
          reason: "invalid_credentials",
        });
        sendJson(response, 401, { message: "사용자 ID 또는 비밀번호가 올바르지 않습니다." });
        return true;
      }

      limiter.reset(accountKey);

      context.logger.info("Login succeeded", { userId: result.user.userId });

      const { refreshToken, refreshTokenExpiresAt, ...responseBody } = result;

      sendJson(response, 200, responseBody, {
        "Cache-Control": "no-store",
        "Set-Cookie": createRefreshTokenCookie(refreshToken, refreshTokenExpiresAt, refreshTokenCookie),
      });
      return true;
    }

    if (url.pathname === "/refresh") {
      const refreshToken = getCookie(request, refreshTokenCookie.name);
      if (!refreshToken) {
        sendJson(response, 401, { message: "Refresh Token이 없습니다." })
        return true;
      }

      const result = await authService.refresh(refreshToken)
      if (!result) {
        sendJson(response, 401, { message: "Refresh Token이 유효하지 않습니다." }, { "Cache-Control": "no-store", "Set-Cookie": clearRefreshTokenCookie(refreshTokenCookie) });
        return true;
      }

      const { refreshToken: nextRefreshToken, refreshTokenExpiresAt, ...responseBody } = result;
      sendJson(response, 200, responseBody, {
        "Cache-Control": "no-store",
        "Set-Cookie": createRefreshTokenCookie(nextRefreshToken, refreshTokenExpiresAt, refreshTokenCookie),
      });
      return true;
    }

    if (url.pathname === "/logout") {
      const refreshToken = getCookie(request, refreshTokenCookie.name);
      if (refreshToken) await authService.logout(refreshToken);
      sendJson(response, 204, undefined, {
        "Cache-Control": "no-store",
        "Set-Cookie": clearRefreshTokenCookie(refreshTokenCookie),
      });
      return true;
    }

    const input = await parseJsonBody(request, response, signupRequestSchema, maxBodyBytes);
    if (!input) return true;

    const result = await authService.signup(input);
    if (!result.success) {
      sendJson(response, 409, { message: "이미 사용 중인 사용자 ID입니다." });
      return true;
    }

    const { refreshToken, refreshTokenExpiresAt, ...responseBody } = result.data;
    sendJson(response, 201, responseBody, {
      "Cache-Control": "no-store",
      "Set-Cookie": createRefreshTokenCookie(refreshToken, refreshTokenExpiresAt, refreshTokenCookie),
    });
    return true;
  };
}
