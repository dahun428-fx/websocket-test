import type { RawData } from "ws";

import { isClientMessage } from "../guards/messageGuards";

import type { ClientMessage } from "../types/messages";

export function parseClientMessage(
    rawMessage: RawData,
): ClientMessage | null {

    const text = rawMessage.toString();

    let parsed: unknown;

    try {
        parsed = JSON.parse(text);
    } catch {
        return null;
    }

    if (!isClientMessage(parsed)) {
        return null;
    }

    return parsed;
}