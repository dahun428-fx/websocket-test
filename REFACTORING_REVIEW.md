# 리팩토링 관점 코드 리뷰

- 리뷰 일자: 2026-07-19
- 대상: 현재 작업 트리의 `src/`, 테스트, 루트의 레거시 JavaScript 파일
- 관점: 모듈 깊이, 책임의 응집도, 의존성 방향, 테스트 격리성, 중복 제거
- 주의: 미커밋 상태의 회원가입 구현을 포함해 검토했으며 소스 자체는 수정하지 않았다.

## 결론

현재 가장 큰 리팩토링 기회는 `server.ts`를 단순히 여러 파일로 나누는 것이 아니라, 애플리케이션 생성과 종료를 하나의 깊은 모듈 뒤로 숨기는 것이다. 그 다음으로 전역 DB와 거대한 `MessageHandlerContext`를 제거하면 테스트 격리성과 변경 지역성이 크게 좋아진다.

반면 `roomService`나 Zod 스키마처럼 이미 책임이 분명한 모듈을 더 잘게 쪼개는 것은 이득이 적다. 프레임워크, DI 컨테이너, 범용 저장소 계층을 새로 도입할 규모도 아니다.

## 리팩토링 전 선행 수정

현재 작업 중인 회원가입 흐름에는 구조 변경 전에 고정해야 할 동작 문제가 있다.

### 1. 회원가입 본문이 JSON으로 파싱되지 않는다

- `src/server.ts:119`에서 `readRequestBody`가 반환한 문자열을 받는다.
- `src/server.ts:127`에서 그 문자열을 그대로 `signupRequestSchema.safeParse`에 전달한다.
- 스키마는 객체를 기대하므로 정상적인 JSON 요청도 검증에 실패한다.

로그인과 회원가입이 각각 본문 읽기, JSON 파싱, Zod 검증을 구현하면서 한쪽 단계가 누락된 사례다. 공통 JSON 요청 파서로 합치면 중복 제거와 함께 같은 종류의 회귀를 막을 수 있다.

### 2. `/signup` 라우트가 연결되지 않았다

- `src/server.ts:113-150`에 `handleSignup`이 있지만 `src/server.ts:167-196`의 라우터에서 호출하지 않는다.

현재 함수는 도달 불가능한 코드다. 회원가입 통합 테스트를 먼저 추가해 라우팅과 응답 계약을 고정해야 한다.

### 3. 회원가입 중복 확인이 원자적이지 않다

- `src/service/authService.ts:47`에서 존재 여부를 확인하고 `src/service/authService.ts:56`에서 별도로 생성한다.
- 동시 요청 두 개가 모두 확인을 통과하면 한 요청은 SQLite의 기본 키 제약 오류로 500 응답이 된다.

`existsById` 선조회 대신 `create`를 시도하고 저장소가 유일성 충돌을 식별 가능한 결과로 변환하도록 하는 편이 낫다. 그러면 `UserRepository`의 인터페이스도 줄고 TOCTOU 경쟁도 사라진다.

## 우선순위별 리팩토링 제안

### [P1] 1. 서버 싱글턴을 애플리케이션 팩토리로 바꾼다

현재 `src/server.ts`는 다음 책임을 모두 가진 467줄의 조립 지점이다.

- 환경 변수와 포트 해석
- DB 시작과 종료
- HTTP 라우팅 및 직렬화
- 정적 파일 제공
- WebSocket 서버 생성
- 채팅 의존성 조립
- 연결 이벤트와 메시지 큐 처리
- heartbeat 시작과 종료
- 프로세스 시그널 등록

특히 모듈을 import하는 순간 HTTP/WebSocket 싱글턴과 시그널 핸들러가 생성된다. `src/server.test.ts:10`은 이 싱글턴을 가져와 직접 열고 닫으며, 전역 DB와 환경 변수까지 함께 관리해야 한다. 테스트가 애플리케이션 인터페이스가 아니라 내부 생명주기를 알고 있는 상태다.

권장 인터페이스:

```ts
interface Application {
  server: http.Server;
  start(port?: number): Promise<number>;
  stop(): Promise<void>;
}

function createApplication(options: ApplicationOptions): Application;
```

