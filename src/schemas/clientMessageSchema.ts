import { z } from 'zod'

export const registerMessageSchema = z.object({
    type: z.literal('register'),
    token: z.string().trim().min(1, "인증 토큰이 필요합니다."),
    nickname: z.string().trim().min(1, '닉네임을 입력하세요.').max(20, '닉네임은 20자 이하로 입력하세요.'),
    room_id: z.string().trim().min(1, "방 ID를 입력하세요.").max(20, "방 ID는 20자 이하로 입력하세요."),
})

export const chatInputMessageSchema = z.object({
    type: z.literal('chat'),
    message: z.string().trim().min(1, "메시지를 입력하세요.").max(1000, "메시지는 1000자 이하로 입력하세요.")
})

export const historyRequestMessageSchema = z.object({
    type: z.literal('history-request'),
    before_id: z.number().int().positive(),
    limit: z.number().int().min(1).max(100).default(30)
})

export const clientMessageSchema = z.discriminatedUnion('type', [
    registerMessageSchema,
    chatInputMessageSchema,
    historyRequestMessageSchema
])

export type RegisterMessage = z.infer<typeof registerMessageSchema>;
export type ChatInputMessage = z.infer<typeof chatInputMessageSchema>;
export type HistoryRequestMessage = z.infer<typeof historyRequestMessageSchema>;
export type ClientMessage = z.infer<typeof clientMessageSchema>;
