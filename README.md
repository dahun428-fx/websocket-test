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
