import { describe, expect, it, vi } from "vitest";

import type { Logger } from "../../logging/logger";
import { createInMemoryEventBus } from "./inMemoryEventBus";
import { registerEventHandlers } from "./registerEventHandlers";
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

describe("registerEventHandlers", () => {
  it("registers handlers in one place and returns lifecycle cleanup", async () => {
    const logger = createLogger();
    const eventBus = createInMemoryEventBus({ logger });
    const unsubscribeList = registerEventHandlers({ eventBus, logger });
    const event = createUserCreatedEvent({
      userId: "user-1",
      loginId: "dahun",
      nickname: "다훈",
      createdAt: "2026-07-27T00:00:00.000Z",
    });

    await eventBus.publish(event);
    expect(logger.info).toHaveBeenCalledWith("User created", {
      eventId: event.eventId,
      userId: "user-1",
    });

    for (const unsubscribe of unsubscribeList) {
      unsubscribe();
    }
    vi.mocked(logger.info).mockClear();
    await eventBus.publish(event);

    expect(logger.info).not.toHaveBeenCalled();
  });
});
