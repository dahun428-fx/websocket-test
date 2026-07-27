import { createDomainEvent } from "./createDomainEvent";
import { DomainEvent } from "./domainEvent";

export interface MessageCreatedPayload {
    messageId: string;
    roomId: string;
    userId: string;
    content: string;
    createdAt: string;
}

export type MessageCreatedEvent = DomainEvent<"MessageCreated", MessageCreatedPayload>

export function createMessageCreatedEvent(payload: MessageCreatedPayload): MessageCreatedEvent {
    return createDomainEvent("MessageCreated", payload)
}