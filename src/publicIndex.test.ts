import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

async function readPublicIndex(): Promise<string> {
  return readFile(
    path.join(process.cwd(), "public", "index.html"),
    "utf8",
  );
}

function extractInlineScript(html: string): string {
  const match = html.match(/<script>([\s\S]*)<\/script>/);

  if (!match) {
    throw new Error("인라인 스크립트를 찾을 수 없습니다.");
  }

  return match[1] ?? "";
}

describe("public index", () => {
  it("contains parseable inline JavaScript", async () => {
    const html = await readPublicIndex();
    const script = extractInlineScript(html);

    expect(() => new Function(script)).not.toThrow();
  });

  it("uses the server login contract", async () => {
    const html = await readPublicIndex();

    expect(html).toContain('fetch("/login"');
    expect(html).toContain("passwordInput");
    expect(html).toContain("accessToken");
    expect(html).not.toContain("/auth/login");
    expect(html).not.toContain("data.token");
  });
});
