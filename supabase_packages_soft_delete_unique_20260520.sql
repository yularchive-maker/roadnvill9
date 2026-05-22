-- Allow package names to be reused after soft delete.
-- Run in Supabase SQL Editor.

alter table public.packages
drop constraint if exists packages_name_key;

create unique index if not exists packages_name_type_active_uidx
on public.packages (name, coalesce(package_type, 'general'))
where coalesce(is_deleted, false) = false;
