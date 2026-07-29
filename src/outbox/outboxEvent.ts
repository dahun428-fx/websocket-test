export type OutboxStatus =
  | "pending"
  | "processing"
  | "processed"
  | "failed";

export interface OutboxEventRecord {
  id: string;
  eventName: string;
  payload: string;
  occurredAt: string;
  status: OutboxStatus;
  attemptCount: number;
  availableAt: string;
  processingStartedAt: string | null;
  processedAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface CreateOutboxEventInput {
  id: string;
  eventName: string;
  payload: string;
  occurredAt: string;
  availableAt: string;
  createdAt: string;
}
