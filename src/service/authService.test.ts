import { afterEach, describe, expect, it, vi } from "vitest";

import { verifyAccessToken } from "../auth/tokenService";
import type { UserRepository } from "../repositories/userRepository";
import { createAuthService } from "./authService";

const TEST_PASSWORD_HASH =
  "$2b$12$nqdy15ta1ILfCfH7nih9Tu5Vk3VVr/Mdp4Gu2ucu48iLUHvEouLu6";

function createUserRepository(): UserRepository {
  return {
    findById: vi.fn(async (userId) => {
      if (userId !== "user-100") {
        return null;
      }

      return {
        id: "user-100",
        nickname: "neo",
        passwordHash: TEST_PASSWORD_HASH,
      };
    }),
  };
}

afterEach(() => {
  delete process.env.JWT_SECRET;
});

describe("authService", () => {
  it("returns a login result with a verifiable access token for valid credentials", async () => {
    process.env.JWT_SECRET = "test-secret";
    const userRepository = createUserRepository();
    const authService = createAuthService(userRepository);

    const result = await authService.login("user-100", "test1234");

    expect(userRepository.findById).toHaveBeenCalledWith("user-100");
    expect(result).toEqual({
      accessToken: expect.any(String),
      user: {
        userId: "user-100",
        nickname: "neo",
      },
    });
    expect(verifyAccessToken(result?.accessToken ?? "")).toEqual({
      sub: "user-100",
      nickname: "neo",
    });
  });

  it("returns null for an unknown user", async () => {
    const authService = createAuthService(createUserRepository());

    await expect(authService.login("unknown-user", "test1234")).resolves.toBeNull();
  });

  it("returns null for an invalid password", async () => {
    const authService = createAuthService(createUserRepository());

    await expect(authService.login("user-100", "wrong-password")).resolves.toBeNull();
  });
});
