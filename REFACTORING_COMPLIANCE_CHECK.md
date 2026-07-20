# 리팩토링 완료 점검

- 완료일: 2026-07-20
- 기준: `REFACTORING_REVIEW.md`, `CODE_REVIEW.md`
- 판정: **두 문서의 필수 수정 및 권장 리팩토링 완료**

## 변경사항 재리뷰 결과

- 범위: `dev` 기준 추적 파일 30개 수정, 신규 경로 8개, staged 변경 없음
- 추적 파일 diff: `+749 / -1583` (대부분 `src/server.ts` 책임 분리와 레거시 제거)
- 최종 판정: **개선 반영 후 승인 가능**
- 종합 평가: **8.8 / 10**

| 축 | 점수 | 평가 |
|---|---:|---|
| 정확성 | 9.0 | 생명주기·DB·HTTP·WebSocket 회귀 테스트가 핵심 경로를 검증함 |
| 가독성·단순성 | 8.5 | 490줄 서버가 조립·HTTP·채팅 런타임으로 분리되어 책임이 선명해짐 |
| 아키텍처 | 9.2 | 전역 DB와 import-time 실행을 제거하고 의존성 방향과 테스트 격리를 개선함 |
| 보안 | 8.3 | 입력 크기, rate limit, timing 완화, JWT 소유권, 비밀값 외부화를 반영함 |
| 성능·운영성 | 8.8 | 메시지 큐, heartbeat, 제한된 히스토리 조회, graceful shutdown을 검증함 |

### 재리뷰에서 직접 개선한 사항

1. **로그인 제한 우회 차단**: 성공 로그인이 IP rate-limit 카운터를 초기화하지 않도록 변경하고 회귀 테스트를 추가했다.
2. **닉네임 신뢰 출처 단일화**: WebSocket 등록 메시지와 브라우저 payload에서 중복 닉네임을 제거하고 JWT 필수 클레임만 사용한다.
3. **SQLite 외래 키 활성화 수정**: 트랜잭션 안에서는 효과가 없던 `PRAGMA foreign_keys = ON`을 트랜잭션 앞으로 이동하고 실제 활성화 테스트를 추가했다.

### 남은 비차단 피드백

1. 현재 rate limiter는 프로세스 로컬 `Map`이므로 다중 인스턴스 운영에서는 공유 저장소 기반 제한이 필요하다. 신뢰할 프록시가 있다면 실제 클라이언트 IP 해석 정책도 함께 정의해야 한다.
2. JSON 엔드포인트가 `Content-Type: application/json`을 강제하지 않는다. 외부 API 계약으로 공개할 경우 415 응답과 브라우저 요청 헤더를 함께 추가하는 편이 명확하다.
3. 정적 페이지 CSP가 인라인 스크립트와 스타일 때문에 `unsafe-inline`을 허용한다. 운영 노출 시 별도 파일 또는 nonce 기반 CSP로 강화할 수 있다.
4. 변경량이 2천 줄을 넘으므로 실제 커밋은 `애플리케이션/DB 생명주기`, `HTTP 인증 보안`, `WebSocket 런타임과 레거시 제거`, `문서·환경 설정`으로 나누는 편이 리뷰와 롤백에 유리하다.
5. lint/format 스크립트가 없어 파일별 들여쓰기 차이를 자동 검증하지 못한다. 동작 변경과 분리된 후속 작업으로 추가하는 것이 안전하다.

## 완료 현황

| 구분 | 완료 |
|---|---:|
| 리팩토링 전 선행 수정 | 3/3 |
| 구조 리팩토링 P1~P3 | 8/8 |
| 소스 코드 리뷰 발견 사항 | 7/7 |

## 주요 구현

- `src/application.ts`: 독립 DB를 사용하는 `createApplication()`과 idempotent `start()`/`stop()` 생명주기 구현
- `src/main.ts`: 환경 로딩, 포트, 프로세스 시그널 처리만 담당하는 실행 진입점
- `src/database/database.ts`: 전역 연결을 제거한 `openDatabase()`와 트랜잭션 기반 스키마 초기화
- `src/repositories/`: DB 연결을 주입받는 저장소 팩토리와 원자적 사용자 생성
- `src/auth/authHttpHandler.ts`: 로그인/회원가입 공통 JSON 파싱·Zod 검증·16 KiB 제한·HTTP 계약·로그인 rate limit
- `src/service/authService.ts`: 존재하지 않는 사용자도 dummy bcrypt 검증을 수행하는 인증 서비스
- `src/chat/chatRuntime.ts`: `attachChatRuntime()` 뒤에 WebSocket 조립, `maxPayload`, heartbeat와 종료 절차 캡슐화
- `src/handlers/`: handler별 최소 의존성 팩토리와 등록 실패 rollback/연결 종료
- `src/auth/tokenService.ts`: 사용자 ID와 닉네임을 모두 검증하는 JWT payload 소유권 정리
- `.env.example`, `README.md`, `src/scripts/seedUsers.ts`: 데모 자격 증명을 환경 변수로 이전
- 레거시 `service/roomService.js`, `repositories/messageRepository.js`, 중복 `src/types/auth.ts` 제거

## 회귀 테스트

- 정상 JSON 회원가입과 중복 ID 충돌
- HTTP payload 허용 경계 및 1 byte 초과 413
- WebSocket `maxPayload` 초과 시 close code 1009
- 서로 다른 사용자 ID를 사용해도 IP 기준 로그인 rate limit 적용
- 존재하지 않는 사용자의 dummy bcrypt 검증
- 히스토리 전송 실패 시 등록 상태 rollback 및 소켓 종료
- 닉네임 없는 JWT 거부
- 동일 SQLite 파일의 동시 스키마 초기화 및 초기화 실패 후 복구
- 애플리케이션 시작 실패 정리와 반복 종료

## 최종 검증

| 명령 | 결과 |
|---|---|
| `npm test` | 16개 파일, 62개 테스트 통과 |
| `npm run typecheck` | 통과 |
| `npm run build` | 통과 |
| `npm run check:heartbeat` | 통과 |
| `npm audit --audit-level=high` | 취약점 0개 |
| `git diff --check` | 오류 없음 |
