import type { ApplicationEvent } from "./applicationEvent";

export type EventName = ApplicationEvent["name"];

export type EventByName<TName extends EventName> = Extract<
  ApplicationEvent,
  { name: TName }
>;

export type EventHandler<TName extends EventName> = (
  event: EventByName<TName>,
) => Promise<void>;

export interface EventSubscription<TName extends EventName> {
  eventName: TName;
  handlerName: string;
  handler: EventHandler<TName>;
}

export interface EventBus {
  subscribe<TName extends EventName>(
    subscription: EventSubscription<TName>,
  ): () => void;
  publish(event: ApplicationEvent): Promise<void>;
}
