import bcrypt from "bcrypt";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return await bcrypt.compare(password, passwordHash);
}
