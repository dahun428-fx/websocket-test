import { describe, expect, it, vi } from "vitest";

import type { MessageHandlers } from "../types/handler";
import type { ChatWebSocket } from "../types/websocket";
import { dispatchMessage } from "./messageDispatcher";

describe("dispatchMessage", () => {
  it("routes each protocol message to its explicit handler", async () => {
    const handlers: MessageHandlers = {
      register: vi.fn(async () => true),
      chat: vi.fn(async () => true),
      history: vi.fn(async () => true),
    };
    const socket = {} as ChatWebSocket;

    await dispatchMessage(socket, { type: "chat", message: "hello" }, handlers);

    expect(handlers.chat).toHaveBeenCalledWith(socket, {
      type: "chat",
      message: "hello",
    });
  });
});
