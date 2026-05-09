# roadnvill119b 남은 작업 PRD

작성일: 2026-05-08

## 1. 오늘 완료된 범위

### 1.1 보안/Auth/RLS

- Supabase Auth 로그인 기반으로 `/dashboard` 접근 보호 완료
- 비로그인 사용자는 `/dashboard` 접근 불가
- 비로그인 API 호출은 401 처리
- public 주요 테이블 RLS 활성화 및 authenticated 정책 SQL 실행 완료
- `service_role` key와 Telegram bot token은 클라이언트 코드에 노출하지 않는 방향으로 정리

### 1.2 DB 구조 보완

- `vendor_confirms` 운영 필드 확장 SQL 실행 완료
- 예약 상태와 결제 상태 분리 컬럼 추가 완료
- 수동 회신 입력 필드 추가 완료
- 발송 상태/회신 상태/최종 판단 필드 추가 완료
- 주요 테이블 soft delete 필드 추가 완료

### 1.3 업체 회신관리 탭

- `/dashboard/vendor-confirms` 페이지 추가 완료
- 예약별/업체별 회신 요청 목록 표시
- 발송 상태, 회신 상태, 수동 입력 여부, 최종 판단 표시
- 날짜/업체/발송 상태/회신 상태/최종 판단/검색 필터 추가
- 수동 회신 입력 모달 추가

### 1.4 예약 상세 화면 업체 확인 영역

- 예약 등록/수정 모달에 `업체 확인` 탭 추가
- 패키지에 연결된 업체/프로그램 목록 표시
- 업체별 발송 상태, 회신 상태, 최종 판단 표시
- 당일 확정 인원, 상담/대기 인원, 최대 예상 인원 표시
- 업체 회신관리 화면으로 이동 버튼 추가

### 1.5 Telegram 발송 기반

- Telegram Bot 생성 완료
- Bot username: `roadnvill_vendor_reply_bot`
- 로컬 `.env.local`에 `TELEGRAM_BOT_TOKEN` 설정 완료
- `vendors.telegram_chat_id` 저장 컬럼 추가 SQL 실행 완료
- 테스트 계정의 Telegram `chat_id` 확인 완료
- `V001 고고창고`에 `telegram_chat_id` 연결 완료
- 업체 회신관리에서 Telegram 발송 버튼 추가 완료
- 실제 Telegram 메시지 발송 테스트 성공
- 메시지에 버튼 4개 표시 확인
  - 가능
  - 불가능
  - 시간조정 필요
  - 인원조정 필요

## 2. 내일 시작 위치

내일은 아래 단계부터 시작한다.

**6단계: Telegram 버튼 회신 처리**

현재 상태:

- Telegram 메시지 발송은 성공한다.
- 버튼은 Telegram 메시지에 표시된다.
- 아직 버튼 클릭 결과가 Supabase에 저장되지는 않는다.

## 3. 6단계 PRD: Telegram 버튼 회신 처리

### 3.1 목표

업체가 Telegram 메시지의 버튼을 누르면 해당 응답을 서버 API가 받아 `vendor_confirms`에 저장한다.

### 3.2 처리 대상 버튼

- 가능
- 불가능
- 시간조정 필요
- 인원조정 필요

### 3.3 저장 대상 컬럼

`vendor_confirms`에 아래 값을 업데이트한다.

- `reply_status`
- `replied_at`
- `manual_reply = false`
- `reply_method = '텔레그램'`
- `final_decision`
- `telegram_message_id`

상태 매핑:

- 가능 → `reply_status = '가능'`, `final_decision = '확정 가능'`
- 불가능 → `reply_status = '불가능'`, `final_decision = '확정 불가'`
- 시간조정 필요 → `reply_status = '시간조정 필요'`, `final_decision = '조정 필요'`
- 인원조정 필요 → `reply_status = '인원조정 필요'`, `final_decision = '조정 필요'`

### 3.4 추가할 API

추가 예정 파일:

- `app/api/telegram/webhook/route.js`

역할:

- Telegram webhook 요청 수신
- callback query의 `callback_data` 파싱
- `vc:{vendor_confirm_id}:{reply_code}` 형식 검증
- `vendor_confirms` 업데이트
- Telegram에 callback answer 반환
- 가능하면 원본 메시지 하단에 회신 완료 문구 반영

### 3.5 callback_data 형식

현재 발송 API에서 사용하는 형식:

```text
vc:{vendor_confirm_id}:{reply_code}
```

예시:

```text
vc:uuid-value:possible
vc:uuid-value:impossible
vc:uuid-value:time_adjust
vc:uuid-value:people_adjust
```

### 3.6 보안 기준

- Bot token은 서버 라우트에서만 사용
- 클라이언트 코드에 Bot token 노출 금지
- webhook 처리 API는 Telegram 요청만 받도록 제한
- 최소한 secret token 방식 사용 검토
- 업체 메시지에는 고객 연락처, 결제금액, 내부 정산 단가, 내부 메모를 포함하지 않음

### 3.7 테스트 방법

1. Vercel 또는 로컬 터널 환경에서 webhook URL 준비
2. Telegram `setWebhook` 호출
3. 업체 회신관리에서 테스트 요청 Telegram 발송
4. Telegram 메시지에서 `가능` 버튼 클릭
5. Supabase `vendor_confirms` 확인
   - `reply_status = '가능'`
   - `final_decision = '확정 가능'`
   - `reply_method = '텔레그램'`
   - `replied_at` 값 생성
6. `/dashboard/vendor-confirms` 새로고침 후 회신 상태 반영 확인

