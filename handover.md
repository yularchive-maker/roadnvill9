# roadnvill119b 작업 인수인계

최종 업데이트: 2026-06-21

## 1. 프로젝트 위치

- GitHub: https://github.com/yularchive-maker/roadnvill9
- 배포 사이트: https://roadnvill9.vercel.app
- 현재 브랜치: `main`
- 현재 기준 커밋: `1bb37b6`
- 기존 컴퓨터 로컬 경로: `C:\Users\USER\roadnvill9`
- 기술: Next.js 14, React, Supabase, Vercel

이 시스템은 고객용 예약 사이트가 아니라 내부 직원용 예약·운영·정산 관리 웹앱이다.

## 2. 다른 컴퓨터에서 시작하는 순서

### 준비

다른 컴퓨터에 아래 프로그램을 설치한다.

1. Git
2. Node.js LTS
3. Codex

### 저장소 받기

PowerShell에서 실행한다.

```powershell
git clone https://github.com/yularchive-maker/roadnvill9.git
cd roadnvill9
npm install
```

GitHub 저장소가 비공개라면 접근 권한이 있는 GitHub 계정으로 먼저 로그인해야 한다.

### 환경변수 옮기기

`.env.local`은 보안상 GitHub에 올라가지 않는다. 기존 컴퓨터의 아래 파일을 USB 등 안전한 방법으로 새 컴퓨터의 저장소 루트에 직접 옮긴다.

```text
C:\Users\USER\roadnvill9\.env.local
```

필요한 환경변수:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
```

주의:

- `.env.local`을 GitHub, 채팅, 이메일에 붙여넣지 않는다.
- `SUPABASE_SERVICE_ROLE_KEY`와 `TELEGRAM_BOT_TOKEN`은 특히 외부에 노출하면 안 된다.
- 새 컴퓨터에서 `git status`를 실행했을 때 `.env.local`이 나타나면 커밋하지 말고 `.gitignore`부터 확인한다.

### 로컬 실행

```powershell
npm run dev
```

접속 주소:

```text
http://localhost:3000/login
```

빌드 점검:

```powershell
npm run build
```

## 3. Codex에서 작업 이어가기

새 컴퓨터의 Codex에서 `roadnvill9` 폴더를 열고 아래 문장을 입력한다.

```text
이 저장소는 roadnvill119b 내부 운영관리 웹앱입니다.
먼저 handover.md와 최근 git log를 읽고 현재 상태를 파악해 주세요.
기존 기능과 DB 데이터를 깨뜨리지 말고, soft delete 및 기존 마이그레이션 방식을 유지해 주세요.
코드 수정 전 관련 파일을 확인하고, 수정 후 npm run build로 검증해 주세요.
환경변수와 비밀키는 출력하거나 커밋하지 마세요.
```

이전 채팅이 새 컴퓨터에 보이지 않더라도 이 문서와 Git 기록을 기준으로 작업을 이어갈 수 있다.

## 4. 핵심 운영 구조

### 인증과 보안

- Supabase Auth 로그인 직원만 `/dashboard` 이하 접근 가능
- 주요 public 테이블은 RLS 활성화
- 비로그인 및 anon 사용자는 업무 데이터 접근 차단
- `service_role` 키는 서버 API에서만 사용
- 실제 삭제 대신 `is_deleted`, `deleted_at`을 이용한 soft delete 우선

### 예약

- 일반/사업비 상품 지원
- 단품/패키지 및 여러 상품을 하나의 예약에 구성 가능
- 상품별 실제 체험 인원을 저장
- 대표 요약 인원은 목록 표시용이며 정산·업체 확인은 상품별 인원을 사용
- 숙박, 픽업, 결제 상태를 예약 진행 상태와 분리

### 패키지

- 일반 패키지와 사업비 패키지 분리
- 패키지에 여러 구역 연결 가능
- 프로그램 일정은 구역별로 업체와 프로그램 구성
- 업체 정산단가는 패키지 구성 프로그램별로 별도 저장 가능

### 사업비

- 상위 사업비 상품과 하위 사업비 패키지를 구분
- 사업비 상품에서 계획 인원, 지원 예산, 사용 지원금, 남은 지원 예산 집계
- 하위 사업비 패키지 예약은 할인 및 지원금 계산 가능
- 일반 단품 또는 맞춤형 구성은 사업비 인원만 집계하고 지원금은 0원으로 처리 가능

### 정산

- 체험, 숙박, 픽업, 플랫폼, 여행사를 구분
- 업체별 미정산 내역과 정산 완료 이력 제공
- 정산 취소 시 다시 미정산 내역으로 복귀
- 정산 요약에서 예약별 상세 내역 확인 가능
- 숙박 정산은 숙박업체 > 숙박공간 > 객실 구조로 표시

### Telegram

- 업체 가능 여부 요청 발송 및 버튼 회신
- 회신 결과를 `vendor_confirms`에 저장
- 수동 회신 입력 지원
- 최종 운영 안정화 이후 새 운영자 계정과 봇으로 이전 예정

## 5. 최근 완료한 수정

### 숙박 배정

- 예약 상품 구성 구역에 맞는 숙박업체와 숙박공간 필터 추가
- 구역이 지정되지 않은 기존 숙박공간은 공통 후보로 표시
- 관련 DB 컬럼: `lodges.zone_code`
- 적용 SQL: `supabase_lodge_zone_code_20260617.sql`

### 패키지 프로그램 선택

- 패키지 수정에서 구성 구역을 선택하기 전 업체 선택 비활성화
- 선택한 구성 구역에 프로그램이 있는 업체만 표시
- 구역 변경 시 기존 업체·프로그램 선택 초기화
- 커밋: `c034bd2`

### 체험업체 삭제

- 삭제된 체험업체가 기준정보 목록에 다시 나타나는 문제 수정
- 업체 삭제 시 하위 프로그램도 soft delete
- 패키지 및 예약 등록의 신규 선택 목록에서도 삭제 업체 제외
- 기존 예약·정산 기록은 보존
- 커밋: `1bb37b6`

### 대시보드

- 데이터 조회 범위를 줄여 로딩 최적화
- 예약 목록 및 월별 요약 표시 정상화

## 6. 확인된 현재 데이터 예시

- 예약 `#014`, 고객명 `이순신고교`
- 예약일: 2026-07-24
- 숙박업체: 안동포마을
- 숙박공간: 길쌈
- 객실 5개
- 숙박 정산 합계: 950,000원

