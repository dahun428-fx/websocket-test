import type { MessageCreatedEvent } from "./messageEvents";
import type { RoomCreatedEvent } from "./roomEvents";
import type { UserCreatedEvent } from "./userEvents";

export type ApplicationEvent =
  | UserCreatedEvent
  | RoomCreatedEvent
  | MessageCreatedEvent;
