export interface AuthTokenPayload {
  sub: string;
  nickname?: string;
}

export interface LoginRequest {
  userId: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: {
    userId: string;
    nickname: string;
  };
}

export interface LoginErrorResponse {
  message: string;
}
