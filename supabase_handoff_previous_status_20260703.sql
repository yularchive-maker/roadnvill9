alter table public.handoff_notes
  add column if not exists previous_status text;

update public.handoff_notes
set previous_status = '일반'
where status = '완료'
  and previous_status is null
  and is_deleted = false;
