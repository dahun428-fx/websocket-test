import { readFile } from "node:fs/promises";

import type { RouteHandler } from "../middleware/middleware";

export function createPublicIndexHandler(publicIndexPath: string): RouteHandler {
    return async function publicIndexHandler(context): Promise<void> {
        const content = await readFile(publicIndexPath);
        context.res.statusCode = 200;
        context.setHeader("Content-Type", "text/html; charset=utf-8");
        context.setHeader("Content-Length", String(content.byteLength));
        context.res.end(content);
    };
}
