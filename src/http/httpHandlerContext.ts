import type { Logger } from "../logging/logger";

export interface HttpHandlerContext {
  requestId: string;
  logger: Logger;
}
