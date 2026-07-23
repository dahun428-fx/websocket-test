import type { AddressInfo } from "node:net";

import type { ApplicationContainer } from "./container";

export interface Application {
  server: import("node:http").Server;
  start(): Promise<number>;
  stop(reason?: string): Promise<void>;
}

export function createApplication(container: ApplicationContainer): Application {
  const { config, logger, database, servers, runtimes } = container;
  let stopped = false;
  let stopPromise: Promise<void> | null = null;

  async function start(): Promise<number> {
    if (stopped) throw new Error("종료된 애플리케이션은 다시 시작할 수 없습니다.");
    if (servers.httpServer.listening) return (servers.httpServer.address() as AddressInfo).port;

    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => {
          servers.httpServer.off("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          servers.httpServer.off("error", onError);
          resolve();
        };
        servers.httpServer.once("error", onError);
        servers.httpServer.once("listening", onListening);
        servers.httpServer.listen(config.server.port, config.server.host);
      });
    } catch (error) {
      await stop("startup_failed");
      throw error;
    }

    const port = (servers.httpServer.address() as AddressInfo).port;
    logger.info("Application started", { host: config.server.host, port });
    return port;
  }

  function stop(reason = "unknown"): Promise<void> {
    if (stopPromise) return stopPromise;

    stopPromise = (async () => {
      const errors: unknown[] = [];
      logger.info("Application shutdown started", { reason });
      try { await runtimes.chatRuntime.close(); } catch (error) { errors.push(error); }
      if (servers.httpServer.listening) {
        try {
          await new Promise<void>((resolve, reject) => {
            servers.httpServer.close((error) => error ? reject(error) : resolve());
          });
        } catch (error) { errors.push(error); }
      }
      try { await database.close(); } catch (error) { errors.push(error); }
      stopped = true;
      if (errors.length > 0) throw new AggregateError(errors, "애플리케이션 종료 중 오류가 발생했습니다.");
      logger.info("Application shutdown completed", { reason });
    })();

    return stopPromise;
  }

  return { server: servers.httpServer, start, stop };
}
