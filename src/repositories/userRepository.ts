export interface User {
  id: string;
  nickname: string;
  passwordHash: string;
}

export interface UserRepository {
  findById(userId: string): Promise<User | null>;
}

interface StoredUser extends User {
  passwordHash: string;
}

const users = new Map<string, StoredUser>([
  [
    "user-100",
    {
      id: "user-100",
      nickname: "스완",
      passwordHash:
        "$2b$12$nqdy15ta1ILfCfH7nih9Tu5Vk3VVr/Mdp4Gu2ucu48iLUHvEouLu6",
    },
  ],
  [
    "user-200",
    {
      id: "user-200",
      nickname: "철수",
      passwordHash:
        "$2b$12$nqdy15ta1ILfCfH7nih9Tu5Vk3VVr/Mdp4Gu2ucu48iLUHvEouLu6",
    },
  ],
]);

function toUser(user: StoredUser): User {
  return {
    id: user.id,
    nickname: user.nickname,
    passwordHash: user.passwordHash,
  };
}

async function findById(userId: string): Promise<User | null> {
  const user = users.get(userId);
  return user ? toUser(user) : null;
}

export const userRepository: UserRepository = {
  findById,
};
