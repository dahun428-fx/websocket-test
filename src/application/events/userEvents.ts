import { createDomainEvent } from "./createDomainEvent";
import type { DomainEvent } from "./domainEvent";

export interface UserCreatedPayload {
  userId: string;
  loginId: string;
  nickname: string;
  createdAt: string;
}

export type UserCreatedEvent = DomainEvent<"UserCreated", UserCreatedPayload>;

export function createUserCreatedEvent(payload: UserCreatedPayload): UserCreatedEvent {
  return createDomainEvent("UserCreated", payload);
}
