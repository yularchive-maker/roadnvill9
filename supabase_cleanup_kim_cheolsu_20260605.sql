begin;

create temporary table tmp_kim_cheolsu_reservations_to_cleanup as
select no
from public.reservations
where coalesce(is_deleted, false) = false
  and date = '2026-06-05'
  and customer = '김철수';

update public.vendor_confirms
set is_deleted = true,
    deleted_at = now()
where reservation_no in (
  select no from tmp_kim_cheolsu_reservations_to_cleanup
);

update public.lodge_confirms
set is_deleted = true,
    deleted_at = now()
where reservation_no in (
  select no from tmp_kim_cheolsu_reservations_to_cleanup
);

update public.reservation_pickup
set is_deleted = true,
    deleted_at = now()
where reservation_no in (
  select no from tmp_kim_cheolsu_reservations_to_cleanup
);

update public.reservation_budget_usages
set is_deleted = true,
    deleted_at = now()
where reservation_no in (
  select no from tmp_kim_cheolsu_reservations_to_cleanup
);

update public.reservation_program_snapshots
set is_deleted = true,
    deleted_at = now()
where reservation_no in (
  select no from tmp_kim_cheolsu_reservations_to_cleanup
);

update public.reservations
set is_deleted = true,
    deleted_at = now(),
    reservation_status = '취소',
    type = 'cancelled'
where no in (
  select no from tmp_kim_cheolsu_reservations_to_cleanup
);

commit;

select no as cleaned_reservation_no
from tmp_kim_cheolsu_reservations_to_cleanup
order by no;
