import type { EventBus } from "../application/events/eventBus";
import type { UnitOfWork } from "../application/unitOfWork";
import type { Logger } from "../logging/logger";

import { deserializeApplicationEvent } from "./applicationEventSerializer";
import type { BackgroundWorker } from "./backgroundWorker";
import type { OutboxEventRecord } from "./outboxEvent";
import type { OutboxRepository } from "./outboxRepository";
import { calculateRetryDelayMs } from "./retryDelay";

export interface OutboxWorkerConfig {
  enabled: boolean;
  pollingIntervalMs: number;
  batchSize: number;
  maximumAttempts: number;
  staleProcessingMs: number;
  retryBaseDelayMs: number;
  retryMaximumDelayMs: number;
}

interface CreateOutboxWorkerOptions {
  outboxRepository: OutboxRepository;
  unitOfWork: UnitOfWork;
  eventBus: EventBus;
  logger: Logger;
  config: OutboxWorkerConfig;
  runtime?: {
    now?: () => Date;
    setTimeout?: typeof globalThis.setTimeout;
    clearTimeout?: typeof globalThis.clearTimeout;
  };
}

function serializeWorkerError(error: unknown): string {
  if (error instanceof Error) {
    return [error.name, error.message].filter(Boolean).join(": ").slice(0, 2_000);
  }

  return String(error).slice(0, 2_000);
}

export function createOutboxWorker(
  options: CreateOutboxWorkerOptions,
): BackgroundWorker {
  const {
    outboxRepository,
    unitOfWork,
    eventBus,
    logger,
    config,
  } = options;
  const now = options.runtime?.now ?? (() => new Date());
  const scheduleTimeout = options.runtime?.setTimeout ?? globalThis.setTimeout;
  const cancelTimeout = options.runtime?.clearTimeout ?? globalThis.clearTimeout;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let runningPromise: Promise<number> | null = null;
  let started = false;
  let stopping = false;

  async function processRecord(record: OutboxEventRecord): Promise<boolean> {
    const claimed = await unitOfWork.run(
      () => outboxRepository.markProcessing({
        id: record.id,
        processingStartedAt: now().toISOString(),
      }),
    );

    if (!claimed) {
      return false;
    }

    try {
      const event = deserializeApplicationEvent(record.payload);
      await eventBus.publish(event);
      await unitOfWork.run(
        () => outboxRepository.markProcessed({
          id: record.id,
          processedAt: now().toISOString(),
        }),
      );

      logger.debug("Outbox event processed", {
        eventId: record.id,
        eventName: record.eventName,
        attemptCount: record.attemptCount,
      });
      return true;
    } catch (error) {
      const attemptCount = record.attemptCount + 1;
      const lastError = serializeWorkerError(error);

      if (attemptCount >= config.maximumAttempts) {
        await unitOfWork.run(
          () => outboxRepository.markFailed({
            id: record.id,
            attemptCount,
            lastError,
          }),
        );
        logger.error("Outbox event permanently failed", {
          eventId: record.id,
          eventName: record.eventName,
          attemptCount,
          error,
        });
        return false;
      }

      const retryDelayMs = calculateRetryDelayMs({
        attemptCount,
        baseDelayMs: config.retryBaseDelayMs,
        maximumDelayMs: config.retryMaximumDelayMs,
      });
      const availableAt = new Date(now().getTime() + retryDelayMs).toISOString();

      await unitOfWork.run(
        () => outboxRepository.markPendingForRetry({
          id: record.id,
          attemptCount,
          availableAt,
          lastError,
        }),
      );
      logger.warn("Outbox event scheduled for retry", {
        eventId: record.id,
        eventName: record.eventName,
        attemptCount,
        retryDelayMs,
      });
      return false;
    }
  }

  async function performRunOnce(): Promise<number> {
    const records = await unitOfWork.run(
      () => outboxRepository.findAvailable({
        now: now().toISOString(),
        limit: config.batchSize,
      }),
    );
    let processedCount = 0;

    for (const record of records) {
      if (stopping) {
        break;
      }
      if (await processRecord(record)) {
        processedCount += 1;
      }
    }

    return processedCount;
  }

  async function runOnce(): Promise<number> {
    if (runningPromise) {
      return 0;
    }

    runningPromise = performRunOnce();
    try {
      return await runningPromise;
    } finally {
      runningPromise = null;
    }
  }

  function scheduleNext(): void {
    if (stopping || !started) {
      return;
    }

    timer = scheduleTimeout(async () => {
      timer = null;
      try {
        await runOnce();
      } catch (error) {
        logger.error("Outbox polling failed", { error });
      } finally {
        scheduleNext();
      }
    }, config.pollingIntervalMs);

    timer.unref?.();
  }

  async function start(): Promise<void> {
    if (started || !config.enabled) {
      return;
    }

    stopping = false;
    const currentTime = now();
    const recoveredCount = await unitOfWork.run(
      () => outboxRepository.recoverStaleProcessing({
        staleBefore: new Date(
          currentTime.getTime() - config.staleProcessingMs,
        ).toISOString(),
        availableAt: currentTime.toISOString(),
      }),
    );

    if (recoveredCount > 0) {
      logger.warn("Recovered stale outbox events", { recoveredCount });
    }

    started = true;
    logger.info("Outbox worker started", {
      pollingIntervalMs: config.pollingIntervalMs,
      batchSize: config.batchSize,
    });
    scheduleNext();
  }

  async function stop(): Promise<void> {
    stopping = true;
    started = false;

    if (timer) {
      cancelTimeout(timer);
      timer = null;
    }

    await runningPromise;
    logger.info("Outbox worker stopped");
  }

  return { start, stop, runOnce };
}
