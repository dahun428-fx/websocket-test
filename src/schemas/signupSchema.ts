import { z } from "zod";

export const signupRequestSchema = z.object({
  userId: z
    .string()
    .trim()
    .min(4, "사용자 ID는 4자 이상이어야 합니다.")
    .max(30, "사용자 ID는 30자 이하로 입력하세요.")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "사용자 ID는 영문, 숫자, 밑줄, 하이픈만 사용할 수 있습니다.",
    ),

  nickname: z
    .string()
    .trim()
    .min(1, "닉네임을 입력하세요.")
    .max(20, "닉네임은 20자 이하로 입력하세요."),

  password: z
    .string()
    .min(8, "비밀번호는 8자 이상이어야 합니다.")
    .max(100, "비밀번호는 100자 이하로 입력하세요."),
});

export type SignupRequest = z.infer<typeof signupRequestSchema>;
