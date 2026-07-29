import { randomUUID } from "node:crypto";

import type { RoomMemberRepository } from "../../repositories/roomMemberRepository";
import type { RoomRepository } from "../../repositories/roomRepository";
import type { OutboxEventPublisher } from "../../outbox/outboxEventPublisher";
import { InvalidRoomNameError } from "../errors/roomErrors";
import { createRoomCreatedEvent } from "../events/roomEvents";
import type { UnitOfWork } from "../unitOfWork";

export interface CreateRoomCommand {
  userId: string;
  name: string;
}

export interface CreateRoomResult {
  roomId: string;
  name: string;
  createdAt: string;
}

export interface CreateRoomUseCase {
  execute(command: CreateRoomCommand): Promise<CreateRoomResult>;
}

export interface CreateCreateRoomUseCaseOptions {
  roomRepository: RoomRepository;
  roomMemberRepository: RoomMemberRepository;
  unitOfWork: UnitOfWork;
  outboxEventPublisher: OutboxEventPublisher;
  runtime?: {
    createId?: () => string;
    now?: () => Date;
  };
}

export function createCreateRoomUseCase(
  options: CreateCreateRoomUseCaseOptions,
): CreateRoomUseCase {
  async function execute(
    command: CreateRoomCommand,
  ): Promise<CreateRoomResult> {
    const name = command.name.trim();
    if (!name) {
      throw new InvalidRoomNameError();
    }

    const roomId = options.runtime?.createId?.() ?? randomUUID();
    const createdAt = (options.runtime?.now?.() ?? new Date()).toISOString();

    const result = await options.unitOfWork.run(async () => {
      await options.roomRepository.create({
        id: roomId,
        name,
        createdBy: command.userId,
        createdAt,
      });
      await options.roomMemberRepository.add({
        roomId,
        userId: command.userId,
        role: "owner",
        joinedAt: createdAt,
      });
      await options.outboxEventPublisher.enqueue(createRoomCreatedEvent({
        roomId,
        ownerId: command.userId,
        name,
        createdAt,
      }));
      return { roomId, name, createdAt };
    });

    return result;
  }

  return { execute };
}
