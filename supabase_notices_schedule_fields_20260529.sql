alter table public.notices
  add column if not exists title text,
  add column if not exists end_date date,
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists place text,
  add column if not exists color text default '#6E8DFB',
  add column if not exists notice_type text default '일반',
  add column if not exists is_all_day boolean not null default false,
  add column if not exists updated_at timestamptz default now();

update public.notices
set title = left(coalesce(nullif(title, ''), nullif(content, ''), nullif(special, ''), '알림'), 80)
where title is null or title = '';

update public.notices
set end_date = date
where end_date is null;

create index if not exists notices_date_active_idx
  on public.notices(date)
  where coalesce(is_deleted, false) = false;

create index if not exists notices_date_time_active_idx
  on public.notices(date, start_time, end_time)
  where coalesce(is_deleted, false) = false;

create index if not exists notices_date_range_active_idx
  on public.notices(date, end_date)
  where coalesce(is_deleted, false) = false;

create index if not exists notices_type_active_idx
  on public.notices(notice_type)
  where coalesce(is_deleted, false) = false;
