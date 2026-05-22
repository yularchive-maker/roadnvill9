-- Store multi-zone selections for reservation component rows.
-- Safe additive migration: keeps existing zone_code for backward compatibility.

alter table public.reservation_budget_usages
add column if not exists zone_codes text[] not null default '{}';

update public.reservation_budget_usages
set zone_codes = array[zone_code]
where zone_code is not null
  and zone_code <> ''
  and (zone_codes is null or cardinality(zone_codes) = 0);

create index if not exists reservation_budget_usages_zone_codes_gin_idx
on public.reservation_budget_usages
using gin (zone_codes);
