import type { EnvironmentVariables } from "./envSchema";
import { envSchema } from "./envSchema";

export interface RedisConfig {
  enabled: boolean;
  required: boolean;
  url: string;
  keyPrefix: string;
  connectTimeoutMs: number;
  commandTimeoutMs: number;
  reconnect: {
    baseDelayMs: number;
    maximumDelayMs: number;
    maximumRetries: number;
  };
  presence: {
    ttlSeconds: number;
    heartbeatIntervalMs: number;
  };
}

export interface AppConfig {
  environment: "development" | "test" | "production";
  logging: {
    level: "debug" | "info" | "warn" | "error";
  };
  server: {
    host: string;
    port: number;
    trustProxy: boolean;
  };
  database: {
    path: string;
  };
  auth: {
    accessToken: {
      secret: string;
      expiresIn: string;
    };
    refreshToken: {
      secret: string;
      expiresIn: string;
      cookie: {
        name: string;
        maxAgeSeconds: number;
        secure: boolean;
      };
    };
  };
  rateLimit: {
    maxAttempts: number;
    windowMs: number;
    failMode: "open" | "closed";
  };
  cache: {
    roomTtlSeconds: number;
  };
  heartbeat: {
    interval_ms: number;
    debug: boolean;
  };
  outbox: {
    enabled: boolean;
    pollingIntervalMs: number;
    batchSize: number;
    maximumAttempts: number;
    staleProcessingMs: number;
    retryBaseDelayMs: number;
    retryMaximumDelayMs: number;
  };
  redis: RedisConfig;
  identity: {
    serverId?: string;
  };
  seed: {
    userPassword?: string;
  };
}

export function createConfig(
  source: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`환경변수 검증에 실패했습니다.\n${message}`);
  }

  return mapEnvironmentToConfig(result.data);
}

function mapEnvironmentToConfig(env: EnvironmentVariables): AppConfig {
  return {
    environment: env.NODE_ENV,
    logging: {
      level: env.LOG_LEVEL,
    },
    server: {
      host: env.HOST,
      port: env.PORT,
      trustProxy: env.TRUST_PROXY,
    },
    database: {
      path: env.DATABASE_PATH,
    },
    auth: {
      accessToken: {
        secret: env.JWT_ACCESS_SECRET,
        expiresIn: env.JWT_ACCESS_EXPIRES_IN,
      },
      refreshToken: {
        secret: env.JWT_REFRESH_SECRET,
        expiresIn: env.JWT_REFRESH_EXPIRES_IN,
        cookie: {
          name: env.REFRESH_TOKEN_COOKIE_NAME,
          maxAgeSeconds: env.REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS,
          secure: env.NODE_ENV === "production",
        },
      },
    },
    rateLimit: {
      maxAttempts: env.AUTH_RATE_LIMIT_MAX_ATTEMPTS,
      windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
      failMode: env.RATE_LIMIT_FAIL_MODE,
    },
    cache: {
      roomTtlSeconds: env.CACHE_ROOM_TTL_SECONDS,
    },
    heartbeat: {
      interval_ms: env.HEARTBEAT_INTERVAL_MS,
      debug: env.HEARTBEAT_DEBUG,
    },
    outbox: {
      enabled: env.OUTBOX_WORKER_ENABLED,
      pollingIntervalMs: env.OUTBOX_POLLING_INTERVAL_MS,
      batchSize: env.OUTBOX_BATCH_SIZE,
      maximumAttempts: env.OUTBOX_MAXIMUM_ATTEMPTS,
      staleProcessingMs: env.OUTBOX_STALE_PROCESSING_MS,
      retryBaseDelayMs: env.OUTBOX_RETRY_BASE_DELAY_MS,
      retryMaximumDelayMs: env.OUTBOX_RETRY_MAXIMUM_DELAY_MS,
    },
    redis: {
      enabled: env.REDIS_ENABLED,
      required: env.REDIS_REQUIRED,
      url: env.REDIS_URL,
      keyPrefix: env.REDIS_KEY_PREFIX ?? `chat-app:${env.NODE_ENV}`,
      connectTimeoutMs: env.REDIS_CONNECT_TIMEOUT_MS,
      commandTimeoutMs: env.REDIS_COMMAND_TIMEOUT_MS,
      reconnect: {
        baseDelayMs: env.REDIS_RECONNECT_BASE_DELAY_MS,
        maximumDelayMs: env.REDIS_RECONNECT_MAXIMUM_DELAY_MS,
        maximumRetries: env.REDIS_RECONNECT_MAXIMUM_RETRIES,
      },
      presence: {
        ttlSeconds: env.REDIS_PRESENCE_TTL_SECONDS,
        heartbeatIntervalMs: env.REDIS_PRESENCE_HEARTBEAT_INTERVAL_MS,
      },
    },
    identity: {
      serverId: env.INSTANCE_ID,
    },
    seed: {
      userPassword: env.SEED_USER_PASSWORD,
    },
  };
}
