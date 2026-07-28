import { createDomainEvent } from "./createDomainEvent";
import type { DomainEvent } from "./domainEvent";

export interface RoomCreatedPayload {
  roomId: string;
  ownerId: string;
  name: string;
  createdAt: string;
}

export type RoomCreatedEvent = DomainEvent<"RoomCreated", RoomCreatedPayload>;

export function createRoomCreatedEvent(payload: RoomCreatedPayload): RoomCreatedEvent {
  return createDomainEvent("RoomCreated", payload);
}