## 4. 7단계 PRD: 예약 확정가능 판단 로직

### 4.1 목표

예약에 필요한 운영 조건이 모두 충족되면 `reservation_status`를 `확정가능`으로 표시한다.

### 4.2 확정가능 조건

- 해당 예약의 모든 `vendor_confirms.reply_status`가 `가능`
- 숙박이 없는 예약은 숙소 조건 통과
- 숙박이 있는 예약은 숙소/객실 배정 및 확정 완료
- 픽업이 없는 예약은 픽업 조건 통과
- 픽업이 있는 예약은 픽업 수행자, 시간, 장소, 확정 상태 필요

### 4.3 예약확정 조건

`확정가능` 상태여도 자동으로 `예약확정`으로 바꾸지 않는다.

운영자가 고객에게 문자/전화 등으로 직접 확정 안내를 완료한 뒤, 화면에서 `고객 안내 완료 및 예약확정` 버튼을 눌렀을 때만:

- `reservation_status = '예약확정'`
- `customer_notice_sent_at = now()`
- `confirmed_at = now()`
- `confirmed_by = 현재 사용자`

### 4.4 추가 예정 작업

- 예약 상세 화면에 확정 조건 체크리스트 추가
- 체험/숙소/픽업 조건별 통과 여부 표시
- `확정가능` 자동 판단 함수 추가
- 고객 안내 완료 및 예약확정 버튼 추가
- Telegram 단계에서는 고객 발송 자동화 기능을 만들지 않음
- 고객 안내 자동 발송은 추후 카카오톡/알림톡 전환 시 별도 범위로 진행

## 5. 8단계 이후 PRD: 상세 검색 탭

전체 PRD 주요 기능이 안정화된 후 상세 검색 탭을 추가한다.

### 5.1 목표

운영자가 예약, 업체 회신, 숙소, 픽업, 정산 상태를 한 화면에서 조건별로 검색할 수 있게 한다.

### 5.2 추가 예정 경로

- `/dashboard/search`

### 5.3 검색 조건

- 예약일 범위
- 예약번호
- 고객명/예약명
- 패키지명
- 업체명
- 프로그램명
- 예약 상태
- 결제 상태
- 업체 회신 상태
- 발송 상태
- 숙소 확정 상태
- 픽업 확정 상태
- 정산 상태
- 미회신 여부
- 조정 필요 여부
- 확정가능 여부

### 5.4 목록 표시 필드

- 예약번호
- 예약일
- 고객명 또는 예약명
- 패키지명
- 인원
- 예약 상태
- 결제 상태
- 업체 회신 요약
- 숙소 상태
- 픽업 상태
- 정산 상태
- 최종 운영 판단

### 5.5 동작

- 결과 행 클릭 시 예약 상세/수정 화면으로 이동
- 업체 회신 상태 클릭 시 업체 회신관리 필터 화면으로 이동
- 미회신/조정필요 건 빠른 필터 제공

## 6. 배포 전 확인 목록

### 6.1 환경변수

Vercel에 아래 환경변수 설정 필요:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`는 필요한 서버 기능이 생길 때만 서버 전용으로 사용
- `TELEGRAM_BOT_TOKEN`

금지:

- `NEXT_PUBLIC_TELEGRAM_BOT_TOKEN`
- `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`

### 6.2 Supabase

- SQL migration 실행 여부 확인
- RLS 정책 유지 확인
- authenticated 사용자만 내부 데이터 접근 가능 확인
- anon 직접 접근 차단 확인

### 6.3 Telegram

- Bot token 재발급 여부 검토
- 운영 배포 전에는 현재 노출된 테스트 token을 revoke 후 새 token 사용 권장
- webhook URL은 운영 배포 URL 기준으로 설정

### 6.4 외부 채널 전환 대비

Telegram은 1차 자동화 채널로 사용한다.

추후 카카오 알림톡/비즈메시지로 전환할 수 있도록 아래 원칙을 유지한다.

- `vendor_confirms`는 채널과 무관한 운영 회신 원장으로 유지
- 채널별 값은 `reply_method`, `telegram_chat_id`, 향후 `kakao_*` 필드처럼 분리
- 버튼 회신 결과는 공통 상태값으로 저장
  - `가능`
  - `불가능`
  - `시간조정 필요`
  - `인원조정 필요`
- 예약 확정가능 판단 로직은 Telegram/Kakao 같은 발송 채널에 의존하지 않음
- 고객 연락처, 결제금액, 내부 메모는 어떤 외부 채널에도 포함하지 않음

### 6.5 고객 안내 자동화 보류

현재 Telegram 구축 범위에서는 고객 대상 발송 기능을 만들지 않는다.

- 고객 확정 안내는 운영자가 문자/전화 등으로 직접 처리
- 웹앱은 `고객 안내 완료 및 예약확정` 상태 기록만 담당
- 고객 대상 카카오톡/알림톡 발송, 안내문 템플릿, 발송 이력 관리는 추후 카카오 전환 단계에서 진행
- Telegram은 업체 가능 여부 확인/회신 자동화에만 사용

## 7. 내일 첫 작업 순서

1. 현재 git 변경사항 확인
2. 로컬 dev 서버 상태 확인
3. `vendor_confirms` 테스트 행과 Telegram 발송 상태 확인
4. `app/api/telegram/webhook/route.js` 추가
5. Telegram webhook 또는 로컬 터널 테스트 방식 결정
6. 버튼 클릭 → Supabase 업데이트 확인
7. 업체 회신관리 탭 자동 반영 확인
8. 빌드 테스트
