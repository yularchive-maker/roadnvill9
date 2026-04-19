# 체험 예약 관리 시스템 — Handover 문서

작성일: 2026-04-19

---

## 1. 프로젝트 환경 정보

| 항목 | 값 |
|------|-----|
| GitHub 계정 | yularchive-maker |
| GitHub 레포 | https://github.com/yularchive-maker/roadnvill9 |
| Supabase URL | https://ennasfdpaxrhedyrrpat.supabase.co |
| Vercel URL | https://roadnvill9-52w6vay13-yularchive-maker.vercel.app |
| 배포 방식 | GitHub main 브랜치 push 시 Vercel 자동 배포 |
| 로컬 경로 (이전 PC) | C:\Users\USER\roadnvill9 |

### 로그인 계정 (하드코딩, sessionStorage 기반)
| 구분 | 아이디 | 비밀번호 |
|------|--------|----------|
| 관리자 | admin@experience.com | Admin1234! |
| 직원 | staff@experience.com | Staff5678@ |

### 기술 스택
- **Frontend**: Next.js 14 App Router, React (Client Components)
- **DB**: Supabase PostgreSQL (RLS 전체 비활성화 완료)
- **배포**: Vercel
- **인증**: 하드코딩 sessionStorage (8시간 TTL, 5회 실패 시 30초 잠금)
- **경로 alias**: `@/` → 프로젝트 루트 (`jsconfig.json` 설정)

### 환경변수 (.env.local — 로컬에만 존재, git 미포함)
```
NEXT_PUBLIC_SUPABASE_URL=https://ennasfdpaxrhedyrrpat.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
> **주의**: 새 PC에서 작업 시 `.env.local` 파일을 직접 만들어야 함. Supabase 대시보드 → Settings → API에서 anon key 확인.

---

## 2. DB 테이블 목록 (Supabase)

| 테이블 | 용도 |
|--------|------|
| vendors | 업체 기준정보 (key 자동생성: A, B, C…) |
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
| vendor_confirms | 업체 확인 정보 (예약 저장 시 자동 생성) |
| notices | 날짜별 알림 |
| settle_history | 정산 이력 |
| settle_history_items | 정산 이력 항목 |
| timetable_events | 타임테이블 수동 일정 (2026-04-19 생성) |

> 모든 테이블 RLS 비활성화 완료

---

## 3. 완료된 작업 목록

### Priority 1 — 로그인
- 하드코딩 계정 기반 로그인 (`/login`)
- sessionStorage 세션 관리 (`lib/auth.js`)
- 대시보드 layout에서 세션 없으면 /login 리다이렉트

### Priority 2 — 대시보드 (`/dashboard`)
- KPI 4개 카드: 이번달 예약 / 이번달 매출 / 미정산(체험) / 업체 확인 대기
- 월별 달력: 예약 건수/인원 표시, pax_limit 초과 시 ⚠ 표시, 날짜 클릭으로 선택
- 달력 우측: 선택일 예약 목록 (카드형, 등록 버튼 포함)
- 하단: 예약 상태 현황 4열 그리드 (확정/대기/취소/상담필요)
- NOTICE 팝업: 달력 날짜의 알림 dot 클릭 시 팝업
- 예약 등록 버튼: 선택 날짜 자동입력, 닫기 시 대시보드 유지

### Priority 3 — 기준 정보 (`/dashboard/master`)
- 6개 탭: 업체 / 구역 / 패키지 / 플랫폼 / 기사 / 사업
- 업체: key 자동생성(A→B→C), vendor_programs 서브 CRUD
- 패키지: package_programs (업체+프로그램+시간) 서브 CRUD
- 모두 등록/수정/삭제 가능

### Priority 4 — 예약 관리 (`/dashboard/reservations`)
- 검색/필터 (고객명, 예약번호, 패키지명 / 상태 / 월별)
- ReservationModal 2탭 (기본정보·결제 / 픽업정보)
- 자동계산: 총금액 = 단가 × 인원 - 할인 + 픽업비 + 부담금
- 패키지 선택 → 단가/구역 자동입력
- 결제처 선택 → 플랫폼/여행사 수수료 자동입력
- 픽업 서브 CRUD (reservation_pickup)
- 숙소 서브 CRUD (lodge_confirms)
- 신규 예약 저장 시 vendor_confirms 자동 생성
- 대시보드에서 날짜 선택 후 등록: 예약일 자동입력, 종료일 +1일 자동입력

### Priority 5 — NOTICE (`/dashboard/notice`)
- 월별 탐색 (‹ › 버튼)
- 날짜별 그룹 카드 형태
- 특이사항(special) 뱃지 표시
- 알림 등록/수정/삭제 모달
- 날짜 헤더의 "+ 추가" 버튼으로 빠른 등록

---

## 4. 미완료 작업 (PRD 우선순위 기준)

### Priority 6 — 타임테이블 (`/dashboard/timetable`) ← **다음 작업**
- **현재 상태**: stub 페이지만 존재 ("구현 예정" 텍스트)
- **DB**: `timetable_events` 테이블 생성 완료 (수동 일정용)
- **구현 요구사항**:
  1. 일별 / 주별(기본값) / 월별 뷰 전환
  2. 구역별 탭 필터 (zones 테이블에서 자동 생성)
  3. 패키지별 / 예약별 / 업체별 탭 필터
  4. 예약 DB + package_programs 기반 자동 블록 생성
  5. 같은 구역 + 업체 + 프로그램 시간 겹침 시 형광 연두색 테두리
  6. 우측 상단 "겹침 n건" 배지 + 클릭 시 상세 팝업
  7. 타임테이블에서 직접 일정 추가/수정 (timetable_events 테이블 사용)
- **데이터 흐름**: reservations × package_programs → 타임테이블 블록 자동 생성
- **API 필요**: `/api/timetable-events` (GET/POST/PUT/DELETE) — 아직 미생성

### Priority 7 — 업체별 정산내역 (`/dashboard/settle-detail`)
- stub 페이지 ("구현 예정" 텍스트)
- 아코디언 형태로 업체별 정산 내역 표시
- 정산 완료 처리 기능

### Priority 8 — 정산 요약 (`/dashboard/settle-summary`)
- stub 페이지 ("구현 예정" 텍스트)
- 월별 집계 표시

### Priority 9 — 사업비 관리 (`/dashboard/biz`)
- stub 페이지 ("구현 예정" 텍스트)
- 사업별 예산/집행 자동계산

---

## 5. 현재 알려진 버그 및 미수정 사항

| # | 위치 | 내용 | 우선순위 |
|---|------|------|----------|
| 1 | 대시보드 레이아웃 | 작업 순서에 따라 레이아웃이 간헐적으로 바뀌는 현상 있었음. 현재 확정 레이아웃: 달력 우측=선택일 예약목록, 하단=예약 상태 현황 4열 | 낮음 |
| 2 | 예약 모달 | `end_date` 필드 수동 변경 시 `date` 변경에 따른 자동 연동 없음 (각자 독립적으로 수정 가능) | 낮음 |
| 3 | 기준정보 > 패키지 | `total_price` 필드가 있으나, 패키지 선택 시 단가 자동입력에 이 값을 사용 중. PRD 원래 의도는 `unit_price`(1인 단가) 별도 필드였음 | 중간 |
| 4 | 예약 목록 | 달력 선택일 예약 목록에서 예약 클릭 시 `from=dashboard` 파라미터 포함 → 모달 닫으면 대시보드로 복귀 (정상 동작) | - |
| 5 | settle, settle-detail 경로 | `app/dashboard/settle/` 폴더가 존재하나 라우트 미사용. `settle-detail`, `settle-summary`가 실제 사용 경로 | 낮음 |

---

## 6. 새 PC에서 작업 시작하는 방법

### 6-1. 환경 설정
```bash
# 1. 레포 클론
git clone https://github.com/yularchive-maker/roadnvill9.git
cd roadnvill9

