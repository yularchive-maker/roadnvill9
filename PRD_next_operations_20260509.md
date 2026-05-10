# roadnvill119b 남은 작업 PRD

작성일: 2026-05-09  
갱신일: 2026-05-10

## 1. 현재 완료 상태

- Supabase Auth 기반 내부 직원 로그인 보호 완료
- `/dashboard` 및 내부 API 비로그인 접근 차단 완료
- RLS 활성화 및 authenticated 정책 적용 완료
- anon 직접 접근 차단 확인 완료
- `.env.local` git 추적 제외 및 `.env.example` 변수명만 유지 완료
- 업체 회신관리 탭 추가 완료
- 예약 상세 화면의 업체 확인 탭 추가 완료
- 수동 회신 입력, 선택 업체 가능 처리, 전체 업체 가능 처리 추가 완료
- Telegram 봇 생성 및 서버 발송 API 연결 완료
- Telegram 버튼 회신 처리 및 `vendor_confirms` 저장 완료
- Telegram webhook 운영 URL 등록 및 상태 확인 완료
- Telegram 메시지 카테고리형 안내 문구 적용 완료
- Telegram 회신 후 예약 상세 모달 자동 새로고침 적용 완료
- 회신 완료 업체는 일반 발송에서 제외하고, 필요 시 선택 재요청으로 회신대기 전환 후 재발송 가능
- 예약 확정가능 판단 로직 추가 완료
- 고객 안내 완료 후에만 예약확정 처리하는 버튼 추가 완료
- 상세 검색 탭 추가 완료
- 상세 검색에서 고객명, 패키지명, 구역명, 업체명, 프로그램명 검색 연결 완료
- 상세 검색 정산 조회 오류 수정 완료
- 날짜/월 입력 자동 서식 적용 완료
- 기준정보 > 체험 업체 Telegram 연결 상태 표시 및 chat_id 관리 완료
- 기준정보 > 체험 업체 Telegram 연결됨/미연결 필터 완료
- 기준정보 > 체험 업체 Telegram 최근 봇 메시지 확인 도구 추가 완료
- 기준정보 > 체험 업체 Telegram webhook 상태 확인/등록/해제 패널 완료
- 기준정보 > 체험 업체 목록 UI 정리 완료
- 로그인 내부 직원용 수동 Excel 백업 다운로드 기능 추가 완료

## 2. 운영 원칙

- 이 시스템은 고객용 예약 사이트가 아니라 내부 운영관리 웹앱이다.
- Telegram은 1차 업체 가능 여부 확인 채널로만 사용한다.
- 고객 안내 문자, 전화, 오프라인 안내는 운영자가 직접 처리한다.
- 웹앱은 고객 안내 발송 여부와 최종 예약확정 상태만 기록한다.
- 추후 Kakao 전환 가능성을 고려해 회신 상태와 확정 로직은 채널에 종속되지 않게 유지한다.
- 고객 연락처, 결제금액, 할인금액, 내부 메모, 내부 정산 단가는 업체 메시지에 포함하지 않는다.
- 실제 delete보다 soft delete를 우선 사용한다.
- DB 백업 파일은 서버에 저장하지 않고, 로그인 직원 요청 시 즉석 생성해 다운로드한다.
- Excel 백업 생성 시 수식 주입 방지를 위해 위험 시작 문자(`=`, `+`, `-`, `@`)는 텍스트로 처리한다.

## 3. 운영 전 필수 확인

### 3.1 보안 키 교체

운영 전 아래 항목은 사용자 계정에서 직접 처리해야 한다.

- GitHub personal access token revoke
- Telegram bot token revoke 후 새 token 발급
- 새 `TELEGRAM_BOT_TOKEN`을 `.env.local`과 Vercel Production 환경변수에 반영
- 필요 시 Supabase `service_role` key rotate 후 `.env.local`과 Vercel Production 환경변수에 반영
- `TELEGRAM_WEBHOOK_SECRET` 값 확인
- token 교체 후 Telegram webhook 재등록

### 3.2 운영 URL 확인

- 운영 URL: `https://roadnvill9.vercel.app`
- Telegram webhook URL: `https://roadnvill9.vercel.app/api/telegram/webhook`
- Vercel Production 배포가 Ready 상태인지 확인
- 운영 URL에서 로그인, 업체 회신관리, 예약 상세, Telegram 발송/회신을 다시 확인

### 3.3 직원 계정 정리

- Supabase Auth에 실제 내부 직원 계정 생성
- 임시 테스트 계정 사용 여부 확인
- 퇴사자/불필요 계정 제거
- 로그인 가능한 계정과 실제 운영자 목록 일치 확인

## 4. 다음 개발 순서

### 4.1 실제 업체 Telegram 연결 등록

목표:

- 실제 체험 업체별 Telegram chat_id 등록
- 미연결 업체를 기준정보에서 빠르게 식별
- 연결 완료 후 업체별 테스트 메시지 발송

확인 방법:

