# roadnvill9 — 여행/체험 예약 관리 시스템

## 프로젝트 개요

Next.js 14 (App Router) + Supabase 기반 여행/체험 예약 관리 시스템.
숙소, 업체, 패키지, 구역 등 기준정보와 예약·정산·타임테이블을 통합 관리한다.

**기술 스택**
- Frontend: Next.js 14 App Router, React (Client Components)
- Backend: Supabase (PostgreSQL + Auth)
- 배포: Vercel (preview → prod 수동 승격 방식)

**주요 테이블**
- 기준정보: `zones`, `lodges`, `vendors`, `packages`, `programs`, `master_config`
- 예약/운영: `reservations`, `lodge_confirms`, `vendor_confirms`, `timetable_events`, `settle_history`
- 기타: `users`

**PRD 참조:** `Downloads/예약 정산 관리/PRD_체험예약관리_전체이슈.md`

---

## DB 마이그레이션 진행 현황

### Phase 1 — FK 연결 ✅ 완료

기준정보 테이블과 예약/운영 테이블 간 FK를 추가하고 기존 텍스트 참조를 정규화했다.

**완료된 작업**
- `vendors.key` UNIQUE 제약 추가
- `packages.zone_id UUID FK → zones.id` 추가 + 백필
- `reservations.package_id UUID FK → packages.id` 추가 + 백필
- `reservations.zone_id UUID FK → zones.id` 추가 + 백필
- `programs.vendor_key FK → vendors.key` 추가
- `lodge_confirms.reservation_no FK → reservations.no` + CASCADE
- `lodge_confirms.reservation_no UNIQUE` 추가
- `vendor_confirms.reservation_no FK → reservations.no` + CASCADE
- `vendor_confirms.vendor_key FK → vendors.key` 추가
- `vendor_confirms (reservation_no, vendor_key) UNIQUE` 추가
- `timetable_events.reservation_no FK → reservations.no` + SET NULL
- `timetable_events.vendor_key FK → vendors.key` + SET NULL
- 각 FK 컬럼에 인덱스 추가

**유지 중인 레거시 컬럼 (앱 코드 전환 후 DROP 예정)**
- `reservations.pkg` (텍스트) → `reservations.package_id`로 대체 예정
- `reservations.zone` (텍스트) → `reservations.zone_id`로 대체 예정
- `packages.zone` (텍스트) → `packages.zone_id`로 대체 예정

---

### Phase 2 — lodges 데이터 정규화 ✅ 완료

**완료된 작업**
- `lodge_rooms` 별도 테이블 생성 불필요 — `lodges.rooms jsonb` 컬럼 활용
- `LODGE_MASTER` 하드코딩 데이터를 `lodges` 테이블에 INSERT (Supabase 대시보드에서 직접 실행)
  - 길쌈, 만초고택, 유울재, 귀농의집, 계와고택, 서린당, 경함정, 스테이예인, 금소애서
- `lodge_confirms.lodge_id UUID FK → lodges.id` 추가 + 백필 + 인덱스 (Supabase 대시보드에서 직접 실행)

**⚠️ 주의: Phase 2 미완 항목 (CLAUDE.md 오기재)**
아래 항목은 완료로 표기됐으나 실제 코드에는 미적용 상태:
- `ReservationDetail.js`의 `LODGE_MASTER` 상수 제거 → **코드에 여전히 하드코딩 상수 존재**
- 숙소 목록 `/api/lodges` API 동적 조회 전환 → **미구현**
- `lodge_confirms` 저장/조회 시 `lodge_id` 처리 → **미구현**

---

### Phase 3 — timetable_events 비정규화 제거 🔄 진행 중

**완료 (2026-04-18)**
- `app/api/timetable/route.js` GET: `select('*')` → `select('*, reservations(customer, pkg), vendors(name, color)')` JOIN 추가
- `app/api/timetable/route.js` POST/PUT: `vendor`, `customer`, `pkg` 필드를 destructure로 분리해 DB 저장 제외
- `app/dashboard/timetable/TimetablePage.js`:
  - `ev.vendor` → `ev.vendors?.name`
  - `ev.customer` → `ev.reservations?.customer`
  - 패키지별 그룹뷰: `e.pkg` → `e.reservations?.pkg`
  - `EventModal.handleSave`에서 `vendor/customer/pkg` 전송 제거

**⚠️ 미완 — DB 컬럼 DROP 미실행**
코드 배포는 완료됐으나 아래 SQL이 아직 실행되지 않음. 검증 후 Supabase 대시보드에서 실행 필요:
```sql
ALTER TABLE timetable_events
  DROP COLUMN IF EXISTS vendor,
  DROP COLUMN IF EXISTS customer,
  DROP COLUMN IF EXISTS pkg;
```

---

### Phase 4 — 예약 등록 단가 자동연동 + 정산 연결 📋 예정

- 예약 등록 모달에서 패키지 선택 시 `programs[].unit_price` 자동 참조
- `settle_history`에 `reservation_nos` (uuid[] 또는 jsonb) 컬럼 추가
- 정산 화면에서 이미 정산된 예약 건 구분 표시

