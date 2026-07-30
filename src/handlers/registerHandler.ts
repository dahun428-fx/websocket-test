import { TokenExpiredError } from "jsonwebtoken";

import type { AccessTokenPayload } from "../types/auth";
import type { RegisterMessage } from "../types/messages";
import type { RoomService } from "../service/roomService";
import type { ChatWebSocket } from "../types/websocket";
import type { SendError, SendJson } from "../types/handler";

export interface RegisterHandlerDependencies {
  roomService: RoomService;
  sendJson: SendJson;
  sendError: SendError;
  sendRoomHistory(socket: ChatWebSocket, roomId: string): Promise<void>;
  createTimestamp(): string;
  verifyAccessToken(token: string): AccessTokenPayload;
  onRegistered?(socket: ChatWebSocket): Promise<void>;
}

export function createRegisterHandler(dependencies: RegisterHandlerDependencies) {
  const {
    roomService,
    sendJson,
    sendError,
    sendRoomHistory,
    createTimestamp,
    verifyAccessToken,
  } = dependencies;

  return async function handleRegister(
    socket: ChatWebSocket,
    message: RegisterMessage,
  ): Promise<boolean> {
    if (socket.userId || socket.nickname || socket.room_id) {
      await sendError(socket, "ALREADY_REGISTERED");
      return false;
    }

    let tokenPayload;
    try {
      tokenPayload = verifyAccessToken(message.token);
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        await sendError(socket, "ACCESS_TOKEN_EXPIRED");
        return false;
      }
      await sendError(socket, "INVALID_ACCESS_TOKEN");
      return false;
    }

    const nickname = tokenPayload.nickname?.trim();
    if (!nickname) {
      await sendError(socket, "INVALID_ACCESS_TOKEN");
      return false;
    }

    const roomId = roomService.join(socket, message.room_id);
    socket.userId = tokenPayload.sub;
    socket.nickname = nickname;

    try {
      await dependencies.onRegistered?.(socket);
      const roomConnectionCount = roomService.getConnectionCount(roomId);
      const roomUserCount = roomService.getUserCount(roomId);

      await sendJson(socket, {
        type: "register-success",
        userId: tokenPayload.sub,
        nickname,
        room_id: roomId,
        roomConnectionCount,
        roomUserCount,
        message: `${roomId}방에 ${nickname} 닉네임으로 입장했습니다.`,
        createdAt: createTimestamp(),
      });
      await sendRoomHistory(socket, roomId);

      if (socket.isClosed || socket.room_id !== roomId) {
        return false;
      }

      roomService.broadcastToRoom(roomId, {
        type: "notification",
        room_id: roomId,
        message: `${nickname}님이 입장했습니다.`,
        roomConnectionCount,
        roomUserCount,
        createdAt: createTimestamp(),
      });
      return true;
    } catch (error) {
      roomService.leave(socket);
      socket.userId = null;
      socket.nickname = null;
      socket.close(1011, "Registration failed");
      throw error;
    }
  };
}
