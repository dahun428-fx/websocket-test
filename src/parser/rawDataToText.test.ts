import { describe, expect, it } from "vitest";

import { rawDataToText } from "./rawDataToText";

describe("rawDataToText", () => {
    it("converts Buffer and Buffer arrays to text", () => {
        expect(rawDataToText(Buffer.from("hello"))).toBe("hello");
        expect(rawDataToText([Buffer.from("hel"), Buffer.from("lo")])).toBe("hello");
    });

    it("converts ArrayBuffer to text", () => {
        const bytes = new TextEncoder().encode("hello");
        expect(rawDataToText(bytes.buffer)).toBe("hello");
    });
});
