import type { DatabaseConnection } from "../database/database";
import type { HealthCheck, HealthCheckResult } from "./health";

interface CreateDatabaseHealthCheckOptions {
    database: Pick<DatabaseConnection, "get">;
}

export function createDatabaseHealthCheck(
    options: CreateDatabaseHealthCheckOptions,
): HealthCheck {
    const { database } = options;

    async function check(): Promise<HealthCheckResult> {
        const startedAt = performance.now();

        try {
            const result = await database.get<{ ok: number }>("SELECT 1 AS ok");

            if (result?.ok !== 1) {
                throw new Error("Unexpected database health check result");
            }

            return {
                status: "up",
                checkedAt: new Date().toISOString(),
                latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
                error: null,
            };
        } catch (error) {
            return {
                status: "down",
                checkedAt: new Date().toISOString(),
                latencyMs: null,
                error:
                    error instanceof Error ? error.message : "Unknown database error",
            };
        }
    }

    return { check };
}
