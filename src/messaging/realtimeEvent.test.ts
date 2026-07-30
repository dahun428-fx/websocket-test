import { describe, expect, it } from "vitest";

import {
  deserializeRealtimeEvent,
  InvalidRealtimeEventError,
  serializeRealtimeEvent,
  type RealtimeEvent,
} from "./realtimeEvent";

describe("RealtimeEvent", () => {
  const event: RealtimeEvent = {
    eventId: "2b4f2577-5b54-457f-b1bd-4135b3dc1fb8",
    type: "message.broadcast",
    occurredAt: "2026-07-29T00:00:00.000Z",
    sourceServerId: "server-a",
    payload: {
      messageId: "1",
      roomId: "room-1",
      userId: "user-1",
    },
  };

  it("round-trips a valid event", () => {
    expect(deserializeRealtimeEvent(
      serializeRealtimeEvent(event),
    )).toEqual(event);
  });

  it.each([
    "not-json",
    JSON.stringify({ ...event, sourceServerId: "" }),
    JSON.stringify({ ...event, payload: { ...event.payload, token: "secret" } }),
  ])("rejects malformed or unexpected event payloads", (serialized) => {
    expect(() => deserializeRealtimeEvent(serialized))
      .toThrow(InvalidRealtimeEventError);
  });
});
