import jwt from "jsonwebtoken";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAccessToken } from "../auth/tokenService";
import type { MessageRepository } from "../repositories/messageRepository";
import type { RoomService } from "../service/roomService";
import type { SendError, SendJson } from "../types/handler";
import type { ChatWebSocket } from "../types/websocket";
import { createChatHandler } from "./chatHandler";
import { createHistoryHandler } from "./historyHandler";
import { createRegisterHandler } from "./registerHandler";

function createSocket(): ChatWebSocket {
  return {
    userId: null,
    nickname: null,
    room_id: null,
    isClosed: false,
    close: vi.fn(),
  } as unknown as ChatWebSocket;
}

function createRoomService(): RoomService {
  return {
    broadcastToRoom: vi.fn(() => 1),
    getConnectionCount: vi.fn(() => 1),
    getUserCount: vi.fn(() => 1),
    getUserConnections: vi.fn(() => []),
    sendToUser: vi.fn(() => 0),
    getClients: vi.fn(() => []),
    join: vi.fn((socket, roomId) => {
      socket.room_id = roomId;
      return roomId;
    }),
    leave: vi.fn((socket) => {
      if (!socket) return null;
      const roomId = socket.room_id;
      socket.room_id = null;
      return roomId;
    }),
  };
}

function createMessageRepository(): MessageRepository {
  return {
    save: vi.fn(async (_roomId, message) => ({ ...message, id: 1 })),
    get: vi.fn(async () => ({ messages: [], hasMore: false, nextBeforeId: null })),
    getBefore: vi.fn(async () => ({ messages: [], hasMore: false, nextBeforeId: null })),
  };
}

function createToken(userId = "user-1", nickname = "neo"): string {
  return createAccessToken(userId, nickname);
}

afterEach(() => {
  delete process.env.JWT_SECRET;
});

describe("message handlers", () => {
  it("registers using only the authenticated token nickname", async () => {
    process.env.JWT_SECRET = "test-secret";
    const socket = createSocket();
    const sendJson: SendJson = vi.fn(async () => undefined);
    const handler = createRegisterHandler({
      roomService: createRoomService(),
      sendJson,
      sendError: vi.fn(async () => undefined),
      sendRoomHistory: vi.fn(async () => undefined),
      createTimestamp: () => "2026-01-01T00:00:00.000Z",
    });

    await expect(handler(socket, {
      type: "register",
      token: createToken("user-1", "trinity"),
      room_id: "room-1",
    })).resolves.toBe(true);

    expect(socket).toMatchObject({ userId: "user-1", nickname: "trinity", room_id: "room-1" });
    expect(sendJson).toHaveBeenCalledWith(socket, expect.objectContaining({ nickname: "trinity" }));
  });

  it("rejects a token without a nickname", async () => {
    process.env.JWT_SECRET = "test-secret";
    const socket = createSocket();
    const sendError: SendError = vi.fn(async () => undefined);
    const handler = createRegisterHandler({
      roomService: createRoomService(),
      sendJson: vi.fn(async () => undefined),
      sendError,
      sendRoomHistory: vi.fn(async () => undefined),
      createTimestamp: () => "timestamp",
    });
    const token = jwt.sign({ sub: "user-1" }, "test-secret");

    await expect(handler(socket, {
      type: "register",
      token,
      room_id: "room-1",
    })).resolves.toBe(false);

    expect(sendError).toHaveBeenCalledWith(socket, "INVALID_ACCESS_TOKEN");
  });

  it("rolls back and closes the socket when history delivery fails", async () => {
    process.env.JWT_SECRET = "test-secret";
    const socket = createSocket();
    const roomService = createRoomService();
    const handler = createRegisterHandler({
      roomService,
      sendJson: vi.fn(async () => undefined),
      sendError: vi.fn(async () => undefined),
      sendRoomHistory: vi.fn(async () => { throw new Error("history unavailable"); }),
      createTimestamp: () => "timestamp",
    });

    await expect(handler(socket, {
      type: "register",
      token: createToken(),
      room_id: "room-1",
    })).rejects.toThrow("history unavailable");

    expect(socket).toMatchObject({ userId: null, nickname: null, room_id: null });
    expect(roomService.leave).toHaveBeenCalledWith(socket);
    expect(socket.close).toHaveBeenCalledWith(1011, "Registration failed");
  });

  it("stores and broadcasts chat using trusted socket state", async () => {
    const socket = createSocket();
    socket.nickname = "neo";
    socket.room_id = "room-1";
    const roomService = createRoomService();
    const messageRepository = createMessageRepository();
    const handler = createChatHandler({
      roomService,
      messageRepository,
      sendError: vi.fn(async () => undefined),
      createTimestamp: () => "timestamp",
    });

    await expect(handler(socket, { type: "chat", message: " hello " })).resolves.toBe(true);
    expect(messageRepository.save).toHaveBeenCalledWith("room-1", expect.objectContaining({
      nickname: "neo",
      message: "hello",
    }));
    expect(roomService.broadcastToRoom).toHaveBeenCalledOnce();
  });

  it("does not broadcast when chat persistence fails", async () => {
    const socket = createSocket();
    socket.nickname = "neo";
    socket.room_id = "room-1";
    const roomService = createRoomService();
    const messageRepository = createMessageRepository();
    messageRepository.save = vi.fn(async () => { throw new Error("storage unavailable"); });
    const handler = createChatHandler({
      roomService,
      messageRepository,
      sendError: vi.fn(async () => undefined),
      createTimestamp: () => "timestamp",
    });

    await expect(handler(socket, { type: "chat", message: "hello" })).rejects.toThrow("storage unavailable");
    expect(roomService.broadcastToRoom).not.toHaveBeenCalled();
  });

  it("requires room registration before loading history", async () => {
    const socket = createSocket();
    const sendError: SendError = vi.fn(async () => undefined);
    const handler = createHistoryHandler({
      messageRepository: createMessageRepository(),
      sendJson: vi.fn(async () => undefined),
      sendError,
      createTimestamp: () => "timestamp",
    });

    await expect(handler(socket, {
      type: "history-request",
      before_id: 10,
      limit: 20,
    })).resolves.toBe(false);
    expect(sendError).toHaveBeenCalledWith(socket, "ROOM_NOT_JOINED");
  });
});
