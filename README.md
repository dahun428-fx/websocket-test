# websocket-test

SQLite, HTTP 인증, WebSocket 채팅을 사용하는 TypeScript 예제 서버입니다.

## 시작

```sh
npm install
cp .env.example .env
npm run seed:users
npm run build
npm start
```

`.env`의 `JWT_SECRET`과 `SEED_USER_PASSWORD`는 로컬에서 직접 정한 값으로 교체해야 합니다. 운영 환경에서는 충분히 긴 무작위 값을 사용하고 `.env`를 커밋하지 마세요.

## 검증

```sh
npm test
npm run typecheck
npm run build
npm run check:heartbeat
npm audit --audit-level=high
```

서버 조립은 `createApplication()`이 담당하고, 실행 환경 및 프로세스 시그널 처리는 `src/main.ts`에만 있습니다.

## 로그인 요청 제한

`POST /login`은 동일한 클라이언트 IP와 `userId` 조합에 대해 기본 1분당 5회로 제한됩니다. 여러 서버가 카운터를 공유하려면 `REDIS_ENABLED=true`와 `REDIS_URL`을 설정하세요. Redis 장애 시 기본값은 `RATE_LIMIT_FAIL_MODE=open`이며, 요청을 차단하려면 `closed`로 변경할 수 있습니다. `TRUST_PROXY=true`는 신뢰할 수 있는 리버스 프록시가 직접 연결을 통제할 때만 사용하세요.

실제 Redis 통합 테스트는 다음처럼 실행합니다.

```sh
TEST_REDIS_URL=redis://127.0.0.1:6379 npm test -- src/rateLimit/redisRateLimiter.integration.test.ts
```

## Room Cache-Aside

인증된 `GET /rooms/:roomId` 요청은 Redis cache hit를 우선 사용하고, miss 또는 Redis 장애 시 SQLite를 조회합니다. 조회 결과는 기본 300초 동안 `cache:v1:room` namespace에 저장됩니다. 방 소유자가 `PATCH /rooms/:roomId`로 이름을 변경하면 해당 cache key를 삭제합니다.

TTL은 `CACHE_ROOM_TTL_SECONDS`로 조정할 수 있으며, 실제 Redis cache 테스트는 다음처럼 실행합니다.

```sh
TEST_REDIS_URL=redis://127.0.0.1:6379 npm test -- src/cache/redisCache.integration.test.ts
```
