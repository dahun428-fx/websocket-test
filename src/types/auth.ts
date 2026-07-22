export interface AuthTokenPayload {
    sub: string;
    nickname?: string;
}

export interface AccessTokenPayload {
    sub: string;
    nickname: string;
    type: "access";
}

export interface RefreshTokenPayload {
    sub: string;
    tokenId: string;
    type: "refresh"
}