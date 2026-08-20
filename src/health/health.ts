export type HealthStatus = "up" | "down" | "disabled";

/**
 * 개별 의존성(SQLite, Redis 등) 하나의 상태를 표현한다.
 * "이 의존성이 살아 있는가?"만 답하고, 서비스 정책은 판단하지 않는다.
 */
export interface HealthCheckResult {
    status: HealthStatus;
    checkedAt: string;
    latencyMs: number | null;
    error: string | null;
}

export interface HealthCheck {
    check(): Promise<HealthCheckResult>;
}
