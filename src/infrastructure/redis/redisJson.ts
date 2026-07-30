import type { ZodType } from "zod";

export class InvalidRedisJsonError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("Redis JSON payload is invalid.", { cause: options?.cause });
    this.name = "InvalidRedisJsonError";
  }
}

export function serializeRedisJson(value: unknown): string {
  return JSON.stringify(value);
}

export function parseRedisJson<T>(
  serialized: string,
  schema: ZodType<T>,
): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new InvalidRedisJsonError({ cause: error });
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new InvalidRedisJsonError({ cause: result.error });
  }
  return result.data;
}
