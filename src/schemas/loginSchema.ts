import { z } from "zod";

export const loginRequestSchema = z
  .object({
    userId: z
      .string()
      .trim()
      .min(1, "사용자 ID를 입력하세요.")
      .max(50, "사용자 ID는 50자 이하로 입력하세요."),

    password: z
      .string()
      .min(1, "비밀번호를 입력하세요.")
      .max(100, "비밀번호는 100자 이하로 입력하세요."),
  })
  .strict();

export type LoginRequest = z.infer<typeof loginRequestSchema>;
