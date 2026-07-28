import http from "node:http";
import path from "node:path";

import { createTokenService } from "../auth/tokenService";
import type { EventBus } from "./events/eventBus";
import { createInMemoryEventBus } from "./events/inMemoryEventBus";
import { registerEventHandlers } from "./events/registerEventHandlers";
import {
  createCreateRoomUseCase,
  type CreateRoomUseCase,
} from "./room/createRoom";
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
import { createMessageRepository, type MessageRepository } from "../repositories/messageRepository";
import { createRefreshTokenRepository, type RefreshTokenRepository } from "../repositories/refreshTokenRepository";
import { createRoomMemberRepository, type RoomMemberRepository } from "../repositories/roomMemberRepository";
import { createRoomRepository, type RoomRepository } from "../repositories/roomRepository";
import { createUserRepository, type UserRepository } from "../repositories/userRepository";
import { createAuthService, type AuthService } from "../service/authService";
import createRoomService, { type RoomService } from "../service/roomService";
import { createWebSocketServer } from "../websocket/webSocketServer";
import type { WebSocketServer } from "ws";

export interface ApplicationContainer {
  config: AppConfig;
  logger: Logger;
  database: Pick<DatabaseConnection, "close">;
  unitOfWork: UnitOfWork;
  eventBus: EventBus;
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
}

export async function createApplicationContainer(
  options: CreateApplicationContainerOptions,
): Promise<ApplicationContainer> {
  const { config, logger } = options;
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
  const tokenService = createTokenService({
    accessTokenSecret: config.auth.accessToken.secret,
    accessTokenExpiresIn: config.auth.accessToken.expiresIn,
    refreshTokenSecret: config.auth.refreshToken.secret,
    refreshTokenExpiresIn: config.auth.refreshToken.expiresIn,
  });
  const authService = createAuthService({
    userRepository,
    refreshTokenRepository,
    tokenService,
    unitOfWork,
    eventBus,
  });
  const createRoom = createCreateRoomUseCase({
    roomRepository,
    roomMemberRepository,
    unitOfWork,
    eventBus,
  });
  const unsubscribeEventHandlers = registerEventHandlers({
    eventBus,
    logger: logger.child({ component: "DomainEventHandler" }),
  });
  const router = createHttpRouter();
  registerRoutes({
    router,
    authService,
    tokenService,
    publicIndexPath: options.publicIndexPath ?? path.join(__dirname, "..", "..", "public", "index.html"),
    maxBodyBytes: 16 * 1024,
    loginRateLimit: config.rateLimit,
    refreshTokenCookie: config.auth.refreshToken.cookie,
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
  const roomService = createRoomService({ webSocketServer });
  const chatRuntime = attachChatRuntime(webSocketServer, {
    messageRepository,
    eventBus,
    heartbeatIntervalMs: config.heartbeat.interval_ms,
    verifyAccessToken: tokenService.verifyAccessToken,
    heartbeatDebug: config.heartbeat.debug,
    logger: webSocketLogger,
    roomService,
  });

  return {
    config,
    logger,
    database,
    unitOfWork,
    eventBus,
    repositories: {
      userRepository,
      messageRepository,
      refreshTokenRepository,
      roomRepository,
      roomMemberRepository,
    },
    services: { authService, roomService },
    useCases: { createRoom },
    servers: { httpServer, webSocketServer },
    runtimes: { chatRuntime },
    lifecycle: { unsubscribeEventHandlers },
  };
}
