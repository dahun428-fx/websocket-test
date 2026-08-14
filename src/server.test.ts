import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";

import { createApplication, type Application } from "./application";
import { hashPassword } from "./auth/passwordService";
import { openDatabase } from "./database/database";
import { createUserRepository } from "./repositories/userRepository";
import { createTestConfig } from "./test/createTestConfig";
import { createTestContainer } from "./test/createTestContainer";
import type { RateLimiter } from "./rateLimit/rateLimiter";

function createInMemoryRateLimiter(): RateLimiter {
  const entries = new Map<string, { current: number; resetAtMs: number }>();

  return {
    async consume(input) {
      const nowMs = Date.now();
      const previous = entries.get(input.key);
      const entry = !previous || previous.resetAtMs <= nowMs
        ? { current: 1, resetAtMs: nowMs + input.windowMs }
        : { ...previous, current: previous.current + 1 };
      entries.set(input.key, entry);
      const allowed = entry.current <= input.limit;
      const ttlMs = Math.max(entry.resetAtMs - nowMs, 0);

      return {
        allowed,
        limit: input.limit,
        current: entry.current,
        remaining: Math.max(input.limit - entry.current, 0),
        retryAfterMs: allowed ? 0 : ttlMs,
        resetAt: new Date(entry.resetAtMs).toISOString(),
      };
    },
    async reset(key) {
      entries.delete(key);
    },
  };
}

