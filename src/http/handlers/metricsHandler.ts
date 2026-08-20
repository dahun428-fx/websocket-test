import { Metrics } from "../../metrics/metrics";
import { RouteHandler } from "../middleware/middleware";

export function createMetricsHandler(metrics: Metrics): RouteHandler {
    return async (context) => {
        const body = await metrics.collect();

        context.setHeader(
            "Content-Type",
            metrics.contentType()
        )
        context.res.statusCode = 200;
        context.res.end(body);
    }
}