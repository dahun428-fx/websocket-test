import {
  hashPassword as defaultHashPassword,
  verifyPassword as defaultVerifyPassword,
} from "../auth/passwordService";
import { createAccessToken as defaultCreateAccessToken } from "../auth/tokenService";
import {
  UserAlreadyExistsError,
  type UserRepository,
} from "../repositories/userRepository";

const DUMMY_PASSWORD_HASH =
  "$2b$12$nqdy15ta1ILfCfH7nih9Tu5Vk3VVr/Mdp4Gu2ucu48iLUHvEouLu6";

export interface AuthenticatedUser {
  userId: string;
  nickname: string;
}

export interface AuthResult {
  accessToken: string;
  user: AuthenticatedUser;
}

export interface SignupInput {
  userId: string;
  nickname: string;
  password: string;
}

export type SignupResult =
  | { success: true; data: AuthResult }
  | { success: false; reason: "USER_ID_ALREADY_EXISTS" };

export interface AuthService {
  login(userId: string, password: string): Promise<AuthResult | null>;
  signup(input: SignupInput): Promise<SignupResult>;
}

export interface AuthServiceDependencies {
  verifyPassword(password: string, hash: string): Promise<boolean>;
  hashPassword(password: string): Promise<string>;
  createAccessToken(userId: string, nickname: string): string;
}

export function createAuthService(
  userRepository: UserRepository,
  overrides: Partial<AuthServiceDependencies> = {},
): AuthService {
  const dependencies: AuthServiceDependencies = {
    verifyPassword: defaultVerifyPassword,
    hashPassword: defaultHashPassword,
    createAccessToken: defaultCreateAccessToken,
    ...overrides,
  };

  async function login(userId: string, password: string): Promise<AuthResult | null> {
    const user = await userRepository.findById(userId);
    const passwordMatched = await dependencies.verifyPassword(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !passwordMatched) {
      return null;
    }

    return {
      accessToken: dependencies.createAccessToken(user.id, user.nickname),
      user: { userId: user.id, nickname: user.nickname },
    };
  }

  async function signup(input: SignupInput): Promise<SignupResult> {
    const passwordHash = await dependencies.hashPassword(input.password);

    try {
      const user = await userRepository.create({
        id: input.userId,
        nickname: input.nickname,
        passwordHash,
        createdAt: new Date().toISOString(),
      });

      return {
        success: true,
        data: {
          accessToken: dependencies.createAccessToken(user.id, user.nickname),
          user: { userId: user.id, nickname: user.nickname },
        },
      };
    } catch (error) {
      if (error instanceof UserAlreadyExistsError) {
        return { success: false, reason: "USER_ID_ALREADY_EXISTS" };
      }
      throw error;
    }
  }

  return { login, signup };
}
