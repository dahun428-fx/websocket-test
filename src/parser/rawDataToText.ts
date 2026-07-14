import { RawData } from "ws";

export function rawDataToText(rawMessage: RawData): string {
    if (Array.isArray(rawMessage)) {
        return Buffer.concat(rawMessage).toString();
    }
    if (rawMessage instanceof ArrayBuffer) {
        return new TextDecoder().decode(rawMessage);
    }
    return rawMessage.toString();
}

