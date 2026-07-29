import { describe, expect, it } from "vitest";

import { createUserCreatedEvent } from "../application/events/userEvents";
import {
  deserializeApplicationEvent,
  InvalidOutboxPayloadError,
  serializeApplicationEvent,
} from "./applicationEventSerializer";

describe("applicationEventSerializer", () => {
  it("round-trips a known application event", () => {
    const event = createUserCreatedEvent({
      userId: "user-1",
      loginId: "login-1",
      nickname: "다훈",
      createdAt: "2026-07-28T00:00:00.000Z",
    });

    expect(deserializeApplicationEvent(
      serializeApplicationEvent(event),
    )).toEqual(event);
  });

  it.each([
    "not-json",
    JSON.stringify({ name: "UnknownEvent" }),
    JSON.stringify({
      eventId: "not-a-uuid",
      name: "UserCreated",
      occurredAt: "invalid",
      payload: {},
    }),
  ])("rejects invalid outbox payloads", (payload) => {
    expect(() => deserializeApplicationEvent(payload))
      .toThrow(InvalidOutboxPayloadError);
  });
});
