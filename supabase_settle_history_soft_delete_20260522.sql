alter table public.settle_history
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.settle_history_items
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists settle_history_active_idx
  on public.settle_history(id)
  where is_deleted = false;

create index if not exists settle_history_items_active_idx
  on public.settle_history_items(settle_history_id)
  where is_deleted = false;
