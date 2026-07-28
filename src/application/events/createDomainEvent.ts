import { randomUUID } from "node:crypto";

import type { DomainEvent } from "./domainEvent";

export function createDomainEvent<TName extends string, TPayload>(
  name: TName,
  payload: TPayload,
): DomainEvent<TName, TPayload> {
  return Object.freeze({
    eventId: randomUUID(),
    name,
    occurredAt: new Date().toISOString(),
    payload: Object.freeze(payload),
  });
}
