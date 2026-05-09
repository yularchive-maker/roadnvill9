BEGIN;

-- roadnvill119b step 1 security baseline
-- RLS is enabled separately. These policies allow logged-in internal staff
-- to read, insert, and update operational data through Supabase Auth.
-- No DELETE policies are created; destructive actions should be replaced
-- with soft delete fields in the next DB-structure step.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'lodge_vendors',
    'lodges',
    'packages',
    'vendor_programs',
    'package_programs',
    'lodge_confirms',
    'notices',
    'reservations',
    'reservation_pickup',
    'vendor_confirms',
    'vendors',
    'zones',
    'platforms',
    'drivers',
    'biz',
    'biz_payments',
    'settle_history',
    'settle_history_items',
    'timetable_events'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'internal_staff_select_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
      'internal_staff_select_' || t,
      t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'internal_staff_insert_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (true)',
      'internal_staff_insert_' || t,
      t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'internal_staff_update_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)',
      'internal_staff_update_' || t,
      t
    );
  END LOOP;
END $$;

COMMIT;
