-- Multi-zone packages for roadnvill119b
-- Keep packages.zone_code as a legacy/default zone and add a many-to-many zone table.

create table if not exists public.package_zones (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages(id) on update cascade on delete cascade,
  zone_code text not null references public.zones(code) on update cascade,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists package_zones_package_zone_active_uidx
  on public.package_zones(package_id, zone_code)
  where is_deleted = false;

create index if not exists package_zones_package_id_idx
  on public.package_zones(package_id)
  where is_deleted = false;

create index if not exists package_zones_zone_code_idx
  on public.package_zones(zone_code)
  where is_deleted = false;

alter table public.package_zones enable row level security;

drop policy if exists "package_zones authenticated select" on public.package_zones;
create policy "package_zones authenticated select"
on public.package_zones for select
to authenticated
using (true);

drop policy if exists "package_zones authenticated insert" on public.package_zones;
create policy "package_zones authenticated insert"
on public.package_zones for insert
to authenticated
with check (true);

drop policy if exists "package_zones authenticated update" on public.package_zones;
create policy "package_zones authenticated update"
on public.package_zones for update
to authenticated
using (true)
with check (true);

drop policy if exists "package_zones authenticated delete" on public.package_zones;
create policy "package_zones authenticated delete"
on public.package_zones for delete
to authenticated
using (true);

-- Backfill active package zones from the existing legacy default zone.
insert into public.package_zones (package_id, zone_code)
select p.id, p.zone_code
from public.packages p
where p.zone_code is not null
  and p.zone_code <> ''
  and coalesce(p.is_deleted, false) = false
  and not exists (
    select 1
    from public.package_zones pz
    where pz.package_id = p.id
      and pz.zone_code = p.zone_code
      and coalesce(pz.is_deleted, false) = false
  );
