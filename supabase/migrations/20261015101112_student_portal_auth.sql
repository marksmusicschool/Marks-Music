-- Student passwords live in Supabase Auth; this table only links an Auth user to a student.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

create table private.student_portal_accounts (
  student_id smallint primary key references public.students(id) on delete cascade,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now()
);

alter table private.student_portal_accounts enable row level security;
revoke all on private.student_portal_accounts from public, anon, authenticated, service_role;

-- Student full names are the requested usernames, so login names must be unique.
create unique index students_login_name_unique
  on public.students (lower(btrim(name)))
  where name is not null and btrim(name) <> '';

-- The browser must never query student tables directly. The app uses the server-side
-- Edge Function, which checks the admin password or the signed-in student's identity.
-- With no policies, anon/authenticated roles cannot read or write public table rows.
do $migration$
declare
  t record;
begin
  for t in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('alter table %I.%I enable row level security', t.schema_name, t.table_name);
  end loop;
end
$migration$;
