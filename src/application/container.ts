import http from "node:http";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { createTokenService } from "../auth/tokenService";
import type { EventBus } from "./events/eventBus";
import { createInMemoryEventBus } from "./events/inMemoryEventBus";
import { registerEventHandlers } from "./events/registerEventHandlers";
import {
  createUserUseCase,
  type CreateUserUseCase,
} from "./user/createUser";
import {
  createCreateRoomUseCase,
  type CreateRoomUseCase,
} from "./room/createRoom";
import { createGetRoomUseCase, type GetRoomUseCase } from "./room/getRoom";
import { createRenameRoomUseCase, type RenameRoomUseCase } from "./room/renameRoom";
import type { UnitOfWork } from "./unitOfWork";
import { attachChatRuntime, type ChatRuntime } from "../chat/chatRuntime";
import type { AppConfig } from "../config";
import { openDatabase, type DatabaseConnection } from "../database/database";
import { createSqliteUnitOfWork } from "../database/sqliteUnitOfWork";
import { createHttpServer } from "../http/createHttpServer";
import { registerRoutes } from "../http/registerRoutes";
import { createHttpRouter } from "../http/router/router";
import type { AuthHandlerRuntimeOptions } from "../http/handlers/authHandlers";
import type { Logger } from "../logging/logger";
import type { Cache } from "../cache/cache";
import { createNoopCache } from "../cache/noopCache";
import { createRedisCache } from "../cache/redisCache";
import { createLoginRateLimitMiddleware } from "../http/middleware/loginRateLimitMiddleware";
import type { Middleware } from "../http/middleware/middleware";
import { createRedisRateLimiter } from "../rateLimit/redisRateLimiter";
import { createResilientRateLimiter } from "../rateLimit/resilientRateLimiter";
import type { RateLimiter } from "../rateLimit/rateLimiter";
import { createRedisClients } from "../infrastructure/redis/createRedisClients";
import { createDatabaseHealthCheck } from "../health/databaseHealthCheck";
import { createRedisHealthCheck } from "../health/redisHealthCheck";
import {
  createReadinessService,
  type ReadinessService,
} from "../health/readinessService";
import type { HealthCheck, HealthCheckResult } from "../health/health";
import {
  createRedisKeys,
  createRedisChannels,
  type RedisChannels,
  type RedisKeys,
} from "../infrastructure/redis/redisKeys";
import {
  createRedisLifecycle,
  type RedisLifecycle,
} from "../infrastructure/redis/redisLifecycle";
import type { RedisClients } from "../infrastructure/redis/redisClients";
import {
  createRedisRealtimeBus,
} from "../messaging/redisRealtimeBus";
import { createRealtimeEventHandler } from "../messaging/realtimeEventHandler";
import type { RealtimeEventHandler } from "../messaging/realtimeSubscriber";
import type { RealtimePublisher } from "../messaging/realtimePublisher";
import type { RealtimeSubscriber } from "../messaging/realtimeSubscriber";
import { createResilientRealtimePublisher } from "../messaging/resilientRealtimePublisher";
import type { BackgroundWorker } from "../outbox/backgroundWorker";
import { createSqliteOutboxRepository } from "../outbox/createSqliteOutboxRepository";
import {
  createOutboxEventPublisher,
  type OutboxEventPublisher,
} from "../outbox/outboxEventPublisher";
import type { OutboxRepository } from "../outbox/outboxRepository";
import { createOutboxWorker } from "../outbox/outboxWorker";
import { createInMemoryPresenceRepository } from "../presence/inMemoryPresenceRepository";
import type { PresenceRepository } from "../presence/presenceRepository";
import { createRedisPresenceRepository } from "../presence/redisPresenceRepository";
import { createResilientPresenceRepository } from "../presence/resilientPresenceRepository";
import { createMessageRepository, type MessageRepository } from "../repositories/messageRepository";
import { createRefreshTokenRepository, type RefreshTokenRepository } from "../repositories/refreshTokenRepository";
import { createRoomMemberRepository, type RoomMemberRepository } from "../repositories/roomMemberRepository";
import { createRoomRepository, type RoomRepository } from "../repositories/roomRepository";
import { createUserRepository, type UserRepository } from "../repositories/userRepository";
import { createAuthService, type AuthService } from "../service/authService";
import createRoomService, { type RoomService } from "../service/roomService";
import { createWebSocketServer } from "../websocket/webSocketServer";
import { createBroadcastService } from "../websocket/broadcastService";
import {
  createConnectionRegistry,
  type ConnectionRegistry,
} from "../websocket/connectionRegistry";
import type { WebSocketServer } from "ws";

