import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./passwordService";

describe("passwordService", () => {
  it("hashes a password and verifies the original password", async () => {
    const passwordHash = await hashPassword("test1234");

    expect(passwordHash).not.toBe("test1234");
    await expect(verifyPassword("test1234", passwordHash)).resolves.toBe(true);
  });

  it("rejects a different password for the same hash", async () => {
    const passwordHash = await hashPassword("test1234");

    await expect(verifyPassword("wrong-password", passwordHash)).resolves.toBe(false);
  });
});
