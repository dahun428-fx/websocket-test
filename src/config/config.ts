import { EnvironmentVariables, envSchema } from "./envSchema";

export interface AppConfig {
    environment: | "development" | "test" | "production";
    server: {
        host: string;
        port: number;
    }
    database: {
        path: string;
    }
    auth: {
        accessToken: {
            secret: string;
            expiresIn: string;
        }
        refreshToken: {
            secret: string;
            expiresIn: string;
            cookie: {
                name: string;
                maxAgeSeconds: number;
                secure: boolean;
            }
        }
    }
    rateLimit: {
        maxAttempts: number;
        windowMs: number;
    },
    heartbeat: {
        interval_ms: number;
        debug: boolean;
    }
    seed: {
        userPassword?: string;
    }
}

export function createConfig(
    source: NodeJS.ProcessEnv = process.env
): AppConfig {
    const result = envSchema.safeParse(source);

    if (!result.success) {
        const message = result.error.issues.map(
            (issue) => `${issue.path.join(".")}: ${issue.message}`
        ).join("\n")

        throw new Error(
            `환경변수 검증에 실패했습니다.\n${message}`
        )
    }
    return mapEnvironmentToConfig(
        result.data
    )

}

function mapEnvironmentToConfig(env: EnvironmentVariables): AppConfig {
    return {
        environment: env.NODE_ENV,
        server: {
            host: env.HOST,
            port: env.PORT,
        },
        database: {
            path: env.DATABASE_PATH
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
                    secure: env.NODE_ENV === "production"
                }
            }
        },
        rateLimit: {
            maxAttempts: env.AUTH_RATE_LIMIT_MAX_ATTEMPTS,
            windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS
        },
        heartbeat: {
            interval_ms: env.HEARTBEAT_INTERVAL_MS,
            debug: env.HEARTBEAT_DEBUG,
        },
        seed: {
            userPassword: env.SEED_USER_PASSWORD,
        }
    }
}
