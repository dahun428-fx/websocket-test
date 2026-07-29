import {
  hashPassword as defaultHashPassword,
} from "../../auth/passwordService";
import { hashRefreshToken } from "../../auth/refreshTokenHash";
import type { TokenService } from "../../auth/tokenService";
import type { RefreshTokenRepository } from "../../repositories/refreshTokenRepository";
import type { OutboxEventPublisher } from "../../outbox/outboxEventPublisher";
import {
  DuplicateUserIdRepositoryError,
  type UserRepository,
} from "../../repositories/userRepository";
import { UserAlreadyExistsError } from "../errors/authErrors";
import { createUserCreatedEvent } from "../events/userEvents";
import type { UnitOfWork } from "../unitOfWork";

export interface CreateUserCommand {
  userId: string;
  nickname: string;
  password: string;
}

export interface CreateUserResult {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  user: {
    userId: string;
    nickname: string;
  };
}

export interface CreateUserUseCase {
  execute(command: CreateUserCommand): Promise<CreateUserResult>;
}

export interface CreateUserUseCaseOptions {
  userRepository: UserRepository;
  refreshTokenRepository: RefreshTokenRepository;
  tokenService: TokenService;
  unitOfWork: UnitOfWork;
  outboxEventPublisher: OutboxEventPublisher;
  passwordService?: {
    hashPassword(password: string): Promise<string>;
  };
  runtime?: {
    now?: () => Date;
  };
}

export function createUserUseCase(
  options: CreateUserUseCaseOptions,
): CreateUserUseCase {
  const hashPassword =
    options.passwordService?.hashPassword ?? defaultHashPassword;

  async function execute(
    command: CreateUserCommand,
  ): Promise<CreateUserResult> {
    const passwordHash = await hashPassword(command.password);
    const createdAt = (options.runtime?.now?.() ?? new Date()).toISOString();
    const refreshToken = options.tokenService.createRefreshToken(command.userId);
    const result: CreateUserResult = {
      accessToken: options.tokenService.createAccessToken(
        command.userId,
        command.nickname,
      ),
      refreshToken: refreshToken.token,
      refreshTokenExpiresAt: refreshToken.expiresAt,
      user: {
        userId: command.userId,
        nickname: command.nickname,
      },
    };

    try {
      await options.unitOfWork.run(async () => {
        await options.userRepository.create({
          id: command.userId,
          nickname: command.nickname,
          passwordHash,
          createdAt,
        });
        await options.refreshTokenRepository.save({
          tokenId: refreshToken.tokenId,
          tokenHash: hashRefreshToken(refreshToken.token),
          userId: command.userId,
          createdAt,
          expiresAt: refreshToken.expiresAt,
        });
        await options.outboxEventPublisher.enqueue(createUserCreatedEvent({
          userId: command.userId,
          loginId: command.userId,
          nickname: command.nickname,
          createdAt,
        }));
      });
    } catch (error) {
      if (error instanceof DuplicateUserIdRepositoryError) {
        throw new UserAlreadyExistsError(command.userId, { cause: error });
      }
      throw error;
    }

    return result;
  }

  return { execute };
}
