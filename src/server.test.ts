import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { hashPassword } from "./auth/passwordService";
import { closeDatabase, initializeDatabase } from "./database/database";
import { userRepository } from "./repositories/userRepository";
import { server } from "./server";

let baseUrl: string;
let testDirectory: string | undefined;

function getServerUrl(): string {
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Test server address is unavailable.");
  }

  return `http://127.0.0.1:${(address as AddressInfo).port}`;
}

function listenServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };

    server.once("error", onError);
    server.listen(0, "127.0.0.1", onListening);
  });
}

function closeServer(): Promise<void> {
  if (!server.listening) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function postLogin(payload: unknown): Promise<Response> {
  return fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

beforeEach(async () => {
  process.env.JWT_SECRET = "test-secret";
  testDirectory = await mkdtemp(path.join(os.tmpdir(), "websocket-test-"));
  await initializeDatabase(path.join(testDirectory, "server-test.db"));
  await userRepository.create({
    id: "user-100",
    nickname: "neo",
    passwordHash: await hashPassword("test1234"),
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  await listenServer();
  baseUrl = getServerUrl();
});

afterEach(async () => {
  await closeServer();
  await closeDatabase();
  if (testDirectory) {
    await rm(testDirectory, { recursive: true, force: true });
    testDirectory = undefined;
  }
  delete process.env.JWT_SECRET;
});

describe("HTTP server", () => {
  it("returns an access token for valid login credentials", async () => {
    const response = await postLogin({
      userId: "user-100",
      password: "test1234",
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      accessToken: expect.any(String),
      user: {
        userId: "user-100",
        nickname: "neo",
      },
    });
  });

  it("rejects invalid login credentials", async () => {
    const response = await postLogin({
      userId: "user-100",
      password: "wrong-password",
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      message: expect.any(String),
    });
  });

  it("rejects malformed JSON bodies", async () => {
    const response = await postLogin("{");
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      message: expect.any(String),
    });
  });

  it("rejects non-POST login requests", async () => {
    const response = await fetch(`${baseUrl}/login`);
    const body = await response.json();

    expect(response.status).toBe(405);
    expect(body).toEqual({
      message: expect.any(String),
    });
  });
});
