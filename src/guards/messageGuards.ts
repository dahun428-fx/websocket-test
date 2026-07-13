import type {
    ChatInputMessage,
    ClientMessage,
    RegisterMessage,
} from "../types/messages";

function isRecord(
    value: unknown,
): value is Record<string, unknown> {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
    );
}

export function isRegisterMessage(
    value: unknown,
): value is RegisterMessage {
    if (!isRecord(value)) {
        return false;
    }

    return (
        value.type === "register" &&
        typeof value.nickname === "string" &&
        typeof value.room_id === "string"
    );
}

export function isChatInputMessage(
    value: unknown,
): value is ChatInputMessage {
    if (!isRecord(value)) {
        return false;
    }

    return (
        value.type === "chat" &&
        typeof value.message === "string"
    );
}

export function isClientMessage(
    value: unknown,
): value is ClientMessage {
    return (
        isRegisterMessage(value) ||
        isChatInputMessage(value)
    );
}