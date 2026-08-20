import type { HealthCheck, HealthCheckResult } from "./health";

export interface ReadinessResult {
    status: "ready" | "not_ready";
    checkedAt: string;
    dependencies: {
        database: HealthCheckResult;
        redis: HealthCheckResult;
    };
}

interface CreateReadinessServiceOptions {
    databaseHealthCheck: HealthCheck;
    redisHealthCheck: HealthCheck;
    /** Redis 장애 시 이 서버를 트래픽에서 제외할지 결정하는 정책. */
    redisRequired: boolean;
}

export interface ReadinessService {
    check(): Promise<ReadinessResult>;
}

export function createReadinessService(
    options: CreateReadinessServiceOptions,
): ReadinessService {
    async function check(): Promise<ReadinessResult> {
        const [database, redis] = await Promise.all([
            options.databaseHealthCheck.check(),
            options.redisHealthCheck.check(),
        ]);

        const databaseReady = database.status === "up";
        const redisReady = !options.redisRequired || redis.status === "up";

        return {
            status: databaseReady && redisReady ? "ready" : "not_ready",
            checkedAt: new Date().toISOString(),
            dependencies: { database, redis },
        };
    }

    return { check };
}
