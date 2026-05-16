-- 일반 패키지와 사업비 패키지 분리
-- 목적:
-- 1. 기존 packages 테이블은 유지하면서 package_type으로 일반/사업비 패키지를 구분
-- 2. 기존 패키지는 모두 general로 보존
-- 3. 사업비 상품의 연결 패키지는 business 패키지만 선택하도록 앱에서 필터링

begin;

alter table public.packages
  add column if not exists package_type text not null default 'general';

alter table public.packages
  drop constraint if exists packages_package_type_check;

alter table public.packages
  add constraint packages_package_type_check
    check (package_type in ('general', 'business'));

update public.packages
set package_type = coalesce(nullif(package_type, ''), 'general')
where package_type is null
   or package_type = '';

comment on column public.packages.package_type is
  '패키지 구분: general=일반 패키지, business=사업비 패키지';

create index if not exists packages_package_type_idx
  on public.packages(package_type)
  where is_deleted = false;

commit;
