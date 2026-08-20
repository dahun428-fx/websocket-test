import { Counter, Histogram, Registry } from "prom-client";
import { Metrics } from "./metrics";

export function createPrometheusMetrics(): Metrics {

    const registry = new Registry();

    const httpRequests = new Counter({
        name: "http_requests_total",
        help: "Total number of HTTP requests",
        labelNames: [
            "method",
            "path",
            "status_code",
        ] as const,
        registers: [registry],
    })

    const httpRequestDuration = new Histogram({
        name: "http_request_duration_seconds",
        help: "HTTP request duration in seconds",
        labelNames: [
            "method",
            "path",
            "status_code",
        ] as const,
        registers: [registry]
    })

    function recordHttpRequest(input: {
        method: string;
        path: string;
        statusCode: number;
        durationSeconds: number;
    }): void {
        const labels = {
            method: input.method,
            path: input.path,
            status_code: String(input.statusCode)
        }

        httpRequests.inc(labels)

        httpRequestDuration.observe(
            labels,
            input.durationSeconds,
        )

    }

    async function collect(): Promise<string> {
        return registry.metrics();
    }

    function contentType(): string {
        return registry.contentType;
    }

    return {
        recordHttpRequest,
        collect,
        contentType,
    }

}