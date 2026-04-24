# 체험 예약 관리 시스템 — Handover 문서

최종 업데이트: 2026-04-24

---

## 1. 프로젝트 환경 정보

| 항목 | 값 |
|------|-----|
| GitHub 레포 | https://github.com/yularchive-maker/roadnvill9 |
| Vercel 계정 | roadnvill2026 (개인 계정, Hobby 플랜) |
| Vercel 프로젝트 | roadnvill2026/roadnvill9 |
| 배포 URL | https://roadnvill9.vercel.app |
| Supabase URL | https://ennasfdpaxrhedyrrpat.supabase.co |
| 로컬 경로 | C:\Users\USER\roadnvill9 |

### ⚠️ 현재 미해결 이슈
로그인 페이지 제거 작업을 진행했으나 배포 후에도 로그인 화면이 표시되는 문제가 있음.
코드 상으로는 로그인 관련 파일이 모두 삭제되어 있고 GitHub에도 반영됨 (커밋 886b14e).
새 PC에서 환경 설정 후 재확인 및 재배포 필요.

---

## 2. Vercel 재배포 이력 (2026-04-24)

### 팀 계정 → 개인 계정 전환 과정
1. 기존 팀 계정 `yularchive-maker` (Pro) → 삭제
2. 개인 계정 `roadnvill2026` (Hobby) 로 재배포
3. 환경변수 재설정: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 해결한 빌드 오류들
- `supabaseUrl is required` → `.vercel/project.json` 구 팀 프로젝트 참조 문제, 재연결로 해결
- `Builder returned invalid routes` → `middleware.js`의 `matcher: []` 빈 배열 문제, 파일 삭제로 해결
- `useSearchParams() Suspense 오류` → `reservations/page.js`를 서버 컴포넌트 래퍼로 분리

### CLI 재연결 방법 (새 PC)
```bash
# Vercel CLI 로그인
vercel logout
vercel login   # yul.archive3@gmail.com 또는 roadnvill2026 계정으로 로그인

# 프로젝트 연결
cd roadnvill9
rm -rf .vercel   # 기존 연결 초기화
vercel link --scope roadnvill2026 --project roadnvill9 --yes

# 배포
vercel --prod --yes
```

---

## 3. 기술 스택 및 아키텍처

- **Frontend**: Next.js 14 App Router, React (Client Components)
- **DB**: Supabase PostgreSQL (RLS 전체 비활성화)
- **배포**: Vercel Hobby (roadnvill2026)
- **인증**: 제거됨 (2026-04-24) — 로그인 없이 대시보드 직접 진입
- **경로 alias**: `@/` → 프로젝트 루트 (`jsconfig.json`)

### 환경변수 (.env.local — git 미포함, 로컬에만 존재)
```
NEXT_PUBLIC_SUPABASE_URL=https://ennasfdpaxrhedyrrpat.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVubmFzZmRwYXhyaGVkeXJycGF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MTc3NTksImV4cCI6MjA5MjA5Mzc1OX0.6lc158Z5V5YdVU1Re_jhz8RFnZ0Oyc8xzAYQuSAJVDQ
```

---

## 4. DB 테이블 목록 (Supabase)

| 테이블 | 용도 |
|--------|------|
| vendors | 업체 기준정보 |
| vendor_programs | 업체별 세부 프로그램 |
| zones | 구역 기준정보 |
| packages | 패키지 기준정보 |
| package_programs | 패키지-프로그램 연결 (vendor_key, default_start, duration_min) |
| platforms | 플랫폼/여행사 기준정보 |
| drivers | 픽업 기사 정보 |
| biz | 사업 정보 |
| biz_payments | 사업별 결제 내역 |
| reservations | 예약 메인 테이블 |
| reservation_pickup | 예약별 픽업 정보 |
| lodge_confirms | 숙소 확인 정보 |
| vendor_confirms | 업체 확인 정보 |
| notices | 날짜별 알림 |
| settle_history | 정산 이력 |
| settle_history_items | 정산 이력 항목 |
| timetable_events | 타임테이블 수동 일정 |
| lodges | 숙소 기준정보 (rooms jsonb) |

> 모든 테이블 RLS 비활성화 완료

---

## 5. 구현 완료 항목

| Priority | 페이지 | 상태 |
|----------|--------|------|
| 1 | 로그인 | 제거됨 (2026-04-24) |
| 2 | 대시보드 (`/dashboard`) | ✅ 완료 |
| 3 | 기준 정보 (`/dashboard/master`) | ✅ 완료 |
| 4 | 예약 관리 (`/dashboard/reservations`) | ✅ 완료 |
| 5 | NOTICE (`/dashboard/notice`) | ✅ 완료 |
| 6 | 타임테이블 (`/dashboard/timetable`) | ✅ 완료 |
| 7 | 업체별 정산내역 (`/dashboard/settle-detail`) | ✅ 완료 |
| 8 | 정산 요약 (`/dashboard/settle-summary`) | ✅ 완료 |
| 9 | 사업비 관리 (`/dashboard/biz`) | ✅ 완료 |

