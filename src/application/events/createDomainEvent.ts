import { DomainEvent } from "./domainEvent";

export function createDomainEvent<TName extends string, TPayload>(name: TName, payload: TPayload): DomainEvent<TName, TPayload> {
    return {
        eventId: crypto.randomUUID(),
        name,
        occurredAt: new Date().toISOString(),
        payload
    }
}