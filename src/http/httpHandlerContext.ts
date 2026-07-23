import type { Logger } from "../logging/logger";
import type { IncomingMessage, ServerResponse } from "node:http";

export interface HttpHandlerContext {
  requestId: string;
  logger: Logger;
}

export type HttpHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  context: HttpHandlerContext,
) => Promise<boolean>;
