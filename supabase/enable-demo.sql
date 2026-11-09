-- Explicitly enable shared, unauthenticated test access through these two RPCs.
-- Anyone with the public URL/key can read and change ALL demo records.
-- Use a dedicated TEST project with synthetic data only. Table writes stay revoked.
begin;
grant usage on schema public to anon;
grant execute on function public.demo_snapshot() to anon;
grant execute on function public.demo_apply_changes(jsonb) to anon;
commit;
