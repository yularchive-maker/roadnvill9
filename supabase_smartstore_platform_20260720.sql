-- Add Smartstore as a sales platform/channel.
-- Safe to run more than once.
-- Fee values are set to 0 by default. Update them in the app's master data screen if needed.

update public.platforms
set is_deleted = false,
    deleted_at = null
where type = '플랫폼'
  and name = '스마트스토어';

insert into public.platforms (type, name, contact, tel, fee_ind, fee_grp, is_deleted)
select '플랫폼', '스마트스토어', '', '', 0, 0, false
where not exists (
  select 1
  from public.platforms
  where type = '플랫폼'
    and name = '스마트스토어'
);

-- Verification query:
-- select id, type, name, fee_ind, fee_grp, is_deleted
-- from public.platforms
-- where type = '플랫폼'
--   and name = '스마트스토어';
