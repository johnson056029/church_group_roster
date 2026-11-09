-- Run in a NEW, dedicated test project. Tables are inaccessible to public API roles by default.
begin;
create table public.members (
  id text primary key,
  group_id text check (group_id is null),
  member_id text check (member_id is null),
  data jsonb not null check (jsonb_typeof(data) = 'object')
);
create table public.groups (
  id text primary key,
  group_id text check (group_id is null),
  member_id text check (member_id is null),
  data jsonb not null check (jsonb_typeof(data) = 'object')
);
do $$
declare table_name text;
begin
  foreach table_name in array array['memberships','meetings','assignments','cycles','survey_responses','leave_requests','custom_surveys','notifications','group_documents'] loop
    execute format('create table public.%I (
      id text primary key,
      group_id text not null references public.groups(id),
      member_id text references public.members(id),
      data jsonb not null check (jsonb_typeof(data) = ''object'')
    )', table_name);
    execute format('create index on public.%I (group_id)', table_name);
  end loop;
end $$;
alter table public.memberships add constraint membership_member_required check (member_id is not null);
alter table public.memberships add constraint membership_unique unique (group_id, member_id);
alter table public.memberships add constraint membership_role check (data->>'role' in ('manage', 'view', 'member'));
alter table public.survey_responses add constraint response_member_required check (member_id is not null);
alter table public.leave_requests add constraint request_member_required check (member_id is not null);
alter table public.leave_requests add constraint request_status check (data->>'status' in ('open', 'filled'));
create unique index assignment_slot on public.assignments (group_id, (data->>'date'), (data->>'service'));
create unique index response_per_cycle on public.survey_responses (group_id, member_id, (data->>'cycle'));

do $$
declare table_name text;
begin
  foreach table_name in array array['members','groups','memberships','meetings','assignments','cycles','survey_responses','leave_requests','custom_surveys','notifications','group_documents'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
  end loop;
end $$;

-- One SQL statement gives clients a consistent snapshot across all tables.
create function public.demo_snapshot() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(row order by row->>'table', row->>'id'), '[]'::jsonb) from (
    select to_jsonb(t) || '{"table":"members"}'::jsonb row from public.members t
    union all select to_jsonb(t) || '{"table":"groups"}'::jsonb from public.groups t
    union all select to_jsonb(t) || '{"table":"memberships"}'::jsonb from public.memberships t
    union all select to_jsonb(t) || '{"table":"meetings"}'::jsonb from public.meetings t
    union all select to_jsonb(t) || '{"table":"assignments"}'::jsonb from public.assignments t
    union all select to_jsonb(t) || '{"table":"cycles"}'::jsonb from public.cycles t
    union all select to_jsonb(t) || '{"table":"survey_responses"}'::jsonb from public.survey_responses t
    union all select to_jsonb(t) || '{"table":"leave_requests"}'::jsonb from public.leave_requests t
    union all select to_jsonb(t) || '{"table":"custom_surveys"}'::jsonb from public.custom_surveys t
    union all select to_jsonb(t) || '{"table":"notifications"}'::jsonb from public.notifications t
    union all select to_jsonb(t) || '{"table":"group_documents"}'::jsonb from public.group_documents t
  ) records;
$$;

-- This is a deliberately demo-only API, NOT identity-based authorization.
-- Every batch is atomic. Compare-and-swap prevents stale browsers overwriting others.
create function public.demo_apply_changes(changes jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  change jsonb; current_row jsonb; next_row jsonb; table_name text; record_id text;
begin
  if jsonb_typeof(changes) is distinct from 'array' or jsonb_array_length(changes) > 1000 then
    raise exception 'Invalid changes batch';
  end if;
  -- Serializes this tiny test app's writes, including competing inserts.
  perform pg_catalog.pg_advisory_xact_lock(17402319);
  for change in select value from jsonb_array_elements(changes) loop
    table_name := change->>'table'; record_id := change->>'id';
    if table_name is null or table_name <> all(array['members','groups','memberships','meetings','assignments','cycles','survey_responses','leave_requests','custom_surveys','notifications','group_documents']) then
      raise exception 'Invalid table';
    end if;
    if record_id is null or not (change ? 'before' and change ? 'after') then raise exception 'Invalid change'; end if;
    execute format('select to_jsonb(t) || jsonb_build_object(''table'', $2) from public.%I t where id = $1 for update', table_name)
      into current_row using record_id, table_name;
    if coalesce(current_row, 'null'::jsonb) is distinct from change->'before' then
      raise exception '資料已被其他人修改，請重新載入後再操作。' using errcode = '40001';
    end if;
    next_row := change->'after';
    if next_row = 'null'::jsonb then
      execute format('delete from public.%I where id = $1', table_name) using record_id;
    else
      if next_row->>'id' is distinct from record_id or next_row->>'table' is distinct from table_name then raise exception 'Invalid record identity'; end if;
      execute format('insert into public.%I (id,group_id,member_id,data) values ($1,$2,$3,$4)
        on conflict (id) do update set group_id=excluded.group_id, member_id=excluded.member_id, data=excluded.data', table_name)
        using record_id, next_row->>'group_id', next_row->>'member_id', next_row->'data';
    end if;
  end loop;
end;
$$;
revoke all on function public.demo_snapshot() from public, anon, authenticated;
revoke all on function public.demo_apply_changes(jsonb) from public, anon, authenticated;
commit;
