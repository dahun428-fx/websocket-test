import { z } from "zod";

import type { ApplicationEvent } from "../application/events/applicationEvent";

const eventBase = {
  eventId: z.string().uuid(),
  occurredAt: z.string().datetime(),
};

const applicationEventSchema = z.discriminatedUnion("name", [
  z.object({
    ...eventBase,
    name: z.literal("UserCreated"),
    payload: z.object({
      userId: z.string().min(1),
      loginId: z.string().min(1),
      nickname: z.string().min(1),
      createdAt: z.string().datetime(),
    }),
  }),
  z.object({
    ...eventBase,
    name: z.literal("RoomCreated"),
    payload: z.object({
      roomId: z.string().min(1),
      ownerId: z.string().min(1),
      name: z.string().min(1),
      createdAt: z.string().datetime(),
    }),
  }),
  z.object({
    ...eventBase,
    name: z.literal("MessageCreated"),
    payload: z.object({
      messageId: z.string().min(1),
      roomId: z.string().min(1),
      userId: z.string().min(1),
      createdAt: z.string().datetime(),
    }),
  }),
]);

export class InvalidOutboxPayloadError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("Outbox event payload is invalid.", {
      cause: options?.cause,
    });
    this.name = "InvalidOutboxPayloadError";
  }
}

export function serializeApplicationEvent(event: ApplicationEvent): string {
  return JSON.stringify(event);
}

export function deserializeApplicationEvent(
  serialized: string,
): ApplicationEvent {
  let parsed: unknown;

  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new InvalidOutboxPayloadError({ cause: error });
  }

  const result = applicationEventSchema.safeParse(parsed);
  if (!result.success) {
    throw new InvalidOutboxPayloadError({ cause: result.error });
  }

  return result.data;
}
