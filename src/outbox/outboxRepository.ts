import type {
  CreateOutboxEventInput,
  OutboxEventRecord,
} from "./outboxEvent";

export interface OutboxRepository {
  create(input: CreateOutboxEventInput): Promise<void>;
  findAvailable(options: {
    now: string;
    limit: number;
  }): Promise<OutboxEventRecord[]>;
  markProcessing(input: {
    id: string;
    processingStartedAt: string;
  }): Promise<boolean>;
  markProcessed(input: {
    id: string;
    processedAt: string;
  }): Promise<void>;
  markPendingForRetry(input: {
    id: string;
    attemptCount: number;
    availableAt: string;
    lastError: string;
  }): Promise<void>;
  markFailed(input: {
    id: string;
    attemptCount: number;
    lastError: string;
  }): Promise<void>;
  recoverStaleProcessing(input: {
    staleBefore: string;
    availableAt: string;
  }): Promise<number>;
}
