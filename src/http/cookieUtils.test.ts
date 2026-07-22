import type { IncomingMessage } from "node:http";

import { describe, expect, it } from "vitest";

import { getCookie } from "./cookieUtils";

describe("getCookie", () => {
  it("returns null for a malformed percent-encoded cookie", () => {
    const request = { headers: { cookie: "refresh_token=%" } } as IncomingMessage;

    expect(getCookie(request, "refresh_token")).toBeNull();
  });
});
