import { DomainEvent } from "./domainEvent";

export interface EventHandler<TEvent extends DomainEvent = DomainEvent> {
    handle(
        event: TEvent
    ): Promise<void>
}