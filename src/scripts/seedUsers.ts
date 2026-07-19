import "dotenv/config";

import { closeDatabase, initializeDatabase } from "../database/database";

import { hashPassword } from "../auth/passwordService";

import { userRepository } from "../repositories/userRepository";

async function seedUser(
  id: string,
  nickname: string,
  password: string,
): Promise<void> {
  const exists = await userRepository.existsById(id);

  if (exists) {
    console.log(`${id} 사용자는 이미 존재합니다.`);

    return;
  }

  const passwordHash = await hashPassword(password);

  await userRepository.create({
    id,
    nickname,
    passwordHash,
    createdAt: new Date().toISOString(),
  });

  console.log(`${id} 사용자를 생성했습니다.`);
}

async function main(): Promise<void> {
  await initializeDatabase();

  await seedUser("user-100", "다훈", "test1234");

  await seedUser("user-200", "철수", "test1234");
}

void main()
  .catch((error: unknown) => {
    console.error("사용자 seed 실패:", error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
