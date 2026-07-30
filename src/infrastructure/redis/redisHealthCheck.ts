import type { RedisClients } from "./redisClients";

export interface DependencyHealth {
  status: "up" | "down" | "disabled";
  checkedAt: string;
  latencyMs: number | null;
  error: string | null;
}

export async function checkRedisHealth(input: {
  enabled: boolean;
  client: RedisClients["command"];
  timeoutMs: number;
}): Promise<DependencyHealth> {
  const checkedAt = new Date().toISOString();
  if (!input.enabled) {
    return {
      status: "disabled",
      checkedAt,
      latencyMs: null,
      error: null,
    };
  }

  const startedAt = performance.now();
  try {
    if (!input.client.isReady) {
      throw new Error("Redis client is not ready.");
    }

    const result = await withTimeout(
      input.client.ping(),
      input.timeoutMs,
      "Redis health check timed out.",
    );
    if (result !== "PONG") {
      throw new Error(`Unexpected Redis ping response: ${result}`);
    }

    return {
      status: "up",
      checkedAt,
      latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
      error: null,
    };
  } catch (error) {
    return {
      status: "down",
      checkedAt,
      latencyMs: null,
      error: error instanceof Error ? error.message : "Unknown Redis error",
    };
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
