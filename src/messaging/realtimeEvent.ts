import { z } from "zod";

export interface MessageBroadcastEvent {
  eventId: string;
  type: "message.broadcast";
  occurredAt: string;
  sourceServerId: string;
  payload: {
    messageId: string;
    roomId: string;
    userId: string;
  };
}

export interface PresenceChangedEvent {
  eventId: string;
  type: "presence.changed";
  occurredAt: string;
  sourceServerId: string;
  payload: {
    userId: string;
    status: "online" | "offline";
  };
}

export type RealtimeEvent =
  | MessageBroadcastEvent
  | PresenceChangedEvent;

const realtimeEventSchema = z.discriminatedUnion("type", [
  z.object({
    eventId: z.string().uuid(),
    type: z.literal("message.broadcast"),
    occurredAt: z.string().datetime(),
    sourceServerId: z.string().min(1),
    payload: z.object({
      messageId: z.string().min(1),
      roomId: z.string().min(1),
      userId: z.string().min(1),
    }).strict(),
  }).strict(),
  z.object({
    eventId: z.string().uuid(),
    type: z.literal("presence.changed"),
    occurredAt: z.string().datetime(),
    sourceServerId: z.string().min(1),
    payload: z.object({
      userId: z.string().min(1),
      status: z.enum(["online", "offline"]),
    }).strict(),
  }).strict(),
]);

export class InvalidRealtimeEventError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("Realtime event payload is invalid.", { cause: options?.cause });
    this.name = "InvalidRealtimeEventError";
  }
}

export function serializeRealtimeEvent(event: RealtimeEvent): string {
  return JSON.stringify(event);
}

export function deserializeRealtimeEvent(serialized: string): RealtimeEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new InvalidRealtimeEventError({ cause: error });
  }

  const result = realtimeEventSchema.safeParse(parsed);
  if (!result.success) {
    throw new InvalidRealtimeEventError({ cause: result.error });
  }
  return result.data;
}
