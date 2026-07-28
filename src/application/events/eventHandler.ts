import type { DomainEvent } from "./domainEvent";

export type DomainEventHandler<TEvent extends DomainEvent = DomainEvent> = (
  event: TEvent,
) => Promise<void>;