`createApplication` 내부에서 DB, 저장소, 인증, HTTP, WebSocket, heartbeat를 조립하고 `main.ts`는 dotenv 로딩, 시그널 연결, `start` 호출만 담당하게 한다. 호출자가 알아야 할 초기화 순서와 종료 순서가 이 모듈 안으로 사라지므로 단순 파일 분리보다 효과가 크다.

완료 기준:

- 테스트마다 독립된 애플리케이션과 임시 DB를 생성할 수 있다.
- `server.ts` 또는 `main.ts` import만으로 시그널 핸들러나 네트워크 객체가 생성되지 않는다.
- 시작 실패와 반복 종료를 애플리케이션 인터페이스를 통해 검증한다.

### [P1] 2. 전역 DB 접근을 저장소 팩토리 내부로 제한한다

현재 저장소는 인터페이스를 선언하지만 구현은 `getDatabase()` 전역 상태를 직접 조회한다.

- `src/repositories/userRepository.ts:45-46`
- `src/repositories/messageRepository.ts:46-50`

그래서 테스트는 저장소만 준비하는 대신 전역 `initializeDatabase`와 `closeDatabase` 순서를 공유한다. 저장소 인터페이스는 seam처럼 보이지만 실제 SQLite adapter의 생성 시점은 외부에서 통제할 수 없다.

권장 형태:

```ts
const db = await openDatabase(databasePath);
const userRepository = createUserRepository(db);
const messageRepository = createMessageRepository(db);
```

SQLite는 로컬 대체 가능 의존성이므로 테스트에서도 실제 임시 SQLite를 사용하면 된다. 인증 모듈 단위 테스트에 필요한 최소 사용자 저장소 인터페이스만 유지하고, 범용 DB 추상화는 만들지 않는다.

추가 정리:

- `MessageRepository.clear`는 운영 호출자가 사용하지 않는 테스트 전용 메서드다. 외부 인터페이스에서 제거하고 테스트 fixture가 DB를 정리하게 한다.
- `UserRepository.existsById`는 원자적 생성으로 전환한 뒤 제거한다.

### [P1] 3. HTTP 인증 adapter에서 요청 처리 규칙을 한 번만 구현한다

`handleLoginRequest`와 `handleSignup`은 본문 읽기, JSON 해석, 스키마 검증, 오류 응답 변환을 반복한다. 이미 회원가입 구현에서 JSON 파싱 누락이 발생했으므로 중복 비용이 실제 결함으로 나타났다.

다음 책임을 HTTP 인증 adapter 하나에 모은다.

- 요청 크기 제한과 UTF-8 본문 읽기
- JSON 파싱
- Zod 스키마 검증
- 인증 결과를 HTTP 상태와 응답 DTO로 변환
- 허용 메서드와 `Allow` 헤더 처리

단, 모든 라우트를 위한 범용 프레임워크나 추상 라우터를 직접 만들 필요는 없다. 현재는 `createAuthHttpHandler(authService)` 정도의 작은 외부 인터페이스가 충분하다.

완료 기준:

- 로그인과 회원가입이 같은 JSON 파싱 경로를 사용한다.
- HTTP 테스트가 실제 소켓 대신 handler 호출과 소수의 애플리케이션 통합 테스트로 나뉜다.
- 잘못된 JSON, 스키마 오류, 중복 ID의 응답 계약이 한 위치에 있다.

### [P2] 4. 거대한 `MessageHandlerContext`와 얕은 핸들러 인터페이스를 줄인다

`src/types/handler.ts:14-34`의 `MessageHandlerContext`는 모든 핸들러에 모든 의존성을 전달한다. 실제로는 다음처럼 사용 범위가 다르다.

- register: room, 전송, 오류, 히스토리, 시간
- chat: room, 저장소, 오류, 시간
- history: 저장소, 전송, 오류, 시간

또한 `RegisterHandler`, `ChatHandler`, `HistoryHandler`는 거의 같은 `handle` 형태를 반복하고, 객체의 `type` 속성은 `messageDispatcher`에서 사용되지 않는다. 이 모듈들은 인터페이스 면적에 비해 숨기는 구현이 적은 얕은 모듈이다.

