-- 사업비 상품과 실제 진행 사업비 패키지 N개 연결
-- 목적:
-- 1. 사업비 상품은 계획 인원/예산 카운팅 기준으로 유지
-- 2. 하위 사업비 패키지는 실제 진행 구성/업체 확인 기준으로 별도 연결
-- 3. 기존 biz_budget_items.package_id는 대표/기본 패키지로 유지하고 연결표에 백필

begin;

create table if not exists public.biz_budget_item_packages (
  id uuid primary key default gen_random_uuid(),
  budget_item_id bigint not null references public.biz_budget_items(id) on update cascade on delete cascade,
  package_id uuid not null references public.packages(id) on update cascade on delete cascade,
  is_primary boolean not null default false,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists biz_budget_item_packages_active_uidx
  on public.biz_budget_item_packages(budget_item_id, package_id)
  where is_deleted = false;

create index if not exists biz_budget_item_packages_budget_item_idx
  on public.biz_budget_item_packages(budget_item_id)
  where is_deleted = false;

create index if not exists biz_budget_item_packages_package_idx
  on public.biz_budget_item_packages(package_id)
  where is_deleted = false;

alter table public.biz_budget_item_packages enable row level security;

drop policy if exists "biz_budget_item_packages authenticated select" on public.biz_budget_item_packages;
create policy "biz_budget_item_packages authenticated select"
on public.biz_budget_item_packages for select
to authenticated
using (true);

drop policy if exists "biz_budget_item_packages authenticated insert" on public.biz_budget_item_packages;
create policy "biz_budget_item_packages authenticated insert"
on public.biz_budget_item_packages for insert
to authenticated
with check (true);

drop policy if exists "biz_budget_item_packages authenticated update" on public.biz_budget_item_packages;
create policy "biz_budget_item_packages authenticated update"
on public.biz_budget_item_packages for update
to authenticated
using (true)
with check (true);

drop policy if exists "biz_budget_item_packages authenticated delete" on public.biz_budget_item_packages;
create policy "biz_budget_item_packages authenticated delete"
on public.biz_budget_item_packages for delete
to authenticated
using (true);

insert into public.biz_budget_item_packages (budget_item_id, package_id, is_primary)
select item.id, item.package_id::uuid, true
from public.biz_budget_items item
join public.packages pkg on pkg.id = item.package_id::uuid
where item.category = 'product_operation'
  and coalesce(item.sale_type, 'package') = 'package'
  and item.package_id is not null
  and item.package_id <> ''
  and item.package_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and coalesce(item.is_deleted, false) = false
  and coalesce(pkg.is_deleted, false) = false
  and not exists (
    select 1
    from public.biz_budget_item_packages link
    where link.budget_item_id = item.id
      and link.package_id = item.package_id::uuid
      and coalesce(link.is_deleted, false) = false
  );

commit;
