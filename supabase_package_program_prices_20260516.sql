-- 일반 패키지 구성 프로그램별 정산단가 저장용 컬럼 추가
-- 목적:
-- 1. 패키지 판매가는 packages.total_price에 유지
-- 2. 패키지를 구성하는 각 업체 프로그램의 정산단가는 package_programs에 별도 저장
-- 3. 기존 데이터는 업체 단품 정산단가를 기준으로 안전하게 backfill

alter table public.package_programs
  add column if not exists vendor_settle_price numeric not null default 0,
  add column if not exists settle_type text not null default 'per_person',
  add column if not exists price_note text;

update public.package_programs pp
set
  vendor_settle_price = coalesce(nullif(pp.vendor_settle_price, 0), vp.vendor_settle_price, vp.unit_price, 0),
  settle_type = coalesce(nullif(pp.settle_type, ''), vp.settle_type, 'per_person')
from public.vendor_programs vp
where pp.vendor_key = vp.vendor_key
  and pp.prog_name = vp.prog_name
  and (
    pp.vendor_settle_price = 0
    or pp.vendor_settle_price is null
    or pp.settle_type is null
    or pp.settle_type = ''
  );

comment on column public.package_programs.vendor_settle_price is
  '일반 패키지/사업비 패키지 구성 프로그램별 업체 정산단가. 패키지 판매가는 packages.total_price 등 패키지 단위 필드를 사용한다.';

comment on column public.package_programs.settle_type is
  '정산 방식: per_person=인원당, fixed=고정금액';

comment on column public.package_programs.price_note is
  '패키지 구성 프로그램 정산단가 관련 메모';