권장 방향:

- 각 handler를 필요한 의존성만 받는 생성 함수로 만든다.
- 사용하지 않는 `{ type, handle }` 객체 대신 명확한 처리 함수를 반환한다.
- dispatcher의 명시적 `switch`는 메시지 종류가 세 개인 현재 규모에서는 유지한다. 동적 registry는 오히려 타입 추론과 탐색성을 악화시킨다.

예시:

```ts
const handleChat = createChatHandler({ messageRepository, roomService, clock });
await handleChat(socket, message);
```

`sendRoomHistory`처럼 `server.ts`에 구현된 특수 콜백을 context로 넘기지 말고, 히스토리 조회와 응답 생성을 채팅 프로토콜 모듈 안에 모아야 한다.

### [P2] 5. HTTP/도메인/JWT 타입의 소유권을 정리한다

현재 인증 타입은 여러 위치에 겹쳐 있다.

- `src/schemas/loginSchema.ts:18`과 `src/types/auth.ts:6-9`에 `LoginRequest`가 중복된다.
- `src/types/auth.ts:20-26`의 `AuthResponse`, `LoginResponse`, `SignupResponse`는 같은 구조의 별칭이다.
- `src/service/authService.ts:6`의 `AuthResult`가 다시 `AuthResponse`를 감싼다.
- `src/service/authService.ts:7`의 `SingupInput`은 오탈자이며 스키마 입력과 별도 정의다.
- `AuthService.signup`은 `Promise<SignupResult | null>`로 선언됐지만 구현은 `null`을 반환하지 않는다.

권장 소유권:

- HTTP 입력 타입: Zod 스키마에서 `z.infer`로만 생성
- 인증 모듈 입력과 결과: `authService.ts`가 소유
- JWT payload: `tokenService.ts`가 소유
- HTTP 응답 DTO: 인증 HTTP adapter가 소유하거나 도메인 결과를 그대로 쓸 경우 별칭 없이 공유

타입 파일을 한곳에 모으는 것이 목적이 아니라, 타입이 표현하는 규칙을 구현과 가까운 곳에 두는 것이 목적이다.

### [P2] 6. WebSocket 런타임을 하나의 깊은 모듈로 묶는다

`src/server.ts:213` 이후에는 전송, 오류 변환, 히스토리 조회, 메시지 파싱, 큐잉, 접속/종료, heartbeat가 이어진다. 이 동작들은 모두 “HTTP 서버에 채팅 프로토콜을 부착한다”는 하나의 기능을 이룬다.

권장 인터페이스:

```ts
interface ChatRuntime {
  close(): Promise<void>;
}

function attachChatRuntime(
  server: http.Server,
  dependencies: ChatDependencies,
): ChatRuntime;
```

내부 파일은 parser, handlers, heartbeat, queue로 유지해도 되지만 외부 호출자는 조립 순서와 `MessageHandlerContext`를 몰라야 한다. 애플리케이션 팩토리에는 `attachChatRuntime` 한 번만 보이게 하는 것이 목표다.

### [P3] 7. 저장소 내부 중복을 private 구현으로 합친다

`src/repositories/messageRepository.ts:78-108`의 `get`과 `src/repositories/messageRepository.ts:110-145`의 `getBefore`는 조회 조건 하나를 제외하면 정렬, `limit + 1`, `hasMore`, reverse, cursor 계산이 같다.

공개 메서드는 의미가 다르므로 유지하되, 행을 페이지로 바꾸는 private 함수와 조회 실행의 공통 부분만 합치는 것이 적절하다. SQL을 과도하게 동적으로 조립하거나 범용 query builder를 도입할 필요는 없다.

### [P3] 8. 사용되지 않는 레거시와 작은 노이즈를 제거한다

- 루트의 `service/roomService.js`와 `repositories/messageRepository.js`는 추적 중이지만 현재 TypeScript 코드에서 참조되지 않는 이전 구현이다.
- `src/scripts/createPasswordHash.ts:2-3`의 `error`, `unknown` import는 사용되지 않는다.
- 저장소 SQL 들여쓰기와 일부 파일의 포맷이 서로 달라 탐색 비용이 생긴다.

