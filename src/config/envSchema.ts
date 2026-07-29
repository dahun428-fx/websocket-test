import { z } from "zod";

export const envSchema = z.object({
    NODE_ENV: z
        .enum([
            "development",
            "test",
            "production",
        ])
        .default("development"),

    PORT: z.coerce
        .number()
        .int()
        .min(1)
        .max(65_535)
        .default(3010),

    HOST: z
        .string()
        .default("127.0.0.1"),

    DATABASE_PATH: z
        .string()
        .min(1)
        .default("./data/chat.db"),

    JWT_ACCESS_SECRET: z
        .string()
        .min(
            32,
            "JWT_ACCESS_SECRET은 32자 이상이어야 합니다.",
        ),

    JWT_REFRESH_SECRET: z
        .string()
        .min(
            32,
            "JWT_REFRESH_SECRET은 32자 이상이어야 합니다.",
        ),

    JWT_ACCESS_EXPIRES_IN: z
        .string()
        .default("15m"),

    JWT_REFRESH_EXPIRES_IN: z
        .string()
        .default("7d"),

    REFRESH_TOKEN_COOKIE_NAME: z
        .string()
        .default("refresh_token"),

    REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS:
        z.coerce
            .number()
            .int()
            .positive()
            .default(604_800),

    AUTH_RATE_LIMIT_MAX_ATTEMPTS:
        z.coerce
            .number()
            .int()
            .positive()
            .default(5),

    AUTH_RATE_LIMIT_WINDOW_MS:
        z.coerce
            .number()
            .int()
            .positive()
            .default(60_000),

    HEARTBEAT_INTERVAL_MS:
        z.coerce
            .number()
            .int()
            .positive()
            .default(30_000),

    HEARTBEAT_DEBUG: z
        .enum(["true", "false"])
        .default("false")
        .transform((value) => value === "true"),

    OUTBOX_WORKER_ENABLED: z
        .enum(["true", "false"])
        .default("true")
        .transform((value) => value === "true"),

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

    SEED_USER_PASSWORD: z
        .string()
        .min(1)
        .optional(),

    LOG_LEVEL: z.enum([
        "debug", "info", "warn", "error"
    ]).default("info")
});

export type EnvironmentVariables =
    z.infer<typeof envSchema>;
