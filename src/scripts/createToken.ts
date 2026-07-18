import "dotenv/config";

import { createAccessToken } from "../auth/tokenService";

const userId = process.argv[2] ?? "user-100";
const nickname = process.argv[3] ?? "스완";

const token = createAccessToken(
  userId,
  nickname,
);

console.log(token);
