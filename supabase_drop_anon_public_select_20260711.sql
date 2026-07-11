begin;

-- roadnvill9 security migration: remove anonymous/public SELECT access.
--
-- Scope verified from application code on 2026-07-11:
-- - Business screens are under /dashboard and are protected by middleware.js.
-- - API routes under /api are protected by middleware.js except auth logout and Telegram webhook.
-- - Client-side Supabase reads happen after Supabase Auth session creation, so they use
--   the authenticated role, not the anonymous public role.
-- - Server route handlers use the user's Supabase session; service_role is only available
--   through lib/supabase-admin.js when explicitly configured.
--
-- Therefore the tables below do not need anon/public SELECT policies for the app to work.
-- This migration intentionally does NOT remove authenticated policies.
--
-- Sensitive / internal operational tables covered:
-- reservations, reservation_pickup, vendor_confirms, lodge_confirms,
-- settle_history, settle_history_items, drivers, vendors, lodge_vendors, lodges,
-- notices, handoff_notes, handoff_reads, platforms, biz, biz_payments,
-- biz_budget_items, biz_budget_item_packages, reservation_budget_usages,
-- reservation_program_snapshots, reservation_profit_adjustments,
-- program_price_history, vendor_programs, packages, package_programs,
-- package_zones, zones, timetable_events.

do $$
declare
  policy_row record;
  protected_tables text[] := array[
    'reservations',
    'reservation_pickup',
    'vendor_confirms',
    'lodge_confirms',
    'settle_history',
    'settle_history_items',
    'drivers',
    'vendors',
    'lodge_vendors',
    'lodges',
    'notices',
    'handoff_notes',
    'handoff_reads',
    'platforms',
    'biz',
    'biz_payments',
    'biz_budget_items',
    'biz_budget_item_packages',
    'reservation_budget_usages',
    'reservation_program_snapshots',
    'reservation_profit_adjustments',
    'program_price_history',
    'vendor_programs',
    'packages',
    'package_programs',
    'package_zones',
    'zones',
    'timetable_events'
  ];
begin
  for policy_row in
    select
      schemaname,
      tablename,
      policyname,
      roles,
      cmd
    from pg_policies
    where schemaname = 'public'
      and tablename = any(protected_tables)
      and cmd in ('SELECT', 'ALL')
      and (
        'anon' = any(roles)
        or 'public' = any(roles)
      )
  loop
    raise notice 'Dropping public SELECT policy %.%: % roles=% cmd=%',
      policy_row.schemaname,
      policy_row.tablename,
      policy_row.policyname,
      policy_row.roles,
      policy_row.cmd;

    execute format(
      'drop policy if exists %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end $$;

commit;

-- Verification query 1: this should return zero rows after the migration.
--
-- select
--   schemaname,
--   tablename,
--   policyname,
--   roles,
--   cmd,
--   qual as using_condition,
--   with_check
-- from pg_policies
-- where schemaname = 'public'
--   and tablename in (
--     'reservations',
--     'reservation_pickup',
--     'vendor_confirms',
--     'lodge_confirms',
--     'settle_history',
--     'settle_history_items',
--     'drivers',
--     'vendors',
--     'lodge_vendors',
--     'lodges',
--     'notices',
--     'handoff_notes',
--     'handoff_reads',
--     'platforms',
--     'biz',
--     'biz_payments',
--     'biz_budget_items',
--     'biz_budget_item_packages',
--     'reservation_budget_usages',
--     'reservation_program_snapshots',
--     'reservation_profit_adjustments',
--     'program_price_history',
--     'vendor_programs',
--     'packages',
--     'package_programs',
--     'package_zones',
--     'zones',
--     'timetable_events'
--   )
--   and cmd in ('SELECT', 'ALL')
--   and ('anon' = any(roles) or 'public' = any(roles))
-- order by tablename, policyname;
--
-- Verification query 2: check RLS is enabled on these public tables.
--
-- select
--   n.nspname as schema_name,
--   c.relname as table_name,
--   c.relrowsecurity as rls_enabled,
--   c.relforcerowsecurity as rls_forced
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public'
--   and c.relkind = 'r'
--   and c.relname in (
--     'reservations',
--     'reservation_pickup',
--     'vendor_confirms',
--     'lodge_confirms',
--     'settle_history',
--     'settle_history_items',
--     'drivers',
--     'vendors',
--     'lodge_vendors',
--     'lodges',
--     'notices',
--     'handoff_notes',
--     'handoff_reads',
--     'platforms',
--     'biz',
--     'biz_payments',
--     'biz_budget_items',
--     'biz_budget_item_packages',
--     'reservation_budget_usages',
--     'reservation_program_snapshots',
--     'reservation_profit_adjustments',
--     'program_price_history',
--     'vendor_programs',
--     'packages',
--     'package_programs',
--     'package_zones',
--     'zones',
--     'timetable_events'
--   )
-- order by c.relname;
--
-- Verification query 3: authenticated policies should remain for app screens.
--
-- select
--   tablename,
--   policyname,
--   roles,
--   cmd,
--   qual as using_condition,
--   with_check
-- from pg_policies
-- where schemaname = 'public'
--   and tablename in (
--     'reservations',
--     'reservation_pickup',
--     'vendor_confirms',
--     'lodge_confirms',
--     'settle_history',
--     'settle_history_items',
--     'drivers',
--     'vendors',
--     'lodge_vendors',
--     'lodges',
--     'notices',
--     'handoff_notes',
--     'handoff_reads',
--     'platforms',
--     'biz',
--     'biz_payments',
--     'biz_budget_items',
--     'biz_budget_item_packages',
--     'reservation_budget_usages',
--     'reservation_program_snapshots',
--     'reservation_profit_adjustments',
--     'program_price_history',
--     'vendor_programs',
--     'packages',
--     'package_programs',
--     'package_zones',
--     'zones',
--     'timetable_events'
--   )
--   and 'authenticated' = any(roles)
-- order by tablename, policyname;
