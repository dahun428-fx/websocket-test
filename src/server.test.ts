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

    application = await createApplication({
      config: createTestConfig(databasePath),
      websocketMaxPayloadBytes: 64,
    });
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
  });

  it("rotates refresh tokens and invalidates them on logout", async () => {
    const loginResponse = await fetch(`${baseUrl}/login`, {
      method: "POST",
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
    await expect(
      fetch(`${baseUrl}/refresh`, {
        method: "POST",
        headers: { Cookie: firstCookie ?? "" },
      }),
    ).resolves.toMatchObject({ status: 401 });

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
      body: JSON.stringify({ userId: "user-200", nickname: "trinity", password: "test1234" }),
    });

    expect((await request()).status).toBe(201);
    expect((await request()).status).toBe(409);
  });

  it("rejects malformed JSON and exposes the POST method contract", async () => {
    const malformed = await fetch(`${baseUrl}/login`, { method: "POST", body: "{" });
    const wrongMethod = await fetch(`${baseUrl}/login`);

    expect(malformed.status).toBe(400);
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("allow")).toBe("POST");
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
    const second = await createApplication({
      config: createTestConfig(path.join(secondDirectory, "failed-start.db"), port),
    });

    await expect(second.start()).rejects.toMatchObject({ code: "EADDRINUSE" });
    await expect(second.stop()).resolves.toBeUndefined();

    await new Promise<void>((resolve, reject) => blocker.close((error) => error ? reject(error) : resolve()));
    await rm(secondDirectory, { recursive: true, force: true });
  });
});
