export interface User {
  id: string;
  nickname: string;
}

export interface UserRepository {
  findById(userId: string): Promise<User | null>;
  authenticate(userId: string, password: string): Promise<User | null>;
}

interface StoredUser extends User {
  password: string;
}

const users = new Map<string, StoredUser>([
  [
    "user-100",
    {
      id: "user-100",
      nickname: "스완",
      password: "test1234",
    },
  ],
  [
    "user-200",
    {
      id: "user-200",
      nickname: "철수",
      password: "test1234",
    },
  ],
]);

function toUser(user: StoredUser): User {
  return {
    id: user.id,
    nickname: user.nickname,
  };
}

async function findById(userId: string): Promise<User | null> {
  const user = users.get(userId);
  return user ? toUser(user) : null;
}

async function authenticate(
  userId: string,
  password: string,
): Promise<User | null> {
  const user = users.get(userId);

  if (!user || user.password !== password) {
    return null;
  }

  return toUser(user);
}

export const userRepository: UserRepository = {
  findById,
  authenticate,
};
