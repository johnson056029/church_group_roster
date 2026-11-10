-- Run once after 001_schema.sql (safe to rerun).
-- Business conflicts must not use SQLSTATE 40001: PostgREST can retry it
-- indefinitely. PT409 returns HTTP 409 without retrying the transaction.
-- Replaces only the function definition; existing rows and grants stay intact.
begin;
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.demo_apply_changes(jsonb)'::regprocedure);
  if position('errcode = ''40001''' in definition) > 0 then
    execute replace(definition, 'errcode = ''40001''', 'errcode = ''PT409''');
  elsif position('errcode = ''PT409''' in definition) = 0 then
    raise exception 'Unexpected function definition; inspect before changing it.';
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
