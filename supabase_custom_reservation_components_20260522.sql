begin;

alter table public.reservation_budget_usages
  add column if not exists component_uid text,
  add column if not exists vendor_settle_unit_price numeric(12, 0) not null default 0,
  add column if not exists start_time text,
  add column if not exists end_time text,
  add column if not exists place text;

update public.reservation_budget_usages
set component_uid = coalesce(component_uid, id::text)
where component_uid is null;

alter table public.reservation_budget_usages
  drop constraint if exists reservation_budget_usages_amount_check;

alter table public.reservation_budget_usages
  add constraint reservation_budget_usages_amount_check check (
    unit_amount >= 0
    and used_amount >= 0
    and normal_unit_price >= 0
    and customer_unit_price >= 0
    and vendor_settle_unit_price >= 0
    and prepaid_unit_amount >= 0
    and prepaid_total_amount >= 0
    and reimbursed_amount >= 0
  );

drop index if exists public.reservation_budget_usages_component_uidx;

create unique index if not exists reservation_budget_usages_component_uidx
  on public.reservation_budget_usages(
    reservation_no,
    coalesce(component_uid, ''),
    usage_type,
    discount_rate
  )
  where is_deleted = false;

comment on column public.reservation_budget_usages.component_uid is
  'Stable client-side component id. Allows the same one-off program to be added multiple times in one reservation.';
comment on column public.reservation_budget_usages.vendor_settle_unit_price is
  'Optional reservation-level vendor settlement unit price override for one-off custom program components.';
comment on column public.reservation_budget_usages.start_time is
  'Optional reservation-level program start time for one-off custom components.';
comment on column public.reservation_budget_usages.end_time is
  'Optional reservation-level program end time for one-off custom components.';
comment on column public.reservation_budget_usages.place is
  'Optional reservation-level program place for one-off custom components.';

commit;
