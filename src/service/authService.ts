import { hashPassword, verifyPassword } from "../auth/passwordService";
import { createAccessToken } from "../auth/tokenService";
import {
  UserAlreadyExistsError,
  type UserRepository,
} from "../repositories/userRepository";
import { AuthResponse } from "../types/auth";

export type AuthResult = AuthResponse;
export interface SingupInput {
  userId: string;
  nickname: string;
  password: string;
}

export type SignupResult =
  | { success: true; data: AuthResult }
  | { success: false; reason: "USER_ID_ALREADY_EXISTS" };

export interface AuthService {
  login(userId: string, password: string): Promise<AuthResult | null>;
  signup(input: SingupInput): Promise<SignupResult | null>;
}

export function createAuthService(userRepository: UserRepository): AuthService {
  async function login(
    userId: string,
    password: string,
  ): Promise<AuthResult | null> {
    const user = await userRepository.findById(userId);

    if (!user) return null;

    const passwordMatched = await verifyPassword(password, user.passwordHash);

    if (!passwordMatched) {
      return null;
    }

    return {
      accessToken: createAccessToken(user.id, user.nickname),
      user: {
        userId: user.id,
        nickname: user.nickname,
      },
    };
  }

  async function signup(input: SingupInput): Promise<SignupResult> {
    const exists = await userRepository.existsById(input.userId);
    if (exists) {
      return {
        success: false,
        reason: "USER_ID_ALREADY_EXISTS",
      };
    }
    const { userId, nickname, password } = input;
    const passwordHash = await hashPassword(password);

    try {
      const user = await userRepository.create({
        id: userId,
        nickname: nickname,
        passwordHash,
        createdAt: new Date().toISOString(),
      });

      return {
        success: true,

        data: {
          accessToken: createAccessToken(user.id, user.nickname),

          user: {
            userId: user.id,
            nickname: user.nickname,
          },
        },
      };
    } catch (error) {
      if (error instanceof UserAlreadyExistsError) {
        return {
          success: false,
          reason: "USER_ID_ALREADY_EXISTS",
        };
      }

      throw error;
    }
  }

  return {
    login,
    signup,
  };
}
