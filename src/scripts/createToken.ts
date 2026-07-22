import "dotenv/config";

import { createTokenService } from "../auth/tokenService";
import { createConfig } from "../config";

const userId = process.argv[2] ?? "user-100";
const nickname = process.argv[3] ?? "스완";

const config = createConfig();
const tokenService = createTokenService({
  accessTokenSecret: config.auth.accessToken.secret,
  accessTokenExpiresIn: config.auth.accessToken.expiresIn,
  refreshTokenSecret: config.auth.refreshToken.secret,
  refreshTokenExpiresIn: config.auth.refreshToken.expiresIn,
});
const token = tokenService.createAccessToken(
  userId,
  nickname,
);

console.log(token);
