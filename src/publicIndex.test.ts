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

  it("uses login and room sections instead of manual token registration", async () => {
    const html = await readPublicIndex();

    expect(html).toContain('id="loginSection"');
    expect(html).toContain('id="loginUserIdInput"');
    expect(html).toContain('id="loginButton"');
    expect(html).toContain('id="logoutButton"');
    expect(html).toContain('id="roomSection"');
    expect(html).toContain('id="joinRoomButton"');
    expect(html).not.toContain("tokenInput");
    expect(html).not.toContain("nicknameInput");
    expect(html).not.toContain("connectBtn");
    expect(html).not.toContain("registerBtn");
  });

  it("keeps explicit login state for HTTP auth before WebSocket registration", async () => {
    const script = extractInlineScript(await readPublicIndex());

    expect(script).toContain("let accessToken = null;");
    expect(script).toContain("let loggedInUser = null;");
    expect(script).toContain("let pendingRoomId = null;");
    expect(script).not.toContain("let registeredUserId");
    expect(script).not.toContain("let registeredNickname");
  });

  it("posts credentials to /login and stores the returned access token", async () => {
    const script = extractInlineScript(await readPublicIndex());

    expect(script).toContain('fetch("/login"');
    expect(script).toContain("userId,");
    expect(script).toContain("password,");
    expect(script).toContain("accessToken = data.accessToken;");
    expect(script).toContain("loggedInUser = data.user;");
    expect(script).not.toContain("/auth/login");
    expect(script).not.toContain("data.token");
  });

  it("connects WebSocket during room join and registers with the JWT", async () => {
    const script = extractInlineScript(await readPublicIndex());
    const joinRoomIndex = script.indexOf("async function joinRoom()");
    const connectIndex = script.indexOf("await connectWebSocket();", joinRoomIndex);
    const registerIndex = script.indexOf('type: "register"', joinRoomIndex);

    expect(joinRoomIndex).toBeGreaterThanOrEqual(0);
    expect(connectIndex).toBeGreaterThan(joinRoomIndex);
    expect(registerIndex).toBeGreaterThan(connectIndex);
    expect(script).toContain("token: accessToken,");
    expect(script).toContain("nickname: loggedInUser.nickname,");
    expect(script).toContain("room_id: roomId,");
  });

  it("resets auth UI when the server rejects or expires the JWT", async () => {
    const script = extractInlineScript(await readPublicIndex());

    expect(script).toContain('data.code === "INVALID_ACCESS_TOKEN"');
    expect(script).toContain('data.code === "ACCESS_TOKEN_EXPIRED"');
    expect(script).toContain("accessToken = null;");
    expect(script).toContain("loggedInUser = null;");
    expect(script).toContain("socket?.close();");
  });
});
