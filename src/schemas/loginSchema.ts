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
      .min(8, "비밀번호는 8자 이상이어야 합니다.")
      .max(100, "비밀번호는 100자 이하로 입력하세요."),
  })
  .strict();

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const loginSchema = loginRequestSchema;
export type LoginInput = LoginRequest;
