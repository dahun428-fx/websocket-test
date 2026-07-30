import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import net from "node:net";

import { createClient, type RedisClientType } from "redis";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { Logger } from "../../logging/logger";
import { createRedisRealtimeBus } from "../../messaging/redisRealtimeBus";
import type { RealtimeEvent } from "../../messaging/realtimeEvent";
import { createRedisPresenceRepository } from "../../presence/redisPresenceRepository";
import { createRedisKeys } from "./redisKeys";

const redisServerAvailable =
  spawnSync("redis-server", ["--version"], { encoding: "utf8" }).status === 0;

function createLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
}

async function reservePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("테스트 Redis 포트를 할당할 수 없습니다.");
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  return address.port;
}

describe.skipIf(!redisServerAvailable)("Redis integration", () => {
  let redisServer: ChildProcessWithoutNullStreams;
  let command: RedisClientType;
  let subscriberA: RedisClientType;
  let subscriberB: RedisClientType;
  let redisUrl: string;

  beforeAll(async () => {
    const port = await reservePort();
    redisUrl = `redis://127.0.0.1:${port}`;
    redisServer = spawn("redis-server", [
      "--bind", "127.0.0.1",
      "--port", String(port),
      "--save", "",
      "--appendonly", "no",
    ]);

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("테스트 Redis 시작 시간이 초과되었습니다.")),
        5_000,
      );
      redisServer.once("error", reject);
      redisServer.stdout.on("data", (chunk: Buffer) => {
        if (chunk.toString("utf8").includes("Ready to accept connections")) {
          clearTimeout(timer);
          resolve();
        }
      });
    });

    command = createClient({ url: redisUrl });
    subscriberA = createClient({ url: redisUrl });
    subscriberB = createClient({ url: redisUrl });
    for (const client of [command, subscriberA, subscriberB]) {
      client.on("error", () => undefined);
    }
    await Promise.all([
      command.connect(),
      subscriberA.connect(),
      subscriberB.connect(),
    ]);
  }, 10_000);

  afterAll(async () => {
    await Promise.allSettled(
      [subscriberB, subscriberA, command]
        .filter((client) => client?.isOpen)
        .map((client) => client.close()),
    );
    redisServer?.kill("SIGTERM");
  });

  it("stores connection presence with TTL and removes it after expiry", async () => {
    const repository = createRedisPresenceRepository({
      client: command,
      keys: createRedisKeys("chat:test"),
      ttlSeconds: 1,
    });
    await repository.register({
      connectionId: "connection-ttl",
      userId: "user-ttl",
      serverId: "server-a",
      connectedAt: "2026-07-29T00:00:00.000Z",
      lastSeenAt: "2026-07-29T00:00:00.000Z",
      roomId: "room-1",
    });

    await expect(repository.isUserOnline("user-ttl")).resolves.toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    await expect(
      repository.findByConnectionId("connection-ttl"),
    ).resolves.toBeNull();
    await expect(repository.isUserOnline("user-ttl")).resolves.toBe(false);
  });

  it("registers, refreshes, moves room, and unregisters presence", async () => {
    const repository = createRedisPresenceRepository({
      client: command,
      keys: createRedisKeys("chat:test"),
      ttlSeconds: 30,
    });
    await repository.register({
      connectionId: "connection-1",
      userId: "user-1",
      serverId: "server-a",
      connectedAt: "2026-07-29T00:00:00.000Z",
      lastSeenAt: "2026-07-29T00:00:00.000Z",
      roomId: "room-1",
    });
    await repository.refresh({
      connectionId: "connection-1",
      lastSeenAt: "2026-07-29T00:00:10.000Z",
    });
    await repository.joinRoom({
      connectionId: "connection-1",
      roomId: "room-2",
    });

    await expect(
      repository.findByConnectionId("connection-1"),
    ).resolves.toMatchObject({
      lastSeenAt: "2026-07-29T00:00:10.000Z",
      roomId: "room-2",
    });

    await repository.unregister({
      connectionId: "connection-1",
      userId: "user-1",
      roomId: "room-2",
    });
    await expect(repository.isUserOnline("user-1")).resolves.toBe(false);
  });

  it("delivers one published realtime event to two server subscribers", async () => {
    const busA = createRedisRealtimeBus({
      publisherClient: command,
      subscriberClient: subscriberA,
      channel: "chat:test:realtime",
      logger: createLogger(),
    });
    const busB = createRedisRealtimeBus({
      publisherClient: command,
      subscriberClient: subscriberB,
      channel: "chat:test:realtime",
      logger: createLogger(),
    });
    const receivedA: RealtimeEvent[] = [];
    const receivedB: RealtimeEvent[] = [];
    let resolveA!: () => void;
    let resolveB!: () => void;
    const handledA = new Promise<void>((resolve) => { resolveA = resolve; });
    const handledB = new Promise<void>((resolve) => { resolveB = resolve; });

    await busA.subscriber.start(async (event) => {
      receivedA.push(event);
      resolveA();
    });
    await busB.subscriber.start(async (event) => {
      receivedB.push(event);
      resolveB();
    });

    const event: RealtimeEvent = {
      eventId: "32bd3d0c-4170-4073-8fbe-0c990ebddfe6",
      type: "message.broadcast",
      occurredAt: "2026-07-29T00:00:00.000Z",
      sourceServerId: "server-a",
      payload: {
        messageId: "1",
        roomId: "room-1",
        userId: "user-1",
      },
    };
    await busA.publisher.publish(event);
    await Promise.race([
      Promise.all([handledA, handledB]),
      new Promise((_, reject) => setTimeout(
        () => reject(new Error("Pub/Sub 전달 시간이 초과되었습니다.")),
        2_000,
      )),
    ]);

    expect(receivedA).toEqual([event]);
    expect(receivedB).toEqual([event]);
    await busA.subscriber.stop();
    await busB.subscriber.stop();
  });
});
