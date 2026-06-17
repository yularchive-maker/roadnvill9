alter table public.lodges
  add column if not exists zone_code text references public.zones(code) on update cascade;

create index if not exists lodges_zone_code_active_idx
  on public.lodges(zone_code)
  where coalesce(is_deleted, false) = false;
