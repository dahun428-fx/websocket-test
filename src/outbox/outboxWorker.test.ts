import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createInMemoryEventBus } from "../application/events/inMemoryEventBus";
import { createUserCreatedEvent } from "../application/events/userEvents";
import { openDatabase, type DatabaseConnection } from "../database/database";
import { createSqliteUnitOfWork } from "../database/sqliteUnitOfWork";
import type { Logger } from "../logging/logger";
import { serializeApplicationEvent } from "./applicationEventSerializer";
import { createSqliteOutboxRepository } from "./createSqliteOutboxRepository";
import type { OutboxRepository } from "./outboxRepository";
import { createOutboxWorker, type OutboxWorkerConfig } from "./outboxWorker";
import { calculateRetryDelayMs } from "./retryDelay";

function createLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
}

const config: OutboxWorkerConfig = {
  enabled: false,
  pollingIntervalMs: 60_000,
  batchSize: 20,
  maximumAttempts: 5,
  staleProcessingMs: 30_000,
  retryBaseDelayMs: 1_000,
  retryMaximumDelayMs: 60_000,
};

describe("OutboxWorker", () => {
  let database: DatabaseConnection;
  let repository: OutboxRepository;
  let unitOfWork: ReturnType<typeof createSqliteUnitOfWork>;
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "outbox-worker-"));
    database = await openDatabase(path.join(directory, "test.db"));
    repository = createSqliteOutboxRepository({ database });
    unitOfWork = createSqliteUnitOfWork({
      database,
      logger: createLogger(),
    });
  });

  afterEach(async () => {
    await database.close();
    await rm(directory, { recursive: true, force: true });
  });

  async function insertPendingEvent(id = crypto.randomUUID()): Promise<string> {
    const event = createUserCreatedEvent({
      userId: "user-1",
      loginId: "login-1",
      nickname: "다훈",
      createdAt: "2026-07-28T00:00:00.000Z",
    });
    await repository.create({
      id,
      eventName: event.name,
      payload: serializeApplicationEvent({ ...event, eventId: id }),
      occurredAt: event.occurredAt,
      availableAt: "2026-07-28T00:00:00.000Z",
      createdAt: "2026-07-28T00:00:00.000Z",
    });
    return id;
  }

  async function findRecord(id: string) {
    return database.get<{
      status: string;
      attempt_count: number;
      processing_started_at: string | null;
      last_error: string | null;
    }>(
      `SELECT status, attempt_count, processing_started_at, last_error
       FROM outbox_events WHERE id = ?`,
      id,
    );
  }

  it("claims, publishes, and marks a pending event processed", async () => {
    const id = await insertPendingEvent();
    const handler = vi.fn(async () => undefined);
    const eventBus = createInMemoryEventBus({ logger: createLogger() });
    eventBus.subscribe({
      eventName: "UserCreated",
      handlerName: "TestHandler",
      handler,
    });
    const worker = createOutboxWorker({
      outboxRepository: repository,
      unitOfWork,
      eventBus,
      logger: createLogger(),
      config,
      runtime: {
        now: () => new Date("2026-07-29T00:00:00.000Z"),
      },
    });

    await expect(worker.runOnce()).resolves.toBe(1);
    expect(handler).toHaveBeenCalledOnce();
    await expect(findRecord(id)).resolves.toMatchObject({
      status: "processed",
      attempt_count: 0,
      processing_started_at: null,
    });
  });

  it("returns a failed handler event to pending with exponential backoff", async () => {
    const id = await insertPendingEvent();
    const eventBus = createInMemoryEventBus({ logger: createLogger() });
    eventBus.subscribe({
      eventName: "UserCreated",
      handlerName: "FailingHandler",
      handler: async () => {
        throw new Error("temporary failure");
      },
    });
    const worker = createOutboxWorker({
      outboxRepository: repository,
      unitOfWork,
      eventBus,
      logger: createLogger(),
      config,
      runtime: {
        now: () => new Date("2026-07-29T00:00:00.000Z"),
      },
    });

    await expect(worker.runOnce()).resolves.toBe(0);
    await expect(findRecord(id)).resolves.toMatchObject({
      status: "pending",
      attempt_count: 1,
      processing_started_at: null,
      last_error: "Error: temporary failure",
    });
  });

  it("marks a poison event failed at the maximum attempt count", async () => {
    const id = await insertPendingEvent();
    await database.run(
      "UPDATE outbox_events SET attempt_count = 4 WHERE id = ?",
      id,
    );
    const eventBus = createInMemoryEventBus({ logger: createLogger() });
    eventBus.subscribe({
      eventName: "UserCreated",
      handlerName: "FailingHandler",
      handler: async () => {
        throw new Error("permanent failure");
      },
    });
    const worker = createOutboxWorker({
      outboxRepository: repository,
      unitOfWork,
      eventBus,
      logger: createLogger(),
      config,
      runtime: {
        now: () => new Date("2026-07-29T00:00:00.000Z"),
      },
    });

    await worker.runOnce();
    await expect(findRecord(id)).resolves.toMatchObject({
      status: "failed",
      attempt_count: 5,
      last_error: "Error: permanent failure",
    });
  });

  it("allows only one worker to claim a pending event", async () => {
    const id = await insertPendingEvent();

    await expect(repository.markProcessing({
      id,
      processingStartedAt: "2026-07-29T00:00:00.000Z",
    })).resolves.toBe(true);
    await expect(repository.markProcessing({
      id,
      processingStartedAt: "2026-07-29T00:00:01.000Z",
    })).resolves.toBe(false);
  });

  it("recovers stale processing records when enabled worker starts", async () => {
    const id = await insertPendingEvent();
    await repository.markProcessing({
      id,
      processingStartedAt: "2026-07-28T00:00:00.000Z",
    });
    const worker = createOutboxWorker({
      outboxRepository: repository,
      unitOfWork,
      eventBus: createInMemoryEventBus({ logger: createLogger() }),
      logger: createLogger(),
      config: { ...config, enabled: true },
      runtime: {
        now: () => new Date("2026-07-29T00:00:00.000Z"),
      },
    });

    await worker.start();
    await worker.stop();

    await expect(findRecord(id)).resolves.toMatchObject({
      status: "pending",
      processing_started_at: null,
    });
  });
});

describe("calculateRetryDelayMs", () => {
  it.each([
    [1, 1_000],
    [2, 2_000],
    [3, 4_000],
    [10, 60_000],
  ])("calculates capped exponential delay for attempt %i", (
    attemptCount,
    expected,
  ) => {
    expect(calculateRetryDelayMs({
      attemptCount,
      baseDelayMs: 1_000,
      maximumDelayMs: 60_000,
    })).toBe(expected);
  });
});
