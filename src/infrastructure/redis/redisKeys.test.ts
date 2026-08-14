import { describe, expect, it } from "vitest";

import { createRedisKeys } from "./redisKeys";

describe("createRedisKeys", () => {
  it("creates a normalized login key from client IP and user ID", () => {
    const keys = createRedisKeys("websocket-test:local::");

    expect(keys.loginRateLimit({
      clientIp: "2001:db8::1",
      loginId: "User Name",
    })).toBe(
      "websocket-test:local:rate-limit:login:2001%3Adb8%3A%3A1:User%20Name",
    );
  });

  it("creates a versioned room cache key without double encoding", () => {
    expect(createRedisKeys("test::").roomCache("room / 1")).toBe(
      "test:cache:v1:room:room%20%2F%201",
    );
  });
});
