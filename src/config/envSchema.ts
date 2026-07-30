import { z } from "zod";

function booleanString(defaultValue: "true" | "false") {
  return z
    .enum(["true", "false"])
    .default(defaultValue)
    .transform((value) => value === "true");
}

export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3010),
  HOST: z.string().default("127.0.0.1"),
  DATABASE_PATH: z.string().min(1).default("./data/chat.db"),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, "JWT_ACCESS_SECRET은 32자 이상이어야 합니다."),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, "JWT_REFRESH_SECRET은 32자 이상이어야 합니다."),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  REFRESH_TOKEN_COOKIE_NAME: z.string().default("refresh_token"),
  REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(604_800),
  AUTH_RATE_LIMIT_MAX_ATTEMPTS: z.coerce
    .number()
    .int()
    .positive()
    .default(5),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60_000),
  HEARTBEAT_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(30_000),
  HEARTBEAT_DEBUG: booleanString("false"),
  OUTBOX_WORKER_ENABLED: booleanString("true"),
  OUTBOX_POLLING_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(1_000),
  OUTBOX_BATCH_SIZE: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20),
  OUTBOX_MAXIMUM_ATTEMPTS: z.coerce
    .number()
    .int()
    .min(1)
    .default(5),
  OUTBOX_STALE_PROCESSING_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(30_000),
  OUTBOX_RETRY_BASE_DELAY_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(1_000),
  OUTBOX_RETRY_MAXIMUM_DELAY_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60_000),
  REDIS_ENABLED: booleanString("false"),
  REDIS_REQUIRED: booleanString("false"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  REDIS_KEY_PREFIX: z.string().trim().min(1).optional(),
  REDIS_CONNECT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(5_000),
  REDIS_COMMAND_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(2_000),
  REDIS_RECONNECT_BASE_DELAY_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(100),
  REDIS_RECONNECT_MAXIMUM_DELAY_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(3_000),
  REDIS_RECONNECT_MAXIMUM_RETRIES: z.coerce
    .number()
    .int()
    .min(0)
    .default(20),
  REDIS_PRESENCE_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(30),
  REDIS_PRESENCE_HEARTBEAT_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(10_000),
  INSTANCE_ID: z.string().trim().min(1).optional(),
  SEED_USER_PASSWORD: z.string().min(1).optional(),
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),
}).superRefine((env, context) => {
  if (env.REDIS_REQUIRED && !env.REDIS_ENABLED) {
    context.addIssue({
      code: "custom",
      path: ["REDIS_REQUIRED"],
      message: "REDIS_REQUIRED=true이면 REDIS_ENABLED=true여야 합니다.",
    });
  }

  if (
    env.REDIS_PRESENCE_HEARTBEAT_INTERVAL_MS >=
    env.REDIS_PRESENCE_TTL_SECONDS * 1_000
  ) {
    context.addIssue({
      code: "custom",
      path: ["REDIS_PRESENCE_HEARTBEAT_INTERVAL_MS"],
      message: "Redis Presence heartbeat은 TTL보다 짧아야 합니다.",
    });
  }

  if (
    env.REDIS_RECONNECT_BASE_DELAY_MS >
    env.REDIS_RECONNECT_MAXIMUM_DELAY_MS
  ) {
    context.addIssue({
      code: "custom",
      path: ["REDIS_RECONNECT_BASE_DELAY_MS"],
      message: "Redis 재연결 기본 지연은 최대 지연보다 클 수 없습니다.",
    });
  }
});

export type EnvironmentVariables = z.infer<typeof envSchema>;
