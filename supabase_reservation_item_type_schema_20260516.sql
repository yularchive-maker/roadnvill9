-- 예약 상품 구성 장바구니용 컬럼 확장
-- 목적:
-- 1. 예약 하나에 일반/사업비, 단품/패키지 상품을 섞어 담을 수 있게 함
-- 2. 기존 reservation_budget_usages 구조는 유지하고 필요한 식별 컬럼만 추가
-- 3. 기존 데이터는 package 판매형태로 유지

begin;

alter table public.reservation_budget_usages
  add column if not exists sale_type text not null default 'package',
  add column if not exists item_name text,
  add column if not exists vendor_key text,
  add column if not exists prog_name text;

alter table public.reservation_budget_usages
  drop constraint if exists reservation_budget_usages_sale_type_check;

alter table public.reservation_budget_usages
  add constraint reservation_budget_usages_sale_type_check
    check (sale_type in ('single', 'package'));

update public.reservation_budget_usages
set
  sale_type = coalesce(nullif(sale_type, ''), 'package'),
  item_name = coalesce(item_name, package_name),
  updated_at = now()
where item_name is null
   or sale_type is null
   or sale_type = '';

comment on column public.reservation_budget_usages.sale_type is
  '예약 구성 판매형태: single=단품 체험, package=패키지 체험';

comment on column public.reservation_budget_usages.item_name is
  '예약 구성에 표시할 상품명. 기존 package_name과 호환되며 단품/패키지 모두 사용한다.';

comment on column public.reservation_budget_usages.vendor_key is
  'sale_type=single일 때 연결된 업체 key';

comment on column public.reservation_budget_usages.prog_name is
  'sale_type=single일 때 연결된 업체 프로그램명';

create index if not exists reservation_budget_usages_sale_type_idx
  on public.reservation_budget_usages(sale_type)
  where is_deleted = false;

create index if not exists reservation_budget_usages_single_program_idx
  on public.reservation_budget_usages(vendor_key, prog_name)
  where is_deleted = false;

commit;