업체별 정산내역에서 2026-07-24가 포함된 기간으로 조회하면 숙박 정산에 표시되어야 한다.

## 7. DB 마이그레이션 현황

최근 주요 SQL:

- `supabase_biz_budget_item_packages_schema_20260612.sql`
- `supabase_budget_support_model_20260613.sql`
- `supabase_lodge_zone_code_20260617.sql`

위 SQL은 기존 Supabase 프로젝트에서 실행 완료된 상태다. 새 Supabase 프로젝트를 만들지 않는다면 다시 실행할 필요가 없다.

DB 구조를 변경할 때는:

1. 기존 컬럼을 바로 삭제하거나 이름을 바꾸지 않는다.
2. 새 컬럼과 테이블을 추가하는 migration 방식으로 진행한다.
3. 기존 데이터 백필을 포함한다.
4. RLS와 authenticated 정책을 함께 확인한다.
5. 사용자가 Supabase SQL Editor에서 성공을 확인한 후 UI를 연결한다.

## 8. 배포 방법

로컬 검증:

```powershell
npm run build
git status --short
```

커밋 및 배포:

```powershell
git add <수정한 파일>
git commit -m "변경 내용"
git push origin main
```

`main`에 push하면 Vercel이 자동 배포한다.

## 9. 작업 시 주의사항

- 사용자 요청 없이 기존 데이터를 실제 삭제하지 않는다.
- 테스트 데이터 외에는 soft delete를 사용한다.
- 이미 실행한 SQL과 기존 컬럼을 중복 생성하지 않는다.
- 기존 예약과 정산 스냅샷의 가격이 기준정보 변경으로 바뀌지 않게 한다.
- 업체명 변경 시 현재 업체명은 기준정보를 우선 표시하되 과거 정산 연결 키는 유지한다.
- 삭제된 업체·프로그램·패키지는 신규 선택 목록에서 제외하지만 과거 기록은 유지한다.
- 사용자 작업 파일이나 관계없는 변경을 되돌리지 않는다.
- 빌드 성공 전에는 push하지 않는다.

## 10. 로컬 전용 파일

다음 파일은 현재 Git에서 추적하지 않는다.

```text
TELEGRAM_BOT_HANDOVER.md
Telegram_Bot_Handover_Checklist.xlsx
```

필요하면 기존 컴퓨터에서 별도로 옮긴다. 파일에 실제 토큰이 들어 있지 않은지 확인한 뒤에만 회사 공유 저장소에 보관한다.
