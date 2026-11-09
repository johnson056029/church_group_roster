-- Revoke demo access BEFORE adding real accounts and membership-based policies.
begin;
revoke all on function public.demo_snapshot() from public, anon, authenticated;
revoke all on function public.demo_apply_changes(jsonb) from public, anon, authenticated;
commit;
