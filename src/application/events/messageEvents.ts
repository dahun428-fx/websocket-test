import { createDomainEvent } from "./createDomainEvent";
import type { DomainEvent } from "./domainEvent";

export interface MessageCreatedPayload {
  messageId: string;
  roomId: string;
  userId: string;
  createdAt: string;
}

export type MessageCreatedEvent = DomainEvent<
  "MessageCreated",
  MessageCreatedPayload
>;

export function createMessageCreatedEvent(payload: MessageCreatedPayload): MessageCreatedEvent {
  return createDomainEvent("MessageCreated", payload);
}
