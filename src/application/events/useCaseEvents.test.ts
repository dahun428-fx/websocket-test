import { describe, expect, it, vi } from "vitest";

import { createTokenService } from "../../auth/tokenService";
import type { RefreshTokenRepository } from "../../repositories/refreshTokenRepository";
import type { RoomMemberRepository } from "../../repositories/roomMemberRepository";
import type { RoomRepository } from "../../repositories/roomRepository";
import type { UserRepository } from "../../repositories/userRepository";
import { createAuthService } from "../../service/authService";
import type { EventBus } from "./eventBus";
import { createCreateRoomUseCase } from "../room/createRoom";

function createEventBus(
  publish: EventBus["publish"] = async () => undefined,
): EventBus {
  return {
    publish,
    subscribe: vi.fn(),
  };
}

function createTokenServiceForTest() {
  return createTokenService({
    accessTokenSecret: "access-test-secret",
    accessTokenExpiresIn: "15m",
    refreshTokenSecret: "refresh-test-secret",
    refreshTokenExpiresIn: "7d",
  });
}

function createRefreshTokenRepository(): RefreshTokenRepository {
  return {
    findByTokenId: vi.fn(async () => null),
    save: vi.fn(async (input) => input.tokenHash),
    revoke: vi.fn(async () => true),
  };
}

describe("use case domain events", () => {
  it("publishes UserCreated only after the signup transaction commits", async () => {
    let committed = false;
    const publish = vi.fn(async () => {
      expect(committed).toBe(true);
    });
    const userRepository: UserRepository = {
      findById: vi.fn(async () => null),
      create: vi.fn(async (input) => input),
    };
    const authService = createAuthService({
      userRepository,
      refreshTokenRepository: createRefreshTokenRepository(),
      tokenService: createTokenServiceForTest(),
      unitOfWork: {
        run: async (work) => {
          const result = await work();
          committed = true;
          return result;
        },
      },
      eventBus: createEventBus(publish),
      passwordService: {
        hashPassword: vi.fn(async () => "password-hash"),
      },
    });

    await authService.signup({
      userId: "user-1",
      nickname: "다훈",
      password: "password1234",
    });

    expect(publish).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      name: "UserCreated",
      payload: expect.objectContaining({
        userId: "user-1",
        loginId: "user-1",
        nickname: "다훈",
      }),
    }));
  });

  it("does not publish UserCreated when the signup transaction fails", async () => {
    const publish = vi.fn(async () => undefined);
    const authService = createAuthService({
      userRepository: {
        findById: vi.fn(async () => null),
        create: vi.fn(async (input) => input),
      },
      refreshTokenRepository: createRefreshTokenRepository(),
      tokenService: createTokenServiceForTest(),
      unitOfWork: {
        run: async () => {
          throw new Error("database failure");
        },
      },
      eventBus: createEventBus(publish),
      passwordService: {
        hashPassword: vi.fn(async () => "password-hash"),
      },
    });

    await expect(authService.signup({
      userId: "user-1",
      nickname: "다훈",
      password: "password1234",
    })).rejects.toThrow("database failure");

    expect(publish).not.toHaveBeenCalled();
  });

  it("publishes RoomCreated only after room and owner commit", async () => {
    let committed = false;
    const publish = vi.fn(async () => {
      expect(committed).toBe(true);
    });
    const roomRepository: RoomRepository = {
      create: vi.fn(async (input) => input),
      findById: vi.fn(async () => null),
    };
    const roomMemberRepository: RoomMemberRepository = {
      add: vi.fn(async (input) => input),
      find: vi.fn(async () => null),
    };
    const useCase = createCreateRoomUseCase({
      roomRepository,
      roomMemberRepository,
      unitOfWork: {
        run: async (work) => {
          const result = await work();
          committed = true;
          return result;
        },
      },
      eventBus: createEventBus(publish),
      runtime: {
        createId: () => "room-1",
        now: () => new Date("2026-07-27T00:00:00.000Z"),
      },
    });

    await useCase.execute({
      userId: "user-1",
      name: "테스트 방",
    });

    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      name: "RoomCreated",
      payload: {
        roomId: "room-1",
        ownerId: "user-1",
        name: "테스트 방",
        createdAt: "2026-07-27T00:00:00.000Z",
      },
    }));
  });
});
