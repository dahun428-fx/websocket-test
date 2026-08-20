import { Metrics } from "../../metrics/metrics";
import { Middleware } from "./middleware";

export function metricsMiddleware(metrics: Metrics): Middleware {
    return async function recordMetrics(context, next): Promise<void> {
        const startedAt = performance.now();

        try {
            await next();
        } finally {
            const durationSeconds = (performance.now() - startedAt) / 1000;

            metrics.recordHttpRequest({
                method: context.method,
                path: context.routePattern ?? "unmacted",
                statusCode: context.res.statusCode,
                durationSeconds,
            })

        }

    }
}