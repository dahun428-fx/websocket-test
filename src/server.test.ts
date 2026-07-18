import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { server } from "./server";

let baseUrl: string;

function getServerUrl(): string {
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("테스트 서버 주소를 확인할 수 없습니다.");
  }

  return `http://127.0.0.1:${(address as AddressInfo).port}`;
}

function listenServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };

    server.once("error", onError);
    server.listen(0, "127.0.0.1", onListening);
  });
}

function closeServer(): Promise<void> {
  if (!server.listening) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function postLogin(payload: unknown): Promise<Response> {
  return fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

beforeEach(async () => {
  process.env.JWT_SECRET = "test-secret";
  await listenServer();
  baseUrl = getServerUrl();
});

afterEach(async () => {
  await closeServer();
  delete process.env.JWT_SECRET;
});

describe("HTTP server", () => {
  it("returns an access token for valid login credentials", async () => {
    const response = await postLogin({
      userId: "user-100",
      password: "test1234",
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      accessToken: expect.any(String),
      user: {
        userId: "user-100",
        nickname: "스완",
      },
    });
  });

  it("rejects invalid login credentials", async () => {
    const response = await postLogin({
      userId: "user-100",
      password: "wrong-password",
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      message: "사용자 ID 또는 비밀번호가 올바르지 않습니다.",
    });
  });

  it("rejects malformed JSON bodies", async () => {
    const response = await postLogin("{");
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      message: "올바른 JSON 형식이 아닙니다.",
    });
  });

  it("rejects non-POST login requests", async () => {
    const response = await fetch(`${baseUrl}/login`);
    const body = await response.json();

    expect(response.status).toBe(405);
    expect(body).toEqual({
      message: "POST 요청만 허용됩니다.",
    });
  });
});
