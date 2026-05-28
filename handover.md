# roadnvill119b 운영관리 웹앱 인수인계

최종 업데이트: 2026-05-28

## 프로젝트

- GitHub: https://github.com/yularchive-maker/roadnvill9
- 배포 URL: https://roadnvill9.vercel.app
- 로컬 경로: `C:\Users\USER\roadnvill9`
- 기술 구조: Next.js 14 App Router, React, Supabase, Vercel
- 목적: 고객용 예약 사이트가 아닌 내부 운영관리 웹앱

## 인증/보안 기준

- `/dashboard` 및 내부 `/api`는 Supabase Auth 로그인 세션이 없으면 접근 불가
- 비로그인 API 요청은 401 응답
- public 주요 테이블은 RLS 활성화 및 authenticated 정책 적용
- `service_role` key는 서버 API route에서만 사용
- Telegram bot token은 서버 API route에서만 사용
- 실제 삭제 대신 `is_deleted`, `deleted_at` 기반 soft delete 우선

## 환경변수

공개 가능:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

서버 전용:

```env
SUPABASE_SERVICE_ROLE_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_AGENCY_CHAT_ID=
```

## 주요 기능

- 예약 등록/수정/취소
- 일반/사업비 단품 및 패키지 구성 예약
- 다구역 패키지
- 업체 가능 여부 확인 및 수동 회신 입력
- Telegram 업체 발송/버튼 회신
- 숙소/픽업 확정 관리
- 타임테이블
- 업체별 정산내역
- 정산 요약
- 사업비 관리 및 선지급 정산
- 상세 검색
- 수동 Excel 백업 다운로드

## 주요 API 보안 상태

로그인 필요:

- `/api/reservations`
- `/api/packages`
- `/api/vendors`
- `/api/zones`
- `/api/drivers`
- `/api/platforms`
- `/api/biz`
- `/api/vendor-confirms`
- `/api/lodge-confirms`
- `/api/notices`
- `/api/timetable`
- `/api/settle-history`
- `/api/backup/excel`
- Telegram 관리자 API

공개 예외:

- `/login`
- `/api/auth/logout`
- `/api/telegram/webhook` POST는 Telegram secret 검증 기준

## 로컬 실행

```bash
npm install
npm run dev
```

접속:

```text
http://localhost:3000/login
```

## 배포

GitHub `main`에 push하면 Vercel에서 자동 배포된다.

수동 확인:

```bash
npm run build
git status --short
git push origin main
```

## 운영 점검 체크리스트

- 비로그인 상태에서 `/dashboard` 접근 시 `/login`으로 이동
- 비로그인 상태에서 내부 API 요청 시 401
- Supabase Auth 직원 계정으로 로그인 가능
- 예약 등록/수정/취소 정상
- 업체 회신관리 수동 입력 정상
- Telegram 발송/회신 정상
- 사업비 관리 사용액/잔액/선지급 정산 정상
- 업체별 정산완료/정산취소 정상
- Excel 백업 다운로드 정상

## 주의

- `AGENTS.md`는 로컬 작업 지침 파일이며 커밋 대상이 아니다.
- 민감 키는 GitHub, `.env.example`, 클라이언트 코드에 넣지 않는다.
- DB 구조 변경은 Supabase SQL Editor에서 성공 확인 후 코드 반영한다.
