-- The old unsigned onboarding path is closed to every client (RAPP-624).
--
-- `public.complete_onboarding(jsonb)` records a terms acceptance with no
-- signature. Since RAPP-613 the phone only calls `complete_onboarding_signed`,
-- which runs it inside as its owner (security definer), so no client role
-- needs it: anon and authenticated lose EXECUTE. Tests that check its merge
-- rules as a participant grant it inside their own rolled-back transaction.
--
-- Docs: https://www.postgresql.org/docs/current/sql-revoke.html and
-- https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker

revoke all on function public.complete_onboarding(jsonb) from public, anon, authenticated;
