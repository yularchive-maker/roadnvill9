create table if not exists public.handoff_notes (
  id bigserial primary key,
  title text not null,
  content text not null default '',
  status text not null default '일반',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false,
  deleted_at timestamptz
);

create table if not exists public.handoff_reads (
  id bigserial primary key,
  handoff_id bigint not null references public.handoff_notes(id),
  user_id uuid not null references auth.users(id),
  read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (handoff_id, user_id)
);

alter table public.handoff_notes enable row level security;
alter table public.handoff_reads enable row level security;

drop policy if exists internal_staff_select_handoff_notes on public.handoff_notes;
create policy internal_staff_select_handoff_notes
  on public.handoff_notes for select to authenticated
  using (true);

drop policy if exists internal_staff_insert_handoff_notes on public.handoff_notes;
create policy internal_staff_insert_handoff_notes
  on public.handoff_notes for insert to authenticated
  with check (true);

drop policy if exists internal_staff_update_handoff_notes on public.handoff_notes;
create policy internal_staff_update_handoff_notes
  on public.handoff_notes for update to authenticated
  using (true)
  with check (true);

drop policy if exists internal_staff_select_handoff_reads on public.handoff_reads;
create policy internal_staff_select_handoff_reads
  on public.handoff_reads for select to authenticated
  using (user_id = auth.uid());

drop policy if exists internal_staff_insert_handoff_reads on public.handoff_reads;
create policy internal_staff_insert_handoff_reads
  on public.handoff_reads for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists internal_staff_update_handoff_reads on public.handoff_reads;
create policy internal_staff_update_handoff_reads
  on public.handoff_reads for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists handoff_notes_active_status_idx
  on public.handoff_notes(status, created_at desc)
  where is_deleted = false;

create index if not exists handoff_reads_user_idx
  on public.handoff_reads(user_id);

create index if not exists handoff_reads_handoff_idx
  on public.handoff_reads(handoff_id);