1. 업체가 봇에 `/start` 전송
2. 기준정보 > 체험 업체 > 최근 봇 메시지에서 chat_id 확인
3. 해당 업체에 chat_id 저장
4. 테스트 예약에서 Telegram 요청 발송
5. 업체가 버튼 회신
6. 업체 회신관리와 예약 상세에 회신 상태 반영 확인

### 4.2 운영 테스트 시나리오

목표:

- 실제 운영 흐름을 한 건의 테스트 예약으로 끝까지 확인한다.

테스트 흐름:

1. 예약 등록
2. 패키지/프로그램/업체 확인
3. 업체 Telegram 요청 발송
4. Telegram 버튼 회신
5. 전화 또는 현장 확인 건은 수동 회신 입력
6. 모든 업체 가능 처리
7. 숙소가 있으면 숙소/객실 확정
8. 픽업이 있으면 픽업 확정
9. 확정가능 갱신
10. 고객 안내는 운영자가 외부 채널로 직접 발송
11. 웹앱에서 고객 안내 완료 및 예약확정 처리

### 4.3 정산/숙소/픽업 운영 UX 점검

목표:

- 실제 운영자가 반복 입력할 때 불편한 부분을 줄인다.

점검 항목:

- 업체별 정산 내역 날짜 입력 편의성
- 예약 상세에서 숙소 배정 입력 흐름
- 예약 상세에서 픽업 입력 흐름
- 상세 검색에서 정산/숙소/픽업 상태 필터 정확성
- 목록 화면에서 상태값과 금액이 한눈에 들어오는지 확인

### 4.4 가격 이력과 예약 스냅샷 구조

목표:

- 기준정보 가격 변경이 과거 예약과 정산 완료 건에 영향을 주지 않게 한다.
- 가격 적용 기준일은 체험일이 아니라 예약 접수일 또는 견적 확정일로 한다.
- 플랫폼/여행사 수수료 기준금액은 전체 수납액이 아니라 체험 판매금액으로 한다.
- 픽업비는 플랫폼/여행사 수수료 기준에서 제외하고 픽업 담당자 정산금으로 분리한다.

확정 구조:

- `program_price_history`: 체험 프로그램별 가격 이력
- `reservation_program_snapshots`: 예약 당시 프로그램 구성과 가격 스냅샷
- `reservations.experience_sales_amount`: 체험 판매금액
- `reservations.platform_fee_amount`: 체험 판매금액 기준 플랫폼 수수료
- `reservations.agency_fee_amount`: 체험 판매금액 기준 여행사 수수료

운영 원칙:

- 기준정보의 업체 프로그램 단가는 고객 판매가가 아니라 업체 정산단가로 취급한다.
- 새 가격은 기존 가격을 덮어쓰기보다 가격 이력 row를 추가한다.
- 예약 저장 시점에 적용 가격을 복사해 스냅샷으로 고정한다.
- 정산 화면은 현재 기준정보 가격이 아니라 예약 스냅샷의 `vendor_settle_total`을 사용한다.
- 기존 예약의 과거 프로그램별 고객 판매가 배분은 정확히 복원할 수 없으므로, 마이그레이션 시점의 현재 기준정보로 초기 스냅샷을 생성한다.

준비된 SQL:

- `supabase_price_snapshot_schema_20260510.sql`: 테이블/컬럼/RLS만 생성
- `supabase_price_snapshot_backfill_20260510.sql`: 최초 고객 판매가/업체 정산단가 입력 후 기존 예약 스냅샷 생성

실행 순서:

1. `supabase_price_snapshot_schema_20260510.sql` 실행
2. 기준정보 화면에서 프로그램별 최초 고객 판매가와 업체 정산단가 입력/검토
3. `supabase_price_snapshot_backfill_20260510.sql` 실행
4. 정산 화면을 `reservation_program_snapshots.vendor_settle_total` 기준으로 변경

### 4.5 Kakao 전환 대비

현재 Telegram 구현은 1차 운영용이다. 추후 Kakao로 전환할 때도 아래 공통 상태값은 유지한다.

- 가능
- 불가능
- 시간조정 필요
- 인원조정 필요
- 보류

Kakao 단계에서 추가 검토할 필드:

- `kakao_template_id`
- `kakao_message_id`
- `kakao_sent_at`
- `kakao_callback_payload`

### 4.6 드래그형 타임테이블 고도화

Telegram 회신 운영이 안정화된 뒤 진행한다.

목표:

- 날짜별 시간표에서 드래그로 일정 블록 생성
- 예약별 체험 프로그램 시간을 직접 배치/수정
- 업체별 시간 중복 자동 감지
- 최종 배치 시간을 업체 확인 메시지와 운영 안내에 반영

## 5. 배포 전 체크리스트

- `npm.cmd run build` 성공
- `git status --short` 깨끗함
- GitHub main push 완료
- Vercel Production 배포 Ready 확인
- 운영 환경변수 등록 확인
- 운영 URL 로그인 확인
- 운영 URL에서 Telegram webhook 상태 확인
- 운영 URL에서 Telegram 발송/회신 확인
- 운영 URL에서 Excel 백업 다운로드 확인
- 실제 token 값이 코드, 문서, 커밋, `.env.example`에 포함되지 않았는지 확인