# 2. 의존성 설치
npm install

# 3. 환경변수 파일 생성
# .env.local 파일을 직접 만들고 아래 내용 입력
# Supabase anon key는 Supabase 대시보드 → Settings → API에서 확인
```

**.env.local 내용:**
```
NEXT_PUBLIC_SUPABASE_URL=https://ennasfdpaxrhedyrrpat.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=여기에_anon_key_입력
```

```bash
# 4. 로컬 개발 서버 실행
npm run dev
# → http://localhost:3000 접속
```

### 6-2. 배포
```bash
# 수정 후 GitHub push하면 Vercel 자동 배포
git add .
git commit -m "작업 내용"
git push origin main
```

### 6-3. 다음 작업 (Priority 6 — 타임테이블)

구현 시작 전 확인사항:
- `app/dashboard/timetable/page.js` — 현재 stub, 전면 재작성 필요
- `app/api/timetable-events/route.js` — 새로 생성 필요
- Supabase `timetable_events` 테이블 — 이미 생성 완료

**타임테이블 데이터 흐름:**
```
reservations (예약) 
  × packages → package_programs (vendor_key, default_start, duration_min)
  × vendors (name, color)
  → 타임테이블 블록 자동 생성

timetable_events 테이블 → 수동 추가 일정 저장
```

**timetable_events 테이블 컬럼:**
```
id, date, start_time, end_time, title,
vendor_key, reservation_no, zone_code,
prog_name, package_name, customer, memo,
is_manual (default true), created_at
```

**겹침 감지 조건:** 동일 date + zone_code + vendor_key + prog_name + 시간 겹침

---

## 7. 주요 파일 구조

```
roadnvill9/
├── app/
│   ├── globals.css          # 전체 CSS (HTML v8 기반 CSS variables)
│   ├── login/page.js        # 로그인 페이지
│   └── dashboard/
│       ├── layout.js        # 사이드바 + 탑바 레이아웃
│       ├── page.js          # 대시보드 (KPI + 달력)
│       ├── reservations/page.js  # 예약 관리
│       ├── master/page.js   # 기준 정보 (6탭)
│       ├── notice/page.js   # NOTICE
│       ├── timetable/page.js     # 타임테이블 ← 다음 작업
│       ├── settle-detail/page.js # 업체별 정산내역 (stub)
│       ├── settle-summary/page.js# 정산 요약 (stub)
│       └── biz/page.js      # 사업비 관리 (stub)
├── lib/
│   ├── auth.js              # 하드코딩 sessionStorage 인증
│   └── supabase.js          # Supabase 클라이언트
├── app/api/
│   ├── reservations/        # GET/POST + [no]/GET/PUT/DELETE
│   ├── vendors/             # GET/POST + [key]/PUT/DELETE
│   ├── zones/               # GET/POST
│   ├── packages/            # GET/POST + [id]/PUT/DELETE
│   ├── platforms/           # GET/POST
│   ├── drivers/             # GET/POST
│   ├── notices/             # GET/POST/PUT/DELETE
│   ├── biz/                 # GET/POST + [id]/PUT/DELETE
│   ├── vendor-confirms/     # POST (upsert)
│   ├── lodge-confirms/      # GET/POST/PUT/DELETE
│   └── settle-history/      # GET/POST
│   # 미생성: timetable-events ← 다음 작업 시 생성 필요
├── jsconfig.json            # @/ 경로 alias 설정
└── .env.local               # (git 미포함) Supabase 환경변수
```
