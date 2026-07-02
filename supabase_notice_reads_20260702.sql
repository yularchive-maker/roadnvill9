alter table public.notices
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.notice_reads (
  id bigserial primary key,
  notice_id text not null,
  user_id uuid not null references auth.users(id),
  read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (notice_id, user_id)
);

alter table public.notice_reads enable row level security;

drop policy if exists internal_staff_select_notice_reads on public.notice_reads;
create policy internal_staff_select_notice_reads
  on public.notice_reads for select to authenticated
  using (user_id = auth.uid());

drop policy if exists internal_staff_insert_notice_reads on public.notice_reads;
create policy internal_staff_insert_notice_reads
  on public.notice_reads for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists internal_staff_update_notice_reads on public.notice_reads;
create policy internal_staff_update_notice_reads
  on public.notice_reads for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists notice_reads_user_idx
  on public.notice_reads(user_id);

create index if not exists notice_reads_notice_idx
  on public.notice_reads(notice_id);

create index if not exists notices_urgent_active_idx
  on public.notices(date, end_date)
  where coalesce(is_deleted, false) = false and notice_type = '긴급';
