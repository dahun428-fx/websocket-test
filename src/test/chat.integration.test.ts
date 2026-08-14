import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";

import { createApplication, type Application } from "../application";
import type { AuthResult } from "../service/authService";
import type { ChatMessage, RegisterSuccessMessage, ServerMessage } from "../types/messages";
import { closeWebSocket, waitForMessage, waitForOpen } from "./websocketTestUtils";
import { createTestConfig } from "./createTestConfig";
import { createTestContainer } from "./createTestContainer";

describe("회원가입 → 로그인 → WebSocket 인증 → 채팅 송수신 흐름", () => {
  let application: Application;
  let testDirectory: string;
  let httpBaseUrl: string;
  let websocketUrl: string;
  const sockets: WebSocket[] = [];

  beforeAll(async () => {
    testDirectory = await mkdtemp(path.join(os.tmpdir(), "websocket-test-"));

    application = createApplication(await createTestContainer(
      path.join(testDirectory, "chat-integration.db"),
      { config: {
        ...createTestConfig(path.join(testDirectory, "chat-integration.db")),
        rateLimit: { maxAttempts: 100, windowMs: 60_000, failMode: "open" },
        cache: { roomTtlSeconds: 300 },
      } },
    ));
    const port = await application.start();
    httpBaseUrl = `http://127.0.0.1:${port}`;
    websocketUrl = `ws://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await Promise.all(sockets.map(closeWebSocket));
    await application.stop();
    await rm(testDirectory, { recursive: true, force: true });
  });

  async function signup(userId: string, nickname: string): Promise<AuthResult> {
    const response = await fetch(`${httpBaseUrl}/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, nickname, password: "test1234" }),
    });

    expect(response.status).toBe(201);
    return response.json() as Promise<AuthResult>;
  }

  async function login(userId: string): Promise<AuthResult> {
    const response = await fetch(`${httpBaseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, password: "test1234" }),
    });

    expect(response.status).toBe(200);
    return response.json() as Promise<AuthResult>;
  }

  async function connectAndRegister(accessToken: string, roomId: string): Promise<WebSocket> {
    const ws = new WebSocket(websocketUrl);
    sockets.push(ws);
    await waitForOpen(ws);

    const registerSuccess = waitForMessage<RegisterSuccessMessage>(
      ws,
      (message): message is RegisterSuccessMessage => message.type === "register-success",
    );

    ws.send(JSON.stringify({ type: "register", token: accessToken, room_id: roomId }));
    await registerSuccess;

    return ws;
  }

  it("두 사용자가 회원가입 후 JWT로 같은 방에 입장하고 채팅을 주고받는다", async () => {
    const suffix = Date.now();
    const userAId = `user-a-${suffix}`;
    const userBId = `user-b-${suffix}`;
    const roomId = `room-${suffix}`;

    const signupA = await signup(userAId, "사용자 A");
    await signup(userBId, "사용자 B");

    // 로그인으로도 동일 사용자의 JWT를 재발급받을 수 있는지 확인한다.
    const loginA = await login(userAId);
    expect(loginA.user).toEqual({ userId: userAId, nickname: "사용자 A" });

    const loginB = await login(userBId);

    const socketA = await connectAndRegister(signupA.accessToken, roomId);
    const socketB = await connectAndRegister(loginB.accessToken, roomId);

    const messageForA = waitForMessage<ChatMessage>(
      socketA,
      (message): message is ChatMessage =>
        (message as ServerMessage).type === "chat" && message.message === "통합 테스트 메시지",
    );
    const messageForB = waitForMessage<ChatMessage>(
      socketB,
      (message): message is ChatMessage =>
        (message as ServerMessage).type === "chat" && message.message === "통합 테스트 메시지",
    );

    socketA.send(JSON.stringify({ type: "chat", message: "통합 테스트 메시지" }));

    const [receivedByA, receivedByB] = await Promise.all([messageForA, messageForB]);

    expect(receivedByA.nickname).toBe("사용자 A");
    expect(receivedByA.room_id).toBe(roomId);
    expect(receivedByB.nickname).toBe("사용자 A");
    expect(receivedByB.message).toBe("통합 테스트 메시지");
  });
});
