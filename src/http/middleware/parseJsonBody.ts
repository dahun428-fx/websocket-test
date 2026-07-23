import { HttpError } from "../errors/httpError";
import { Middleware } from "./middleware";

interface ParseJsonBodyOptions {
    maximumBytes?: number;
}

export function parseJsonBody(options: ParseJsonBodyOptions = {}): Middleware {
    const maximumBytes = options.maximumBytes ?? 1024 * 1024;

    return async function parseJsonBodyMiddleware(context, next): Promise<void> {
        const contentType = context.req.headers["content-type"]

        if (!contentType?.toLowerCase().includes("application/json")) {
            throw new HttpError({
                statusCode: 415,
                code: "UNSUPPORTED_MEDIA_TYPE",
                message: "Content-Type은 application/json이어야 합니다."
            })
        }

        const chunks: Buffer[] = [];
        let totalBytes = 0;

        for await (const chunk of context.req) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
            totalBytes += buffer.length

            if (totalBytes > maximumBytes) {
                throw new HttpError({
                    statusCode: 413,
                    code: "REQUEST_BODY_TOO_LARGE",
                    message: "요청 본문이 너무 큽니다."
                });
            }
            chunks.push(buffer)
        }

        const rawBody = Buffer.concat(chunks).toString("utf-8");
        if (!rawBody.trim()) {
            context.body = {}
            await next();
            return;
        }

        try {
            context.body = JSON.parse(rawBody);
        } catch {
            throw new HttpError({
                statusCode: 400,
                code: "INVALID_JSON",
                message: "올바른 JSON 형식이 아닙니다."
            })
        }

        await next();
    }

}