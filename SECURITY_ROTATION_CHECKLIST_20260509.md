# Security Rotation Checklist

작성일: 2026-05-09

## 목적

운영 배포 전 외부에 노출될 가능성이 있었던 토큰과 서버 키를 회수/교체한다.

## 현재 확인 상태

- Git remote URL에서 GitHub token 제거 완료
- 현재 커밋의 코드/문서에서 실제 GitHub token, Telegram token, Supabase service role key 값 미검출
- `.env.local`은 git 추적 대상 아님
- `.env.example`에는 실제 값 없이 변수명만 존재
- Vercel Production 환경변수에 서버 전용 변수 등록 완료

## 운영 전 필수 조치

### 1. GitHub personal access token revoke

이전에 로컬 git remote URL에 GitHub token이 포함되어 있었으므로 GitHub에서 해당 token을 revoke한다.

경로:

- GitHub
- Settings
- Developer settings
- Personal access tokens
- 노출 가능성이 있던 token revoke

### 2. Telegram bot token revoke

Telegram bot token은 대화 중 노출된 적이 있으므로 운영 전 새 token으로 교체한다.

절차:

1. BotFather 접속
2. `/mybots`
3. `roadnvill_vendor_reply_bot` 선택
4. API Token 메뉴
5. Revoke current token
6. 새 token 발급
7. `.env.local`의 `TELEGRAM_BOT_TOKEN` 교체
8. Vercel Production `TELEGRAM_BOT_TOKEN` 교체

### 3. Supabase service role key rotate

Supabase service role key는 서버 전용으로만 사용 중이지만, 운영 전 보안 강화를 위해 rotate를 권장한다.

절차:

1. Supabase Dashboard 접속
2. Project Settings
3. API
4. service_role key rotate 또는 새 secret 확인
5. `.env.local`의 `SUPABASE_SERVICE_ROLE_KEY` 교체
6. Vercel Production `SUPABASE_SERVICE_ROLE_KEY` 교체

### 4. Telegram webhook secret 유지 또는 재생성

`TELEGRAM_WEBHOOK_SECRET`은 Telegram webhook 요청 검증용이다.

- 외부에 공유하지 않는다.
- Vercel Production과 `.env.local` 값이 일치해야 한다.
- 값을 바꾸면 webhook을 다시 등록한다.

## 교체 후 검증

1. `npm.cmd run build`
2. Vercel Production 재배포
3. 운영 URL 로그인 확인
4. 기준정보 > 체험 업체 > Telegram webhook 상태 확인
5. 운영 URL 기준 webhook 등록
6. 업체 Telegram 버튼 회신 테스트
