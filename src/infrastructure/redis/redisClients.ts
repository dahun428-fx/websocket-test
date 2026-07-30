import type { RedisClientType } from "redis";

export interface RedisClients {
  command: RedisClientType;
  publisher: RedisClientType;
  subscriber: RedisClientType;
}
