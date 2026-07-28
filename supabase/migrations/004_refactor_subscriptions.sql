-- ============================================================
-- 004_refactor_subscriptions.sql
-- Drop the computed subscription view and function.
-- Subscriptions will now be fetched directly via Supabase associations.
-- ============================================================

DROP VIEW IF EXISTS public.children_with_status;
DROP FUNCTION IF EXISTS public.get_child_subscription_status(UUID);
