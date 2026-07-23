import http from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Logger } from "../logging/logger";
import type { AuthService } from "../service/authService";
import { createAuthHttpHandler } from "./authHttpHandler";

const handlerConfig = {
  maxBodyBytes: 256,
  loginRateLimit: { maxAttempts: 2, windowMs: 60_000 },
  refreshTokenCookie: { name: "refresh_token", maxAgeSeconds: Number.MAX_SAFE_INTEGER, secure: false },
};

function createAuthService(): AuthService {
  const authResult = {
    accessToken: "token",
    refreshToken: "refresh-token",
    refreshTokenExpiresAt: "2026-12-31T00:00:00.000Z",
    user: { userId: "valid", nickname: "neo" },
  };

  return {
    login: vi.fn(async (userId) => userId === "valid" ? authResult : null),
    signup: vi.fn(async (input) => ({
      success: true as const,
      data: {
        ...authResult,
        user: { userId: input.userId, nickname: input.nickname },
      },
    })),
    refresh: vi.fn(async (refreshToken) => refreshToken === "refresh-token" ? authResult : null),
    logout: vi.fn(async () => undefined),
  };
}

function createTestLogger() {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  } satisfies Logger;
  logger.child.mockReturnValue(logger);
  return logger;
}

describe("createAuthHttpHandler", () => {
  let server: http.Server;
  let baseUrl: string;
  let authService: AuthService;
  let logger: ReturnType<typeof createTestLogger>;

  beforeEach(async () => {
    authService = createAuthService();
    logger = createTestLogger();
    const handler = createAuthHttpHandler({ authService, config: handlerConfig });
    server = http.createServer((request, response) => {
      void handler(request, response, { requestId: "request-123", logger }).then((handled) => {
        if (!handled) {
          response.writeHead(404).end();
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("parses and validates signup JSON through the shared request path", async () => {
    const response = await fetch(`${baseUrl}/signup`, {
      method: "POST",
      body: JSON.stringify({ userId: "user-100", nickname: "neo", password: "test1234" }),
    });

    expect(response.status).toBe(201);
    expect(authService.signup).toHaveBeenCalledWith({
      userId: "user-100",
      nickname: "neo",
      password: "test1234",
    });
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    await expect(response.json()).resolves.not.toHaveProperty("refreshToken");
  });

  it("logs login outcomes without including the password", async () => {
    const successfulLogin = await fetch(`${baseUrl}/login`, {
      method: "POST",
      body: JSON.stringify({ userId: "valid", password: "test1234" }),
    });
    const failedLogin = await fetch(`${baseUrl}/login`, {
      method: "POST",
      body: JSON.stringify({ userId: "unknown", password: "never-log-this" }),
    });

    expect(successfulLogin.status).toBe(200);
    expect(failedLogin.status).toBe(401);
    expect(logger.info).toHaveBeenCalledWith("Login attempt", { userId: "valid" });
    expect(logger.info).toHaveBeenCalledWith("Login succeeded", { userId: "valid" });
    expect(logger.warn).toHaveBeenCalledWith("Login failed", {
      userId: "unknown",
      reason: "invalid_credentials",
    });
  });

  it("accepts a body at the byte limit and rejects one byte over it", async () => {
    const body = JSON.stringify({ userId: "valid", password: "test1234" });
    const handler = createAuthHttpHandler({
      authService,
      config: {
        ...handlerConfig,
        maxBodyBytes: Buffer.byteLength(body),
        loginRateLimit: { maxAttempts: 10, windowMs: 60_000 },
      },
    });
    server.removeAllListeners("request");
    server.on("request", (request, response) => void handler(request, response, { requestId: "request-123", logger }));

    const accepted = await fetch(`${baseUrl}/login`, { method: "POST", body });
    const rejected = await fetch(`${baseUrl}/login`, { method: "POST", body: `${body} ` });

    expect(accepted.status).toBe(200);
    expect(rejected.status).toBe(413);
  });

  it("rate limits repeated failed login attempts", async () => {
    const request = (userId: string) => fetch(`${baseUrl}/login`, {
      method: "POST",
      body: JSON.stringify({ userId, password: "wrong" }),
    });

    expect((await request("unknown-1")).status).toBe(401);
    expect((await request("unknown-2")).status).toBe(401);
    const limited = await request("unknown-3");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
  });

  it("does not reset the IP rate limit after a successful login", async () => {
    const request = (userId: string, password: string) => fetch(`${baseUrl}/login`, {
      method: "POST",
      body: JSON.stringify({ userId, password }),
    });

    expect((await request("unknown", "wrong")).status).toBe(401);
    expect((await request("valid", "correct")).status).toBe(200);
    expect((await request("another-unknown", "wrong")).status).toBe(429);
  });

  it("rotates the refresh cookie and returns only the access-token response", async () => {
    const response = await fetch(`${baseUrl}/refresh`, {
      method: "POST",
      headers: { Cookie: "refresh_token=refresh-token" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("refresh_token=refresh-token");
    await expect(response.json()).resolves.toEqual({
      accessToken: "token",
      user: { userId: "valid", nickname: "neo" },
    });
  });

  it("uses the configured refresh cookie name", async () => {
    const handler = createAuthHttpHandler({
      authService,
      config: {
        ...handlerConfig,
        refreshTokenCookie: { name: "session", maxAgeSeconds: 60, secure: false },
      },
    });
    server.removeAllListeners("request");
    server.on("request", (request, response) => void handler(request, response, { requestId: "request-123", logger }));

    const response = await fetch(`${baseUrl}/refresh`, {
      method: "POST",
      headers: { Cookie: "session=refresh-token" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("session=refresh-token");
  });

  it("revokes the refresh token and clears the cookie on logout", async () => {
    const response = await fetch(`${baseUrl}/logout`, {
      method: "POST",
      headers: { Cookie: "refresh_token=refresh-token" },
    });

    expect(response.status).toBe(204);
    expect(authService.logout).toHaveBeenCalledWith("refresh-token");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

});
