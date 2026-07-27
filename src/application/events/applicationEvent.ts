import { MessageCreatedEvent } from "./messageEvents";
import { RoomCreatedEvent } from "./roomEvents";
import { UserCreatedEvent } from "./userEvents";

export type ApplicationEvent = | UserCreatedEvent | RoomCreatedEvent | MessageCreatedEvent