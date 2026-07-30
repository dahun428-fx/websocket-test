import type { RealtimeEvent } from "./realtimeEvent";

export type RealtimeEventHandler = (event: RealtimeEvent) => Promise<void>;

export interface RealtimeSubscriber {
    start(handler: RealtimeEventHandler): Promise<void>;
    stop(): Promise<void>;
}
