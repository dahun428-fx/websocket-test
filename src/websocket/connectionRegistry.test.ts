import WebSocket from "ws";
import { describe, expect, it, vi } from "vitest";

import type { ChatWebSocket } from "../types/websocket";
import { createBroadcastService } from "./broadcastService";
import { createConnectionRegistry } from "./connectionRegistry";

function createSocket(input: {
  connectionId: string;
  roomId?: string;
  userId?: string;
  open?: boolean;
}): ChatWebSocket {
  return {
    connectionId: input.connectionId,
    room_id: input.roomId ?? null,
    userId: input.userId ?? null,
    readyState: input.open === false ? WebSocket.CLOSED : WebSocket.OPEN,
    send: vi.fn(),
    close: vi.fn(),
  } as unknown as ChatWebSocket;
}

describe("ConnectionRegistry", () => {
  it("keeps only local WebSocket objects and filters room/user connections", () => {
    const registry = createConnectionRegistry();
    const first = createSocket({
      connectionId: "connection-1",
      roomId: "room-1",
      userId: "user-1",
    });
    const second = createSocket({
      connectionId: "connection-2",
      roomId: "room-2",
      userId: "user-1",
    });
    registry.add(first);
    registry.add(second);

    expect(registry.findByRoomId("room-1")).toEqual([first]);
    expect(registry.findByUserId("user-1")).toEqual([first, second]);
    registry.remove(first.connectionId);
    expect(registry.findById(first.connectionId)).toBeNull();
  });

  it("broadcasts only through connections owned by the local registry", () => {
    const registry = createConnectionRegistry();
    const target = createSocket({
      connectionId: "connection-1",
      roomId: "room-1",
    });
    const other = createSocket({
      connectionId: "connection-2",
      roomId: "room-2",
    });
    registry.add(target);
    registry.add(other);
    const broadcast = createBroadcastService(registry);
    const payload = {
      type: "notification" as const,
      room_id: "room-1",
      message: "hello",
      roomConnectionCount: 1,
      roomUserCount: 1,
      createdAt: "2026-07-29T00:00:00.000Z",
    };

    expect(broadcast.toRoom("room-1", payload)).toBe(1);
    expect(target.send).toHaveBeenCalledWith(JSON.stringify(payload));
    expect(other.send).not.toHaveBeenCalled();
  });
});
