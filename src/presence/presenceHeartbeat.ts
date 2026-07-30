import type { Logger } from "../logging/logger";
import type {
  PresenceRecord,
  PresenceRepository,
} from "./presenceRepository";

export interface PresenceHeartbeat {
  start(): void;
  stop(): void;
}

interface CreatePresenceHeartbeatOptions {
  record(): PresenceRecord;
  intervalMs: number;
  presenceRepository: PresenceRepository;
  logger: Logger;
}

export function createPresenceHeartbeat(
  options: CreatePresenceHeartbeatOptions,
): PresenceHeartbeat {
  let timer: NodeJS.Timeout | null = null;
  let refreshing = false;

  async function refresh(): Promise<void> {
    if (refreshing) return;
    refreshing = true;
    try {
      const record = options.record();
      const lastSeenAt = new Date().toISOString();
      const refreshed = await options.presenceRepository.refresh({
        connectionId: record.connectionId,
        lastSeenAt,
      });
      if (!refreshed) {
        await options.presenceRepository.register({
          ...record,
          lastSeenAt,
        });
      }
    } catch (error) {
      options.logger.warn("Presence heartbeat failed", {
        connectionId: options.record().connectionId,
        error,
      });
    } finally {
      refreshing = false;
    }
  }

  function start(): void {
    if (timer) return;
    timer = setInterval(() => {
      void refresh();
    }, options.intervalMs);
    timer.unref();
  }

  function stop(): void {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  return { start, stop };
}