레거시 JavaScript 파일은 TypeScript 구현과 이름이 같아 검색 결과와 유지보수 판단을 흐린다. 참조가 없음을 확인한 뒤 삭제하는 것이 좋다. 포맷은 별도 대규모 수정 대신 formatter 설정 후 변경 파일부터 적용한다.

## 권장 목표 구조

정확한 파일명보다 의존성 방향이 중요하다.

```text
src/
  main.ts                    # 환경 로딩, 시그널, start 호출만
  application.ts             # createApplication, 전체 조립과 생명주기
  auth/
    authService.ts           # login/signup 규칙과 결과
    authHttpHandler.ts       # HTTP adapter
    loginSchema.ts
    signupSchema.ts
    passwordService.ts
    tokenService.ts
  chat/
    chatRuntime.ts           # WebSocket 부착과 종료 인터페이스
    handlers/
    messageParser.ts
    messageQueue.ts
    roomService.ts
    heartbeat.ts
  persistence/
    database.ts
    userRepository.ts
    messageRepository.ts
```

이 구조에서 `application.ts`는 구체 구현을 조립하고, 인증과 채팅 모듈은 서로를 직접 참조하지 않는다. 공유 `types/` 폴더는 실제로 여러 모듈이 함께 소유하는 프로토콜 타입만 남긴다.

## 테스트 리팩토링

리팩토링 후에는 기존 테스트 위에 새 테스트를 계속 쌓기보다 모듈의 새 인터페이스를 기준으로 교체한다.

1. `createApplication` 테스트: 임시 SQLite로 로그인, 회원가입, WebSocket 주요 흐름 검증
2. 인증 모듈 테스트: 저장소 fake를 사용해 login/signup 결과와 중복 ID 매핑 검증
3. 인증 HTTP adapter 테스트: JSON, Zod, 상태 코드와 응답 DTO 검증
4. 채팅 런타임 테스트: 실제 로컬 WebSocket 연결로 등록, 채팅, 히스토리, 종료 검증
5. 저장소 테스트: 실제 임시 SQLite를 사용하고 전역 상태 없이 병렬 실행 가능하게 구성

`handlers.test.ts`처럼 내부 context 호출과 mock 상호작용을 세밀하게 검사하는 테스트는 채팅 런타임의 관찰 가능한 결과 테스트가 자리 잡은 뒤 축소한다. 내부 구현을 옮길 때마다 테스트가 함께 깨지지 않아야 한다.

## 실행 순서

1. 회원가입 통합 테스트를 추가하고 JSON 파싱, 라우팅, 중복 생성 경쟁을 수정한다.
2. DB와 저장소를 인스턴스 팩토리로 바꾸고 전역 상태를 제거한다.
3. `createApplication`을 만들고 서버 테스트를 인스턴스 기반으로 전환한다.
4. HTTP 인증 adapter를 추출해 로그인/회원가입 중복을 제거한다.
5. WebSocket 코드를 `attachChatRuntime` 뒤로 이동한다.
6. 핸들러 context와 중복 타입을 축소하고 새 인터페이스 기준으로 테스트를 정리한다.
7. 레거시 JavaScript와 사용하지 않는 import를 제거한다.

각 단계마다 기존 동작 테스트, 타입 검사, 빌드를 통과시킨 뒤 다음 단계로 넘어가야 한다. 한 번에 디렉터리 전체를 이동하면 기능 변경과 구조 변경의 원인을 분리하기 어렵다.

## 권장하지 않는 리팩토링

- Express/Fastify 도입: 현재 라우트 수만으로는 마이그레이션 비용보다 이득이 작다.
- DI 컨테이너 도입: 명시적인 팩토리 함수 조립으로 충분하다.
- 범용 `BaseRepository<T>`: 서로 다른 쿼리 의미를 숨기지 못하고 타입만 복잡하게 만든다.
- 이벤트 버스 도입: 현재 프로세스 내부의 직접 호출이 더 명확하다.
- `roomService` 세분화: 현재 인터페이스는 연결 검색과 방 브로드캐스트라는 응집된 규칙을 충분히 숨기고 있다.
