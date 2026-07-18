export const ERROR_MESSAGES = {
  MESSAGE_PARSE_FAILED: "메시지를 해석할 수 없습니다.",
  ALREADY_REGISTERED: "이미 닉네임을 등록하고 방에 입장한 상태입니다.",
  INVALID_ACCESS_TOKEN: "올바르지 않은 인증 토큰입니다.",
  ACCESS_TOKEN_EXPIRED: "인증 토큰이 만료되었습니다.",
  NICKNAME_REQUIRED: "닉네임을 입력하세요.",
  ROOM_ID_REQUIRED: "방 ID를 입력하세요.",
  NICKNAME_TOO_LONG: "닉네임은 20자 이하로 입력하세요.",
  ROOM_ID_TOO_LONG: "방 ID는 20자 이하로 입력하세요.",
  NICKNAME_NOT_REGISTERED: "먼저 닉네임을 등록하세요.",
  ROOM_NOT_JOINED: "먼저 채팅방에 입장하세요.",
  CHAT_REQUIRED: "메시지를 입력하세요.",
  CHAT_TOO_LONG: "메시지는 1000자 이하로 입력하세요.",
  INTERNAL_SERVER_ERROR: "서버 내부 오류가 발생했습니다.",
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGES;
