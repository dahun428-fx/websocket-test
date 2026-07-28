export interface DomainEvent<TName extends string = string, TPayload = unknown> {
  readonly eventId: string;
  readonly name: TName;
  readonly occurredAt: string;
  readonly payload: Readonly<TPayload>;
}
