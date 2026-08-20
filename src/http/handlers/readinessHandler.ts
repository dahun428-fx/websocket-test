import type { ReadinessService } from "../../health/readinessService";
import type { HttpHandler } from "../httpHandler";

export function createReadinessHandler(
    readinessService: ReadinessService,
): HttpHandler {
    return async (context) => {
        const result = await readinessService.check();

        context.json(result.status === "ready" ? 200 : 503, result);
    };
}
