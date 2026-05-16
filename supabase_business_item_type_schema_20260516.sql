-- 사업비 기준정보를 단품/패키지 판매용으로 구분하기 위한 확장
-- 목적:
-- 1. 사업비 단품 체험 판매용과 사업비 패키지 체험 판매용을 같은 테이블에서 구분
-- 2. 패키지형은 기존 packages를 참조
-- 3. 단품형은 업체/프로그램을 참조
-- 4. 기존 데이터는 모두 사업비 패키지(package)로 유지

begin;

alter table public.biz_budget_items
  add column if not exists sale_type text not null default 'package',
  add column if not exists package_id text,
  add column if not exists vendor_key text,
  add column if not exists prog_name text,
  add column if not exists vendor_settle_price numeric not null default 0,
  add column if not exists settle_type text not null default 'per_person';

alter table public.biz_budget_items
  drop constraint if exists biz_budget_items_sale_type_check,
  drop constraint if exists biz_budget_items_settle_type_check;

alter table public.biz_budget_items
  add constraint biz_budget_items_sale_type_check
    check (sale_type in ('single', 'package')),
  add constraint biz_budget_items_settle_type_check
    check (settle_type in ('per_person', 'fixed'));

update public.biz_budget_items b
set
  sale_type = coalesce(nullif(b.sale_type, ''), 'package'),
  package_id = coalesce(b.package_id, p.id::text),
  match_package_name = coalesce(b.match_package_name, b.item_name),
  updated_at = now()
from public.packages p
where b.sale_type = 'package'
  and p.name = coalesce(b.match_package_name, b.item_name)
  and (b.package_id is null or b.package_id = '');

comment on column public.biz_budget_items.sale_type is
  '사업비 상품 판매형태: single=단품 체험 판매용, package=패키지 체험 판매용';

comment on column public.biz_budget_items.package_id is
  'sale_type=package일 때 참조하는 packages.id';

comment on column public.biz_budget_items.vendor_key is
  'sale_type=single일 때 참조하는 업체 key';

comment on column public.biz_budget_items.prog_name is
  'sale_type=single일 때 참조하는 업체 프로그램명';

comment on column public.biz_budget_items.vendor_settle_price is
  '사업비 단품 체험 또는 사업비 패키지 기준의 업체 정산단가. 패키지형은 추후 구성 프로그램별 override로 확장 가능.';

comment on column public.biz_budget_items.settle_type is
  '업체 정산 방식: per_person=인원당, fixed=고정금액';

create index if not exists biz_budget_items_sale_type_idx
  on public.biz_budget_items(sale_type)
  where is_deleted = false;

create index if not exists biz_budget_items_package_id_idx
  on public.biz_budget_items(package_id)
  where is_deleted = false;

create index if not exists biz_budget_items_vendor_program_idx
  on public.biz_budget_items(vendor_key, prog_name)
  where is_deleted = false;

commit;
