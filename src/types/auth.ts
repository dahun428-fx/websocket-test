export interface AuthTokenPayload {
  sub: string;
  nickname?: string;
}

export interface LoginRequest {
  userId: string;
  password: string;
}

export interface LoginErrorResponse {
  message: string;
}

export interface AuthenticatedUser {
  userId: string;
  nickname: string;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthenticatedUser;
}

export type LoginResponse = AuthResponse;
export type SignupResponse = AuthResponse;
