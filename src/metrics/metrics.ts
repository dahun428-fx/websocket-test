export interface Metrics {
    recordHttpRequest(input: {
        method: string;
        path: string;
        statusCode: number;
        durationSeconds: number;
    }): void;
    contentType(): string;
    collect(): Promise<string>

    webSocketConnectionOpened(): void;
    webSocketConnectionClosed(): void;

    webSocketMessageReceived(): void;
    webSocketMessageParseFailed(): void;
    webSocketMessageHandlingFailed(
        kind: "application" | "unexpected"
    ): void;

    webSocketMessageSent(source: "direct" | "broadcast"): void;
    webSocketMessageSendFailed(source: "direct" | "broadcast"): void;

}