---

## 6. 알려진 버그

| # | 위치 | 내용 | 심각도 |
|---|------|------|--------|
| Bug-1 | `ReservationDetail.js` | LODGE_MASTER 하드코딩 잔존, /api/lodges DB 연동 필요 | 🔴 높음 |
| Bug-2 | `timetable_events` | vendor/customer/pkg 컬럼 코드 미사용이나 DB DROP 미실행 | 🔴 높음 |
| Bug-3 | 예약 모달 | 패키지 선택 시 1인 판매가 자동입력 미구현 (packages.unit_price 컬럼 없음) | 🟡 중간 |
| Bug-4 | 배포 | 로그인 제거 코드 반영됐으나 배포 후 로그인 페이지 표시 문제 미해결 | 🔴 높음 |

### Bug-2 수정 SQL (Supabase 대시보드에서 실행)
```sql
ALTER TABLE timetable_events
  DROP COLUMN IF EXISTS vendor,
  DROP COLUMN IF EXISTS customer,
  DROP COLUMN IF EXISTS pkg;
```

---

## 7. 새 PC에서 작업 시작하는 방법

### 7-1. 환경 설정
```bash
# 1. 레포 클론
git clone https://github.com/yularchive-maker/roadnvill9.git
cd roadnvill9

# 2. 의존성 설치
npm install

# 3. 환경변수 파일 생성 (.env.local)
# 아래 내용으로 파일 직접 생성
```

**.env.local 내용:**
```
NEXT_PUBLIC_SUPABASE_URL=https://ennasfdpaxrhedyrrpat.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVubmFzZmRwYXhyaGVkeXJycGF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MTc3NTksImV4cCI6MjA5MjA5Mzc1OX0.6lc158Z5V5YdVU1Re_jhz8RFnZ0Oyc8xzAYQuSAJVDQ
```

```bash
# 4. 로컬 개발 서버
npm run dev
# → http://localhost:3000 접속 (로그인 없이 바로 대시보드)
```

### 7-2. Vercel 배포
```bash
# Vercel CLI 설치 (없으면)
npm i -g vercel

# 로그인 (yul.archive3@gmail.com)
vercel login

# 프로젝트 연결
vercel link --scope roadnvill2026 --project roadnvill9 --yes

# 프로덕션 배포
vercel --prod --yes
```

### 7-3. Bug-4 해결 방법 (로그인 페이지 여전히 표시 문제)
코드는 이미 수정됨 (커밋 886b14e). 새 PC에서 아래 순서로 확인:
1. `git log --oneline -3` 으로 최신 커밋 확인
2. `npm run dev` 로 로컬에서 http://localhost:3000 접속 → 대시보드 바로 진입하면 코드 정상
3. 로컬 정상이면 `vercel --prod --yes` 로 재배포
4. 브라우저 캐시 강제 초기화: Ctrl+Shift+R

---

## 8. 주요 파일 구조

```
roadnvill9/
├── app/
│   ├── globals.css                          # 전체 CSS
│   ├── page.js                              # / → /dashboard 리다이렉트
│   └── dashboard/
│       ├── layout.js                        # 사이드바 + 탑바 (인증 없음)
│       ├── page.js                          # 대시보드
│       ├── reservations/
│       │   ├── page.js                      # 서버 래퍼 (Suspense + force-dynamic)
│       │   └── ReservationsPage.js          # 예약 관리 클라이언트 컴포넌트
│       ├── master/page.js                   # 기준 정보
│       ├── notice/page.js                   # NOTICE
│       ├── timetable/page.js                # 타임테이블
│       ├── settle-detail/page.js            # 업체별 정산내역
│       ├── settle-summary/page.js           # 정산 요약
│       └── biz/page.js                      # 사업비 관리
├── app/api/
│   ├── reservations/route.js + [no]/route.js
│   ├── vendors/route.js + [key]/route.js
│   ├── zones/route.js
│   ├── packages/route.js + [id]/route.js
│   ├── platforms/route.js
│   ├── drivers/route.js
│   ├── notices/route.js
│   ├── biz/route.js + [id]/route.js
│   ├── timetable/route.js
│   ├── vendor-confirms/route.js
│   ├── lodge-confirms/route.js
│   └── settle-history/route.js
├── lib/
│   └── supabase.js                          # Supabase 클라이언트
├── .vercel/project.json                     # roadnvill2026/roadnvill9 연결 정보
├── jsconfig.json                            # @/ 경로 alias
├── next.config.js
└── .env.local                               # (git 미포함) 환경변수
```
