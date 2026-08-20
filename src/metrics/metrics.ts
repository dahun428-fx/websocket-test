export interface Metrics {
    recordHttpRequest(input: {
        method: string;
        path: string;
        statusCode: number;
        durationSeconds: number;
    }): void;
    contentType(): string;
    collect(): Promise<string>
}