import type WebSocket from "ws";

export function waitForOpen(ws: WebSocket, timeoutMs = 3_000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === ws.OPEN) {
      resolve();
      return;
    }

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("WebSocket 연결 시간이 초과되었습니다."));
    }, timeoutMs);

    function handleOpen(): void {
      cleanup();
      resolve();
    }

    function handleError(error: Error): void {
      cleanup();
      reject(error);
    }

    function cleanup(): void {
      clearTimeout(timeout);
      ws.off("open", handleOpen);
      ws.off("error", handleError);
    }

    ws.once("open", handleOpen);
    ws.once("error", handleError);
  });
}

export function waitForMessage<T>(
  ws: WebSocket,
  predicate: (message: T) => boolean,
  timeoutMs = 3_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("예상한 WebSocket 메시지를 받지 못했습니다."));
    }, timeoutMs);

    function handleMessage(rawData: WebSocket.RawData): void {
      let message: T;

      try {
        message = JSON.parse(rawData.toString()) as T;
      } catch {
        return;
      }

      if (!predicate(message)) return;

      cleanup();
      resolve(message);
    }

    function handleClose(): void {
      cleanup();
      reject(new Error("메시지를 기다리는 중 WebSocket이 종료되었습니다."));
    }

    function handleError(error: Error): void {
      cleanup();
      reject(error);
    }

    function cleanup(): void {
      clearTimeout(timeout);
      ws.off("message", handleMessage);
      ws.off("close", handleClose);
      ws.off("error", handleError);
    }

    ws.on("message", handleMessage);
    ws.once("close", handleClose);
    ws.once("error", handleError);
  });
}

export async function closeWebSocket(ws: WebSocket): Promise<void> {
  if (ws.readyState === ws.CLOSED) return;

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 1_000);

    ws.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });

    ws.close(1000, "Test completed");
  });
}
