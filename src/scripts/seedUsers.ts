import "dotenv/config";

import path from "node:path";

import { hashPassword } from "../auth/passwordService";
import { openDatabase } from "../database/database";
import { createUserRepository, UserAlreadyExistsError } from "../repositories/userRepository";

async function main(): Promise<void> {
  const seedPassword = process.env.SEED_USER_PASSWORD;
  if (!seedPassword) {
    throw new Error("SEED_USER_PASSWORD 환경변수가 필요합니다.");
  }

  const database = await openDatabase(
    process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "chat.db"),
  );
  const repository = createUserRepository(database);

  try {
    for (const [id, nickname] of [["user-100", "다훈"], ["user-200", "철수"]] as const) {
      try {
        await repository.create({
          id,
          nickname,
          passwordHash: await hashPassword(seedPassword),
          createdAt: new Date().toISOString(),
        });
        console.log(`${id} 사용자를 생성했습니다.`);
      } catch (error) {
        if (!(error instanceof UserAlreadyExistsError)) throw error;
        console.log(`${id} 사용자는 이미 존재합니다.`);
      }
    }
  } finally {
    await database.close();
  }
}

void main().catch((error: unknown) => {
  console.error("사용자 seed 실패:", error);
  process.exitCode = 1;
});
