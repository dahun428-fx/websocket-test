import type { IncomingMessage } from "node:http";

import { describe, expect, it } from "vitest";

import { getClientIp } from "./clientIp";

function requestWith(input: {
  remoteAddress?: string;
  forwardedFor?: string | string[];
}): IncomingMessage {
  return {
    headers: { "x-forwarded-for": input.forwardedFor },
    socket: { remoteAddress: input.remoteAddress },
  } as unknown as IncomingMessage;
}

describe("getClientIp", () => {
  it("ignores a spoofable forwarded header when proxy trust is disabled", () => {
    expect(getClientIp(requestWith({
      remoteAddress: "127.0.0.1",
      forwardedFor: "203.0.113.4",
    }), { trustProxy: false })).toBe("127.0.0.1");
  });

  it("uses the first forwarded address when proxy trust is enabled", () => {
    expect(getClientIp(requestWith({
      remoteAddress: "10.0.0.1",
      forwardedFor: "203.0.113.4, 10.0.0.2",
    }), { trustProxy: true })).toBe("203.0.113.4");
  });
});
