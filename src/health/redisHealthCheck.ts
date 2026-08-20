import type { RedisClientType } from "redis";

import { checkRedisHealth } from "../infrastructure/redis/redisHealthCheck";
import type { HealthCheck, HealthCheckResult } from "./health";

interface CreateRedisHealthCheckOptions {
    redis: RedisClientType;
    /** REDIS_ENABLED=false 이면 ping 하지 않고 "disabled"로 응답한다. */
    enabled: boolean;
    /** Redis가 응답하지 않을 때 health check가 매달리지 않도록 하는 상한. */
    timeoutMs: number;
}

export function createRedisHealthCheck(
    options: CreateRedisHealthCheckOptions,
): HealthCheck {
    async function check(): Promise<HealthCheckResult> {
        return checkRedisHealth({
            enabled: options.enabled,
            client: options.redis,
            timeoutMs: options.timeoutMs,
        });
    }

    return { check };
}
