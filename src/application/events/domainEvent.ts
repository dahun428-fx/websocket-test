export interface DomainEvent<TName extends string = string, TPayload = unknown> {
    eventId: string;
    name: TName;
    occurredAt: string;
    payload: TPayload;
}