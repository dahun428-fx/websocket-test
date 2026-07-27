import { describe, expect, it } from "vitest";

import { matchRoute } from "./routeMatcher";

describe("matchRoute", () => {
  it("extracts decoded path parameters", () => {
    expect(matchRoute("/rooms/:roomId", "/rooms/room%20123")).toEqual({
      matched: true,
      params: { roomId: "room 123" },
    });
  });

  it("does not match a different path", () => {
    expect(matchRoute("/rooms/:roomId", "/users/user-1")).toEqual({
      matched: false,
      params: {},
    });
  });

  it("does not throw for malformed encoded parameters", () => {
    expect(matchRoute("/rooms/:roomId", "/rooms/%E0%A4%A")).toEqual({
      matched: false,
      params: {},
    });
  });
});