export interface ApplicationContainer {
  config: AppConfig;
  logger: Logger;
  database: Pick<DatabaseConnection, "close">;
  unitOfWork: UnitOfWork;
  eventBus: EventBus;
  identity: {
    serverId: string;
  };
  redis: {
    clients: RedisClients;
    lifecycle: RedisLifecycle;
    keys: RedisKeys;
    channels: RedisChannels;
    health(): Promise<HealthCheckResult>;
  };
  rateLimit: {
    limiter: RateLimiter;
    loginMiddleware: Middleware;
  };
  cache: {
    client: Cache;
  };
  health: {
    databaseCheck: HealthCheck;
    redisCheck: HealthCheck;
    readinessService: ReadinessService;
  };
  presence: {
    repository: PresenceRepository;
  };
  realtime: {
    publisher: RealtimePublisher;
    subscriber: RealtimeSubscriber;
    handler: RealtimeEventHandler;
  };
  connections: ConnectionRegistry;
  outbox: {
    repository: OutboxRepository;
    publisher: OutboxEventPublisher;
    worker: BackgroundWorker;
  };
  repositories: {
    userRepository: UserRepository;
    messageRepository: MessageRepository;
    refreshTokenRepository: RefreshTokenRepository;
    roomRepository: RoomRepository;
    roomMemberRepository: RoomMemberRepository;
  };
  services: {
    authService: AuthService;
    roomService: RoomService;
  };
  useCases: {
    createRoom: CreateRoomUseCase;
    getRoom: GetRoomUseCase;
    renameRoom: RenameRoomUseCase;
    createUser: CreateUserUseCase;
  };
  servers: {
    httpServer: http.Server;
    webSocketServer: WebSocketServer;
  };
  runtimes: {
    chatRuntime: ChatRuntime;
  };
  lifecycle: {
    unsubscribeEventHandlers: Array<() => void>;
  };
}

export interface CreateApplicationContainerOptions {
  config: AppConfig;
  logger: Logger;
  websocketMaxPayloadBytes?: number;
  publicIndexPath?: string;
  authHttpRuntime?: AuthHandlerRuntimeOptions;
  rateLimiter?: RateLimiter;
  cache?: Cache;
}

