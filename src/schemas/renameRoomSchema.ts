import { z } from "zod";

export const renameRoomSchema = z.object({
  name: z.string().trim().min(1, "채팅방 이름을 입력하세요."),
});

export type RenameRoomRequest = z.infer<typeof renameRoomSchema>;
