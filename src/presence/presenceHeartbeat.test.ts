import { describe, expect, it, vi } from "vitest";

import type { Logger } from "../logging/logger";
import type { PresenceRepository } from "./presenceRepository";
import { createPresenceHeartbeat } from "./presenceHeartbeat";

function createLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
}

describe("PresenceHeartbeat", () => {
  it("refreshes presence and recreates an expired record", async () => {
    vi.useFakeTimers();
    const repository = {
      refresh: vi.fn(async () => false),
      register: vi.fn(async () => undefined),
    } as unknown as PresenceRepository;
    const heartbeat = createPresenceHeartbeat({
      record: () => ({
        connectionId: "connection-1",
        userId: "user-1",
        serverId: "server-a",
        connectedAt: "2026-07-29T00:00:00.000Z",
        lastSeenAt: "2026-07-29T00:00:00.000Z",
        roomId: "room-1",
      }),
      intervalMs: 1_000,
      presenceRepository: repository,
      logger: createLogger(),
    });

    heartbeat.start();
    await vi.advanceTimersByTimeAsync(1_000);
    heartbeat.stop();

    expect(repository.refresh).toHaveBeenCalledOnce();
    expect(repository.register).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
