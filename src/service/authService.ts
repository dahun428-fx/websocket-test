import { verifyPassword } from "../auth/passwordService";
import { createAccessToken } from "../auth/tokenService";
import type { UserRepository } from "../repositories/userRepository";

export interface AuthenticatedUser {
  userId: string;
  nickname: string;
}

export interface LoginResult {
  accessToken: string;
  user: AuthenticatedUser;
}

export interface AuthService {
  login(userId: string, password: string): Promise<LoginResult | null>;
}

export function createAuthService(userRepository: UserRepository): AuthService {
  async function login(
    userId: string,
    password: string,
  ): Promise<LoginResult | null> {
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
  return {
    login,
  };
}
