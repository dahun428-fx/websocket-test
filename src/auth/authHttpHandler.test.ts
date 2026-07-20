import http from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthService } from "../service/authService";
import { createAuthHttpHandler } from "./authHttpHandler";

function createAuthService(): AuthService {
  return {
    login: vi.fn(async (userId) => userId === "valid" ? {
      accessToken: "token",
      user: { userId: "valid", nickname: "neo" },
    } : null),
    signup: vi.fn(async (input) => ({
      success: true as const,
      data: {
        accessToken: "token",
        user: { userId: input.userId, nickname: input.nickname },
      },
    })),
  };
}

describe("createAuthHttpHandler", () => {
  let server: http.Server;
  let baseUrl: string;
  let authService: AuthService;

  beforeEach(async () => {
    authService = createAuthService();
    const handler = createAuthHttpHandler(authService, {
      maxBodyBytes: 256,
      loginRateLimit: { maxAttempts: 2, windowMs: 60_000 },
    });
    server = http.createServer((request, response) => {
      void handler(request, response).then((handled) => {
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
  });

  it("accepts a body at the byte limit and rejects one byte over it", async () => {
    const body = JSON.stringify({ userId: "valid", password: "test1234" });
    const handler = createAuthHttpHandler(authService, {
      maxBodyBytes: Buffer.byteLength(body),
      loginRateLimit: { maxAttempts: 10, windowMs: 60_000 },
    });
    server.removeAllListeners("request");
    server.on("request", (request, response) => void handler(request, response));

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

});
