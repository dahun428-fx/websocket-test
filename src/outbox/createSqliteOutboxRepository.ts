import type { DatabaseConnection } from "../database/database";

import type {
  CreateOutboxEventInput,
  OutboxEventRecord,
  OutboxStatus,
} from "./outboxEvent";
import type { OutboxRepository } from "./outboxRepository";

interface CreateSqliteOutboxRepositoryOptions {
  database: DatabaseConnection;
}

interface OutboxDatabaseRow {
  id: string;
  event_name: string;
  payload: string;
  occurred_at: string;
  status: OutboxStatus;
  attempt_count: number;
  available_at: string;
  processing_started_at: string | null;
  processed_at: string | null;
  last_error: string | null;
  created_at: string;
}

function mapOutboxRow(row: OutboxDatabaseRow): OutboxEventRecord {
  return {
    id: row.id,
    eventName: row.event_name,
    payload: row.payload,
    occurredAt: row.occurred_at,
    status: row.status,
    attemptCount: row.attempt_count,
    availableAt: row.available_at,
    processingStartedAt: row.processing_started_at,
    processedAt: row.processed_at,
    lastError: row.last_error,
    createdAt: row.created_at,
  };
}

export function createSqliteOutboxRepository(
  options: CreateSqliteOutboxRepositoryOptions,
): OutboxRepository {
  const { database } = options;

  async function create(input: CreateOutboxEventInput): Promise<void> {
    await database.run(
      `INSERT INTO outbox_events (
        id, event_name, payload, occurred_at, status, attempt_count,
        available_at, created_at
      ) VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)`,
      input.id,
      input.eventName,
      input.payload,
      input.occurredAt,
      input.availableAt,
      input.createdAt,
    );
  }

  async function findAvailable(input: {
    now: string;
    limit: number;
  }): Promise<OutboxEventRecord[]> {
    const rows = await database.all<OutboxDatabaseRow[]>(
      `SELECT
        id, event_name, payload, occurred_at, status, attempt_count,
        available_at, processing_started_at, processed_at, last_error,
        created_at
      FROM outbox_events
      WHERE status = 'pending'
        AND available_at <= ?
      ORDER BY occurred_at ASC
      LIMIT ?`,
      input.now,
      input.limit,
    );
    return rows.map(mapOutboxRow);
  }

  async function markProcessing(input: {
    id: string;
    processingStartedAt: string;
  }): Promise<boolean> {
    const result = await database.run(
      `UPDATE outbox_events
      SET status = 'processing', processing_started_at = ?
      WHERE id = ? AND status = 'pending'`,
      input.processingStartedAt,
      input.id,
    );
    return result.changes === 1;
  }

  async function markProcessed(input: {
    id: string;
    processedAt: string;
  }): Promise<void> {
    await database.run(
      `UPDATE outbox_events
      SET status = 'processed',
          processed_at = ?,
          processing_started_at = NULL,
          last_error = NULL
      WHERE id = ? AND status = 'processing'`,
      input.processedAt,
      input.id,
    );
  }

  async function markPendingForRetry(input: {
    id: string;
    attemptCount: number;
    availableAt: string;
    lastError: string;
  }): Promise<void> {
    await database.run(
      `UPDATE outbox_events
      SET status = 'pending',
          attempt_count = ?,
          available_at = ?,
          processing_started_at = NULL,
          last_error = ?
      WHERE id = ? AND status = 'processing'`,
      input.attemptCount,
      input.availableAt,
      input.lastError,
      input.id,
    );
  }

  async function markFailed(input: {
    id: string;
    attemptCount: number;
    lastError: string;
  }): Promise<void> {
    await database.run(
      `UPDATE outbox_events
      SET status = 'failed',
          attempt_count = ?,
          processing_started_at = NULL,
          last_error = ?
      WHERE id = ? AND status = 'processing'`,
      input.attemptCount,
      input.lastError,
      input.id,
    );
  }

  async function recoverStaleProcessing(input: {
    staleBefore: string;
    availableAt: string;
  }): Promise<number> {
    const result = await database.run(
      `UPDATE outbox_events
      SET status = 'pending',
          available_at = ?,
          processing_started_at = NULL
      WHERE status = 'processing'
        AND processing_started_at < ?`,
      input.availableAt,
      input.staleBefore,
    );
    return result.changes ?? 0;
  }

  return {
    create,
    findAvailable,
    markProcessing,
    markProcessed,
    markPendingForRetry,
    markFailed,
    recoverStaleProcessing,
  };
}