describe("Application", () => {
  let application: Application;
  let baseUrl: string;
  let testDirectory: string;

  beforeEach(async () => {
    testDirectory = await mkdtemp(path.join(os.tmpdir(), "websocket-test-"));
    const databasePath = path.join(testDirectory, "server-test.db");
    const database = await openDatabase(databasePath);
    await createUserRepository(database).create({
      id: "user-100",
      nickname: "neo",
      passwordHash: await hashPassword("test1234"),
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    await database.close();

    const config = createTestConfig(databasePath);
    config.rateLimit.maxAttempts = 5;
    application = createApplication(await createTestContainer(databasePath, {
      config,
      rateLimiter: createInMemoryRateLimiter(),
      websocketMaxPayloadBytes: 64,
    }));
    const port = await application.start();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await application.stop();
    await rm(testDirectory, { recursive: true, force: true });
  });

  it("returns an access token for valid login credentials", async () => {
    const response = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "user-100", password: "test1234" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      accessToken: expect.any(String),
      user: { userId: "user-100", nickname: "neo" },
    });
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("returns the request ID in the response headers", async () => {
    const response = await fetch(`${baseUrl}/missing`, {
      headers: { "X-Request-ID": "request-123" },
    });

    expect(response.headers.get("x-request-id")).toBe("request-123");
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "ROUTE_NOT_FOUND",
        requestId: "request-123",
      },
    });
  });

  it("separates liveness from readiness and reports disabled Redis", async () => {
    const live = await fetch(`${baseUrl}/health/live`);
    const ready = await fetch(`${baseUrl}/health/ready`);

    expect(live.status).toBe(200);
    await expect(live.json()).resolves.toEqual({ status: "alive" });
    expect(ready.status).toBe(200);
    await expect(ready.json()).resolves.toMatchObject({
      status: "ready",
      dependencies: {
        database: "up",
        redis: { status: "disabled" },
      },
    });
  });

  it("rotates refresh tokens and invalidates them on logout", async () => {
    const loginResponse = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "user-100", password: "test1234" }),
    });
    const firstCookie = loginResponse.headers.get("set-cookie");

    expect(firstCookie).toContain("refresh_token=");

    const refreshResponse = await fetch(`${baseUrl}/refresh`, {
      method: "POST",
      headers: { Cookie: firstCookie ?? "" },
    });
    const secondCookie = refreshResponse.headers.get("set-cookie");

    expect(refreshResponse.status).toBe(200);
    expect(secondCookie).toContain("refresh_token=");
    const reusedResponse = await fetch(`${baseUrl}/refresh`, {
      method: "POST",
      headers: {
        Cookie: firstCookie ?? "",
        "X-Request-ID": "reused-refresh",
      },
    });
    expect(reusedResponse.status).toBe(401);
    await expect(reusedResponse.json()).resolves.toMatchObject({
      error: {
        code: "REFRESH_TOKEN_REUSED",
        requestId: "reused-refresh",
      },
    });

    const logoutResponse = await fetch(`${baseUrl}/logout`, {
      method: "POST",
      headers: { Cookie: secondCookie ?? "" },
    });

    expect(logoutResponse.status).toBe(204);
    expect(logoutResponse.headers.get("set-cookie")).toContain("Max-Age=0");
    await expect(
      fetch(`${baseUrl}/refresh`, {
        method: "POST",
        headers: { Cookie: secondCookie ?? "" },
      }),
    ).resolves.toMatchObject({ status: 401 });
  });

  it("creates a user from a JSON signup request and rejects duplicates", async () => {
    const request = () => fetch(`${baseUrl}/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "user-200", nickname: "trinity", password: "test1234" }),
    });

    expect((await request()).status).toBe(201);
    const duplicate = await request();
    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toMatchObject({
      error: {
        code: "USER_ALREADY_EXISTS",
        requestId: expect.any(String),
      },
    });
  });

  it("rejects malformed JSON and exposes the POST method contract", async () => {
    const malformed = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": "malformed-request",
      },
      body: "{",
    });
    const wrongMethod = await fetch(`${baseUrl}/login`);

    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({
      error: {
        code: "INVALID_JSON",
        requestId: "malformed-request",
      },
    });
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("allow")).toBe("POST");
  });

  it("validates login input before calling the handler", async () => {
    const response = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "", password: "" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "VALIDATION_FAILED",
        requestId: expect.any(String),
      },
    });
  });

  it("returns 429 on the sixth login attempt from the same IP and user ID", async () => {
    const request = () => fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "user-100", password: "wrong-password" }),
    });

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect((await request()).status).toBe(401);
    }

    const blocked = await request();
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeDefined();
    expect(blocked.headers.get("ratelimit-limit")).toBe("5");
    expect(blocked.headers.get("ratelimit-remaining")).toBe("0");
    expect(blocked.headers.get("ratelimit-reset")).toBeDefined();
    await expect(blocked.json()).resolves.toMatchObject({
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        details: {
          retryAfterMs: expect.any(Number),
          resetAt: expect.any(String),
        },
      },
    });
  });

  it("rejects unsupported and oversized request bodies", async () => {
    const unsupported = await fetch(`${baseUrl}/login`, {
      method: "POST",
      body: JSON.stringify({ userId: "user-100", password: "test1234" }),
    });
    const oversized = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "user-100", password: "x".repeat(17_000) }),
    });

    expect(unsupported.status).toBe(415);
    await expect(unsupported.json()).resolves.toMatchObject({
      error: { code: "UNSUPPORTED_MEDIA_TYPE", requestId: expect.any(String) },
    });
    expect(oversized.status).toBe(413);
    await expect(oversized.json()).resolves.toMatchObject({
      error: { code: "REQUEST_BODY_TOO_LARGE", requestId: expect.any(String) },
    });
  });

  it("returns a structured error for invalid credentials", async () => {
    const response = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": "invalid-login",
      },
      body: JSON.stringify({ userId: "user-100", password: "incorrect" }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "INVALID_CREDENTIALS",
        requestId: "invalid-login",
      },
    });
  });

  it("authenticates bearer tokens on protected routes", async () => {
    const unauthorized = await fetch(`${baseUrl}/me`);
    expect(unauthorized.status).toBe(401);

    const login = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "user-100", password: "test1234" }),
    });
    const body = await login.json() as { accessToken: string };
    const authorized = await fetch(`${baseUrl}/me`, {
      headers: { Authorization: `Bearer ${body.accessToken}` },
    });

    expect(authorized.status).toBe(200);
    await expect(authorized.json()).resolves.toEqual({
      user: { userId: "user-100", nickname: "neo" },
    });
  });

  it("closes WebSocket connections that exceed maxPayload", async () => {
    const webSocketUrl = baseUrl.replace("http://", "ws://");
    const closeCode = await new Promise<number>((resolve, reject) => {
      const socket = new WebSocket(webSocketUrl);
      socket.once("open", () => socket.send("x".repeat(65)));
      socket.once("close", resolve);
      socket.once("error", reject);
    });

    expect(closeCode).toBe(1009);
  });

  it("stops idempotently", async () => {
    await application.stop();
    await expect(application.stop()).resolves.toBeUndefined();
  });

  it("cleans up when startup fails", async () => {
    const blocker = http.createServer();
    await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
    const port = (blocker.address() as AddressInfo).port;
    const secondDirectory = await mkdtemp(path.join(os.tmpdir(), "websocket-test-"));
    const second = createApplication(await createTestContainer(
      path.join(secondDirectory, "failed-start.db"),
      { config: createTestConfig(path.join(secondDirectory, "failed-start.db"), port) },
    ));

    await expect(second.start()).rejects.toMatchObject({ code: "EADDRINUSE" });
    await expect(second.stop()).resolves.toBeUndefined();

    await new Promise<void>((resolve, reject) => blocker.close((error) => error ? reject(error) : resolve()));
    await rm(secondDirectory, { recursive: true, force: true });
  });
});
