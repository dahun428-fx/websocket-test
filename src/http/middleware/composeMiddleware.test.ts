import { describe, expect, it } from "vitest";

import type { HttpContext } from "../context/httpContext";
import { composeMiddleware } from "./composeMiddleware";
import type { Middleware, RouteHandler } from "./middleware";

describe("composeMiddleware", () => {
  it("runs middleware in registration order", async () => {
    const calls: string[] = [];
    const first: Middleware = async (_context, next) => {
      calls.push("first-before");
      await next();
      calls.push("first-after");
    };
    const second: Middleware = async (_context, next) => {
      calls.push("second-before");
      await next();
      calls.push("second-after");
    };
    const handler: RouteHandler = async () => {
      calls.push("handler");
    };

    await composeMiddleware([first, second], handler)({} as HttpContext);

    expect(calls).toEqual([
      "first-before",
      "second-before",
      "handler",
      "second-after",
      "first-after",
    ]);
  });

  it("rejects when next is called more than once", async () => {
    const invalid: Middleware = async (_context, next) => {
      await next();
      await next();
    };

    await expect(
      composeMiddleware([invalid], async () => undefined)({} as HttpContext),
    ).rejects.toThrow("next() was called multiple times");
  });
});
