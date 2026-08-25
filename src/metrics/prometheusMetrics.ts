import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from "prom-client";
import { Metrics } from "./metrics";

export function createPrometheusMetrics(): Metrics {

    const registry = new Registry();
    collectDefaultMetrics({
        register: registry,
    })

    const webSocketConnections = new Gauge({
        name: "websocket_connections",
        help: "Current number of active WebSocket connections",
        registers: [registry],
    })

    const webSocketMessagesReceived = new Counter({
        name: "websocket_messages_received_total",
        help: "Total number of received WebSocket messages",
        registers: [registry],
    })

    const webSocketMessagesParseFailures = new Counter({
        name: "websocket_message_parse_failures_total",
        help: "Total number of WebSocket message parse failures",
        registers: [registry]
    })

    const webSocketMessagesHandlingFailures = new Counter({
        name: "websocket_message_handling_failures_total",
        help: "Total number of WebSocket message handling failures",
        labelNames: ["kind"] as const,
        registers: [registry]
    })

    const webSocketMessagesSent = new Counter({
        name: "websocket_messages_sent_total",
        help: "Total number of successfully sent WebSocket messages",
        labelNames: ["source"] as const,
        registers: [registry]
    })

    const webSocketMessageSendFailures = new Counter({
        name: "websocket_message_send_failures_total",
        help: "Total number of failed WebSocket message sends",
        labelNames: ["source"] as const,
        registers: [registry]
    })

    const outboxEventsProcessed = new Counter({
        name: "outbox_events_processed_total",
        help: "Total number of successfully processed outbox events",
        registers: [registry]
    })

    const outboxEventRetries = new Counter({
        name: "outbox_event_retries_total",
        help: "Total number of outbox event retries",
        registers: [registry],
    })

    const outboxEventsFailed = new Counter({
        name: "outbox_events_failed_total",
        help: "Total number of permanently failed outbox events",
        registers: [],
    })

    const outboxEventsRecovered = new Counter({
        name: "outbox_events_recovered_total",
        help: "Total number of recovered stale outbox events",
        registers: [registry]
    })

    const outboxPendingEvents = new Gauge({
        name: "outbox_pending_events",
        help: "Current number of pending oubox events",
        registers: [registry],
    })

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

    function webSocketConnectionOpened(): void {
        webSocketConnections.inc();
    }

    function webSocketConnectionClosed(): void {
        webSocketConnections.dec();
    }

    function webSocketMessageReceived(): void {
        webSocketMessagesReceived.inc();
    }

    function webSocketMessageParseFailed(): void {
        webSocketMessagesParseFailures.inc();
    }

    function webSocketMessageHandlingFailed(kind: "application" | "unexpected"): void {
        webSocketMessagesHandlingFailures.inc({ kind })
    }

    function webSocketMessageSent(source: "direct" | "broadcast"): void {
        webSocketMessagesSent.inc({ source })
    }

    function webSocketMessageSendFailed(source: "direct" | "broadcast"): void {
        webSocketMessageSendFailures.inc({ source })
    }

    function outboxEventProcessed(): void {
        outboxEventsProcessed.inc();
    }

    function outboxEventRetried(): void {
        outboxEventRetries.inc()
    }

    function outboxEventFailed(): void {
        outboxEventsFailed.inc();
    }

    function outboxEventRecovered(count: number): void {
        outboxEventsRecovered.inc(count)
    }

    function setOutboxPendingEvents(count: number): void {
        outboxPendingEvents.set(count)
    }


    return {
        recordHttpRequest,
        collect,
        contentType,
        webSocketConnectionClosed,
        webSocketConnectionOpened,
        webSocketMessageReceived,
        webSocketMessageParseFailed,
        webSocketMessageHandlingFailed,
        webSocketMessageSent,
        webSocketMessageSendFailed,
        outboxEventFailed,
        outboxEventProcessed,
        outboxEventRetried,
        outboxEventRecovered,
        setOutboxPendingEvents,
    }

}