import { describe, expect, it, vi } from "vitest";

import type { Logger } from "../../logging/logger";
import { createInMemoryEventBus } from "./inMemoryEventBus";
import { createRoomCreatedEvent } from "./roomEvents";
import { createUserCreatedEvent } from "./userEvents";

function createLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
}

function createUserEvent() {
  return createUserCreatedEvent({
    userId: "user-1",
    loginId: "dahun",
    nickname: "다훈",
    createdAt: "2026-07-27T00:00:00.000Z",
  });
}

describe("InMemoryEventBus", () => {
  it("runs only matching handlers in subscription order", async () => {
    const calls: string[] = [];
    const eventBus = createInMemoryEventBus({ logger: createLogger() });

    eventBus.subscribe({
      eventName: "UserCreated",
      handlerName: "FirstUserHandler",
      handler: async () => {
        calls.push("first");
      },
    });
    eventBus.subscribe({
      eventName: "UserCreated",
      handlerName: "SecondUserHandler",
      handler: async () => {
        calls.push("second");
      },
    });
    eventBus.subscribe({
      eventName: "RoomCreated",
      handlerName: "RoomHandler",
      handler: async () => {
        calls.push("room");
      },
    });

    await eventBus.publish(createUserEvent());

    expect(calls).toEqual(["first", "second"]);
  });

  it("isolates a handler failure and logs its identity", async () => {
    const logger = createLogger();
    const secondHandler = vi.fn(async () => undefined);
    const eventBus = createInMemoryEventBus({ logger });
    const event = createUserEvent();

    eventBus.subscribe({
      eventName: "UserCreated",
      handlerName: "FailingHandler",
      handler: async () => {
        throw new Error("handler failed");
      },
    });
    eventBus.subscribe({
      eventName: "UserCreated",
      handlerName: "SecondHandler",
      handler: secondHandler,
    });

    await expect(eventBus.publish(event)).resolves.toBeUndefined();

    expect(secondHandler).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith(
      "Domain event handler failed",
      expect.objectContaining({
        eventId: event.eventId,
        eventName: "UserCreated",
        handlerName: "FailingHandler",
      }),
    );
  });

  it("does not run an unsubscribed handler", async () => {
    const handler = vi.fn(async () => undefined);
    const eventBus = createInMemoryEventBus({ logger: createLogger() });
    const unsubscribe = eventBus.subscribe({
      eventName: "UserCreated",
      handlerName: "UserHandler",
      handler,
    });

    unsubscribe();
    await eventBus.publish(createUserEvent());

    expect(handler).not.toHaveBeenCalled();
  });

  it("creates serializable, shallowly immutable events", () => {
    const event = createRoomCreatedEvent({
      roomId: "room-1",
      ownerId: "user-1",
      name: "테스트 방",
      createdAt: "2026-07-27T00:00:00.000Z",
    });

    expect(event.eventId).toEqual(expect.any(String));
    expect(new Date(event.occurredAt).toISOString()).toBe(event.occurredAt);
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.payload)).toBe(true);
    expect(() => JSON.stringify(event)).not.toThrow();
  });
});