export async function createApplicationContainer(
  options: CreateApplicationContainerOptions,
): Promise<ApplicationContainer> {
  const { config, logger } = options;
  const serverId = config.identity.serverId ?? randomUUID();
  const database = await openDatabase(config.database.path);
  const userRepository = createUserRepository(database);
  const messageRepository = createMessageRepository(database);
  const refreshTokenRepository = createRefreshTokenRepository(database);
  const roomRepository = createRoomRepository(database);
  const roomMemberRepository = createRoomMemberRepository(database);
  const unitOfWork = createSqliteUnitOfWork({
    database,
    logger: logger.child({ component: "SqliteUnitOfWork" }),
  });
  const eventBus = createInMemoryEventBus({
    logger: logger.child({ component: "InMemoryEventBus" }),
  });
  const outboxRepository = createSqliteOutboxRepository({ database });
  const outboxEventPublisher = createOutboxEventPublisher({
    outboxRepository,
  });
  const redisLogger = logger.child({ component: "Redis" });
  const redisClients = createRedisClients({
    config: config.redis,
    logger: redisLogger,
  });
  const redisLifecycle = createRedisLifecycle({
    clients: redisClients,
    config: config.redis,
    logger: logger.child({ component: "RedisLifecycle" }),
  });
  const redisKeys = createRedisKeys(config.redis.keyPrefix);
  const redisChannels = createRedisChannels(config.redis.keyPrefix);
  const cache = options.cache ?? (
    config.redis.enabled
      ? createRedisCache({ redis: redisClients.command })
      : createNoopCache()
  );
  const rateLimiter = options.rateLimiter ?? createResilientRateLimiter({
    primary: config.redis.enabled
      ? createRedisRateLimiter({ redis: redisClients.command })
      : undefined,
    failMode: config.rateLimit.failMode,
    logger: logger.child({ component: "RateLimiter" }),
  });
  const databaseHealthCheck = createDatabaseHealthCheck({ database });
  const redisHealthCheck = createRedisHealthCheck({
    redis: redisClients.command,
    enabled: config.redis.enabled,
    timeoutMs: config.redis.commandTimeoutMs,
  });
  const readinessService = createReadinessService({
    databaseHealthCheck,
    redisHealthCheck,
    redisRequired: config.redis.required,
  });
  const loginRateLimitMiddleware = createLoginRateLimitMiddleware({
    rateLimiter,
    redisKeys,
    policy: {
      limit: config.rateLimit.maxAttempts,
      windowMs: config.rateLimit.windowMs,
    },
    trustProxy: config.server.trustProxy,
  });
  const redisPresenceRepository = createRedisPresenceRepository({
    client: redisClients.command,
    keys: redisKeys,
    ttlSeconds: config.redis.presence.ttlSeconds,
  });
  const presenceRepository = createResilientPresenceRepository({
    primary: redisPresenceRepository,
    fallback: createInMemoryPresenceRepository(),
    isPrimaryAvailable: redisLifecycle.isAvailable,
    required: config.redis.required,
    logger: logger.child({ component: "PresenceRepository" }),
  });
  const tokenService = createTokenService({
    accessTokenSecret: config.auth.accessToken.secret,
    accessTokenExpiresIn: config.auth.accessToken.expiresIn,
    refreshTokenSecret: config.auth.refreshToken.secret,
    refreshTokenExpiresIn: config.auth.refreshToken.expiresIn,
  });
  const createUser = createUserUseCase({
    userRepository,
    refreshTokenRepository,
    tokenService,
    unitOfWork,
    outboxEventPublisher,
  });
  const authService = createAuthService({
    userRepository,
    refreshTokenRepository,
    tokenService,
    unitOfWork,
  });
  const createRoom = createCreateRoomUseCase({
    roomRepository,
    roomMemberRepository,
    unitOfWork,
    outboxEventPublisher,
  });
  const getRoom = createGetRoomUseCase({
    roomRepository,
    cache,
    redisKeys,
    cacheTtlSeconds: config.cache.roomTtlSeconds,
    logger: logger.child({ component: "GetRoomUseCase" }),
  });
  const renameRoom = createRenameRoomUseCase({
    roomRepository,
    cache,
    redisKeys,
    logger: logger.child({ component: "RenameRoomUseCase" }),
  });
  const router = createHttpRouter();
  registerRoutes({
    router,
    authService,
    createUserUseCase: createUser,
    getRoomUseCase: getRoom,
    renameRoomUseCase: renameRoom,
    tokenService,
    publicIndexPath: options.publicIndexPath ?? path.join(__dirname, "..", "..", "public", "index.html"),
    maxBodyBytes: 16 * 1024,
    loginRateLimitMiddleware,
    refreshTokenCookie: config.auth.refreshToken.cookie,
    readinessService,
    runtime: options.authHttpRuntime,
  });
  const httpLogger = logger.child({ transport: "http" });
  const webSocketLogger = logger.child({ transport: "websocket" });
  const httpServer = createHttpServer({
    router,
    logger: httpLogger,
  });
  const webSocketServer = createWebSocketServer({
    httpServer,
    maxPayloadBytes: options.websocketMaxPayloadBytes ?? 16 * 1024,
  });
  const connectionRegistry = createConnectionRegistry();
  const broadcastService = createBroadcastService(connectionRegistry);
  const roomService = createRoomService({
    connectionRegistry,
    broadcastService,
  });
  const redisRealtimeBus = createRedisRealtimeBus({
    publisherClient: redisClients.publisher,
    subscriberClient: redisClients.subscriber,
    channel: redisChannels.realtime,
    logger: logger.child({ component: "RedisRealtimeBus" }),
  });
  const realtimePublisher = createResilientRealtimePublisher({
    publisher: redisRealtimeBus.publisher,
    enabled: config.redis.enabled,
    required: config.redis.required,
    isAvailable: redisLifecycle.isAvailable,
    logger: logger.child({ component: "RealtimePublisher" }),
  });
  const realtimeHandler = createRealtimeEventHandler({
    serverId,
    messageRepository,
    roomService,
    logger: logger.child({ component: "RealtimeEventHandler" }),
  });
  const unsubscribeEventHandlers = registerEventHandlers({
    eventBus,
    realtimePublisher,
    serverId,
    logger: logger.child({ component: "DomainEventHandler" }),
  });
  const outboxWorker = createOutboxWorker({
    outboxRepository,
    unitOfWork,
    eventBus,
    logger: logger.child({ component: "OutboxWorker" }),
    config: config.outbox,
  });
  const chatRuntime = attachChatRuntime(webSocketServer, {
    messageRepository,
    unitOfWork,
    outboxEventPublisher,
    heartbeatIntervalMs: config.heartbeat.interval_ms,
    verifyAccessToken: tokenService.verifyAccessToken,
    heartbeatDebug: config.heartbeat.debug,
    logger: webSocketLogger,
    roomService,
    connectionRegistry,
    presenceRepository,
    presenceHeartbeatIntervalMs:
      config.redis.presence.heartbeatIntervalMs,
    serverId,
  });

  return {
    config,
    logger,
    database,
    unitOfWork,
    eventBus,
    identity: { serverId },
    redis: {
      clients: redisClients,
      lifecycle: redisLifecycle,
      keys: redisKeys,
      channels: redisChannels,
      health: redisHealthCheck.check,
    },
    rateLimit: {
      limiter: rateLimiter,
      loginMiddleware: loginRateLimitMiddleware,
    },
    cache: { client: cache },
    health: {
      databaseCheck: databaseHealthCheck,
      redisCheck: redisHealthCheck,
      readinessService,
    },
    presence: {
      repository: presenceRepository,
    },
    realtime: {
      publisher: realtimePublisher,
      subscriber: redisRealtimeBus.subscriber,
      handler: realtimeHandler,
    },
    connections: connectionRegistry,
    outbox: {
      repository: outboxRepository,
      publisher: outboxEventPublisher,
      worker: outboxWorker,
    },
    repositories: {
      userRepository,
      messageRepository,
      refreshTokenRepository,
      roomRepository,
      roomMemberRepository,
    },
    services: { authService, roomService },
    useCases: { createRoom, getRoom, renameRoom, createUser },
    servers: { httpServer, webSocketServer },
    runtimes: { chatRuntime },
    lifecycle: { unsubscribeEventHandlers },
  };
}
