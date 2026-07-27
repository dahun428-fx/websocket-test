import { Logger } from "../../logging/logger";
import { ApplicationEvent } from "./applicationEvent";
import { EventBus } from "./eventBus";

interface CreateInMemoryEventBusOptions {
    logger: Logger;
}

type AnyEventHandler = (event: ApplicationEvent) => Promise<void>;

export function createInMemoryEventBus(options: CreateInMemoryEventBusOptions): EventBus {

}