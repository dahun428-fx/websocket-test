import { ApplicationError } from "./applicationError";

export type RoomErrorCode =
    | "INVALID_ROOM_NAME"
    | "ROOM_NOT_FOUND"
    | "ROOM_ACCESS_DENIED";

export class InvalidRoomNameError extends ApplicationError {
    constructor() {
        super({
            code: "INVALID_ROOM_NAME",
            message: "채팅방 이름을 입력하세요.",
        });
    }
}

export class RoomNotFoundError extends ApplicationError {
    constructor(roomId: string) {
        super({
            code: "ROOM_NOT_FOUND",
            message: "채팅방을 찾을 수 없습니다.",
            details: { roomId },
        });
    }
}

export class RoomAccessDeniedError extends ApplicationError {
    constructor(roomId: string, userId: string) {
        super({
            code: "ROOM_ACCESS_DENIED",
            message: "이 채팅방에 접근할 권한이 없습니다.",
            details: { roomId, userId },
        });
    }
}
