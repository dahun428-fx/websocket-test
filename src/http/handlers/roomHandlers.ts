import type { GetRoomUseCase } from "../../application/room/getRoom";
import type { RenameRoomUseCase } from "../../application/room/renameRoom";
import type { RenameRoomRequest } from "../../schemas/renameRoomSchema";
import { HttpError } from "../errors/httpError";
import type { RouteHandler } from "../middleware/middleware";

interface CreateRoomHandlersOptions {
  getRoomUseCase: GetRoomUseCase;
  renameRoomUseCase: RenameRoomUseCase;
}

export interface RoomHandlers {
  get: RouteHandler;
  rename: RouteHandler;
}

export function createRoomHandlers(
  options: CreateRoomHandlersOptions,
): RoomHandlers {
  const get: RouteHandler = async (context) => {
    const room = await options.getRoomUseCase.execute(context.params.roomId);
    context.json(200, { room });
  };

  const rename: RouteHandler = async (context) => {
    if (!context.user) {
      throw new HttpError({
        statusCode: 401,
        code: "AUTHENTICATION_REQUIRED",
        message: "인증이 필요합니다.",
      });
    }

    const body = context.body as RenameRoomRequest;
    await options.renameRoomUseCase.execute({
      roomId: context.params.roomId,
      userId: context.user.userId,
      name: body.name,
    });
    context.json(204, undefined);
  };

  return { get, rename };
}
