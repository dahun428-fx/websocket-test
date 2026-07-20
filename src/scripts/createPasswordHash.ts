import bcrypt from "bcrypt";

const password = process.argv[2];

if (!password) {
  console.error("사용법: npm run password-hash -- <password>");

  process.exit(1);
}

const SALT_ROUNDS = 12;

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  console.log(passwordHash);
}

void main().catch((error: unknown) => {
  console.error("비밀번호 해시 생성 실패 :", error);
  process.exit(1);
});