---

## 작업 내역 (2026-04-23) — 타임테이블 구현

### Priority 6 — 타임테이블 (`/dashboard/timetable`) ✅ 완료

**신규 생성 파일:**
- `app/api/timetable/route.js` — GET/POST/PUT/DELETE (수동 이벤트 CRUD)
- `app/dashboard/timetable/page.js` — 전면 재작성 (stub → 완전 구현)

**구현 내용:**
- 일간(Day) / 주간(Week) 뷰 전환
- 구역별 서브탭 필터 (zones 테이블 기반 동적 생성)
- 그룹 탭: 전체 / 구역별 / 패키지별 / 업체별
- 예약 DB × package_programs 기반 자동 이벤트 블록 생성
  - `reservations.pkg` → `packages.name` 매칭 → `package_programs.default_start/end`
  - 취소 상태 예약 제외
- 수동 이벤트 추가/삭제 (timetable_events 테이블)
- 겹침 감지: 같은 vendor_key + 시간 겹침
  - 같은 구역(zone_code) → real (🟢 형광연두 #33ff33 테두리)
  - 다른 구역 → warn (🟡 amber 테두리)
  - 겹침 건수 배지 클릭 시 상세 alert
- 이벤트 블록 클릭 → 상세 팝업 (자동 이벤트: 정보 표시만, 수동 이벤트: 삭제 가능)
- 오늘 현재시각 표시선 (실선)
- 픽업/드랍 별도 컬럼 (파선 테두리)

---

## 오늘 작업 내역 (2026-04-18)

### 1. Phase 2 — lodges INSERT & FK (Supabase 대시보드 직접 실행)
- `lodges` 테이블에 9개 숙소 + `rooms` jsonb 데이터 INSERT
- `lodge_confirms.lodge_id UUID FK → lodges.id` + 백필 + 인덱스

### 2. Phase 3 — timetable_events JOIN 쿼리로 전환
- `/api/timetable` route.js 및 `TimetablePage.js` 수정 완료
- Vercel 프리뷰 배포 완료

### 3. 예약 등록 버그 수정 (PRD 우선순위 1)

#### 버그 A — 신규 예약 모달 초기화 안 됨 (PRD 1-6) ✅ 수정
- **원인:** 모달이 unmount되지 않아 이전 form state 유지
- **수정:** `ReservationsPage.js`에서 `{modalOpen && <ReservationModal/>}` 조건부 렌더링 적용
- **추가:** `onClose` 시 `setEditData(null)` 명시 호출로 editData도 초기화

#### 버그 B — 예약 삭제 안 됨 ✅ 수정
- **원인:** FK 제약(`lodge_confirms`, `vendor_confirms`)으로 DELETE 실패 + 클라이언트에서 에러 무음 처리
- **수정 (API):** `app/api/reservations/[no]/route.js` DELETE — `vendor_confirms`, `lodge_confirms` 선삭제 후 예약 삭제
- **수정 (클라이언트):** `res.ok` 체크 추가, 실패 시 `alert('삭제 실패: ...')` 표시

#### 버그 C — 기준정보 데이터 연동 오류 (PRD 이슈 #5) ✅ 수정
- **원인:** `master_config` 테이블의 컬럼명은 `payload`이나 `ReservationModal.js`에서 `c.data`로 접근
- **수정:** `c.data?.type` → `c.payload?.type`, `.map(c => c.data)` → `.map(c => c.payload)` 전체 교체
- **영향:** 플랫폼·여행사·픽업수행자·사업명 드롭다운이 이제 DB 실데이터 참조

### 4. 예약 자동입력 (PRD 8-1, 8-2)

#### 결제처 자동입력 (PRD 8-1) ✅ 구현
- `onPaytoChange` 핸들러 추가
- 결제처 선택 시: 플랫폼이면 `inflow='플랫폼'` + `platform` + `plat_fee` 자동입력
- 결제처 선택 시: 여행사이면 `inflow='여행사'` + `agency` + `ag_fee` 자동입력
- `paytoOptions`에 여행사도 포함 (`(여행사)` 레이블)

#### 패키지 자동입력 (PRD 8-2) 🔄 부분 구현
- `onPkgChange` 핸들러 추가
- 패키지 선택 시 해당 패키지의 `zone` 자동입력 (구역 미선택 시)
- **1인 판매가 자동입력은 미구현** — 패키지 총금액 필드 없음 (PRD 7-2 구현 후 연동 예정)

---

## 미해결 버그 3가지

### 🔴 Bug-1 — `ReservationDetail.js` LODGE_MASTER 하드코딩 잔존
- **위치:** `app/dashboard/reservations/ReservationDetail.js` 상단 `LODGE_MASTER` 상수 (7~17행)
- **증상:** 숙소 확인 패널의 숙소·객실 드롭다운이 DB(`lodges` 테이블)가 아닌 하드코딩 상수 참조
- **수정 방법:**
  1. `useEffect`에서 `/api/lodges` 호출 → `lodges` 상태 관리
  2. `LODGE_MASTER` 상수 제거
  3. 숙소 목록: `lodges.map(l => l.name)`
  4. 객실 목록: `Object.keys(selectedLodge.rooms || {})`
- **PRD 연관:** Phase 2 미완 항목

### 🔴 Bug-2 — timetable_events DB 비정규화 컬럼 DROP 미실행
- **위치:** Supabase `timetable_events` 테이블
- **증상:** `vendor`, `customer`, `pkg` 컬럼이 코드상 더 이상 쓰이지 않으나 DB에 잔존
  → 기준정보(업체명, 패키지명) 변경 시 timetable 데이터와 불일치 위험 지속
- **수정 방법:** 프리뷰 환경에서 타임테이블 동작 검증 후 아래 SQL 실행:
  ```sql
  ALTER TABLE timetable_events
    DROP COLUMN IF EXISTS vendor,
    DROP COLUMN IF EXISTS customer,
    DROP COLUMN IF EXISTS pkg;
  ```
- **PRD 연관:** Phase 3 Step 2

### 🟡 Bug-3 — 패키지 선택 시 1인 판매가 자동입력 불가
- **위치:** `app/dashboard/reservations/ReservationModal.js` `onPkgChange` 함수
- **증상:** 패키지 선택 시 구역은 자동입력되나 1인 판매가는 수동 입력 필요
- **원인:** `packages` 테이블에 패키지 단가(총금액) 필드가 없음
- **수정 방법:**
  1. PRD 7-2: `packages` 테이블에 `unit_price` 컬럼 추가 (Supabase 대시보드)
  2. `onPkgChange`에서 `pkg.unit_price`로 `price` 자동입력
  3. `total = price * pax - discount + pickup` 재계산
- **PRD 연관:** PRD 8-2 (패키지 자동입력), PRD 7-2 (패키지 총금액 입력 추가)

---

## PRD 구현 우선순위 현황

| 순위 | 영역 | 작업 | 상태 |
|---|---|---|---|
| 1 | 예약 등록 | 모달 초기화 | ✅ 완료 |
| 1 | 예약 등록 | 결제처 자동입력 | ✅ 완료 |
| 1 | 예약 등록 | 패키지 구역 자동입력 | ✅ 완료 |
| 1 | 예약 등록 | 패키지 1인 판매가 자동입력 | 🔴 Bug-3 미완 |
| 2 | 기준정보 | 업체 키/코드 자동생성 (PRD 7-1) | 📋 미시작 |
| 2 | 기준정보 | 패키지 총금액 필드 추가 (PRD 7-2) | 📋 미시작 (Bug-3 선행) |
| 3 | 대시보드 | KPI 실시간 연동 (PRD 1-1) | 📋 미시작 |
| 3 | 대시보드 | 달력 임계초과 표시 (PRD 1-3) | 📋 미시작 |
| 3 | 대시보드 | Notice 알림 팝업 (PRD 1-4) | 📋 미시작 |
| 4 | 타임테이블 | 이벤트 블록 렌더링 (PRD 2-1) | ✅ 완료 |
| 4 | 타임테이블 | 구역별 탭 필터 (PRD 2-3) | ✅ 완료 |
| 4 | 타임테이블 | 겹침 배지 및 팝업 (PRD 2-5) | ✅ 완료 |
| 5 | 업체별 정산 | DB 연동 + 아코디언 (PRD 4-1, 4-2) | 📋 미시작 |
| 5 | 업체별 정산 | 정산완료 처리 (PRD 4-3) | 📋 미시작 |
| 6 | 정산 요약 | DB 연동 + 월별 집계 (PRD 5-1) | 📋 미시작 |
| 7 | 사업비 관리 | DB 연동 + 예산 자동계산 (PRD 6-1, 6-2) | 📋 미시작 |

---

## 현재 알려진 이슈

| 번호 | 위치 | 내용 | 상태 |
|------|------|------|------|
| 1 | `reservations` | `pkg`, `zone` 레거시 텍스트 컬럼 잔존 — `package_id`, `zone_id`로 전환 후 DROP 필요 | Phase 3 후 처리 |
| 2 | `packages` | `zone` 레거시 텍스트 컬럼 잔존 — `zone_id`로 전환 후 DROP 필요 | Phase 3 후 처리 |
| 3 | `ReservationDetail.js` | `LODGE_MASTER` 숙소·객실 하드코딩 — DB 연동 미완 | 🔴 Bug-1 |
| 4 | `timetable_events` | `vendor`, `customer`, `pkg` 비정규화 컬럼 — 코드는 JOIN으로 전환됐으나 DB DROP 미실행 | 🔴 Bug-2 |
| 5 | `master_config` | `payload` 컬럼명 불일치 — `ReservationModal.js`에서 `c.data` → `c.payload` 수정 완료 | ✅ 수정됨 |
| 6 | `settle_history` | 정산 이력에 예약번호 연결 없음 — 역추적 불가 | Phase 4 예정 |
| 7 | `biz_vendors` | 코드에는 참조되나 테이블 미존재 | 미결 |
