import type { RealtimeEvent } from "./realtimeEvent";

export interface RealtimePublisher {
    publish(event: RealtimeEvent): Promise<void>
}
