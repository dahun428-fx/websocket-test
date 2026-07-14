import type { RawData } from "ws";

import {
    clientMessageSchema,
    type ClientMessage,
} from "../schemas/clientMessageSchema";
import { rawDataToText } from "./rawDataToText";

export function parseClientMessage(
    rawMessage: RawData,
): ClientMessage | null {

    const text = rawDataToText(rawMessage);

    let parsed: unknown;

    try {
        parsed = JSON.parse(text);
    } catch {
        return null;
    }

    const result = clientMessageSchema.safeParse(parsed);

    if (!result.success) {
        return null;
    }

    return result.data;
}
