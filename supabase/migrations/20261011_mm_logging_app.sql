-- Private schema for the class logging site. Not exposed to anon/authenticated;
-- only the marks-api edge function (connecting as postgres) calls it.
-- The password hash is set separately:
--   insert into mm.settings(key, value)
--   values ('password_hash', extensions.crypt('<password>', extensions.gen_salt('bf')))
--   on conflict (key) do update set value = excluded.value;
create schema if not exists mm;
revoke all on schema mm from public, anon, authenticated;

create table if not exists mm.settings (key text primary key, value text not null);
alter table mm.settings enable row level security;

create or replace function mm.assert_pw(p_pw text) returns void
language plpgsql set search_path = mm, public, extensions as $$
declare h text;
begin
  select value into h from mm.settings where key = 'password_hash';
  if h is null or extensions.crypt(coalesce(p_pw,''), h) <> h then
    raise exception 'wrong_password';
  end if;
end $$;

create or replace function mm.check_password(p_pw text) returns boolean
language plpgsql set search_path = mm, public, extensions as $$
begin
  perform mm.assert_pw(p_pw);
  return true;
exception when others then
  return false;
end $$;

create or replace function mm.bootstrap(p_pw text) returns jsonb
language plpgsql set search_path = mm, public as $$
begin
  perform mm.assert_pw(p_pw);
  return jsonb_build_object(
    'students', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', trim(s.name)) order by trim(s.name)), '[]') from public.students s),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'sub', sc.name, 'cat', c.name) order by i.id), '[]')
              from public.items i
              left join public.subcategories sc on sc.id = i.subcategory_id
              left join public.categories c on c.id = sc.category_id)
  );
end $$;

create or replace function mm.student_bests(p_pw text, p_student_id int) returns jsonb
language plpgsql set search_path = mm, public as $$
begin
  perform mm.assert_pw(p_pw);
  return jsonb_build_object(
    'bests', (select coalesce(jsonb_agg(jsonb_build_object('item_id', item_id, 'best', best, 'last', last_score, 'last_date', last_date)), '[]') from (
        select distinct on (item_id) item_id,
               max(score) over (partition by item_id) as best,
               score as last_score, created_at::date as last_date
        from public.student_logs where student_id = p_student_id
        order by item_id, created_at desc, score desc) b),
    'last_class', (select max(created_at)::date from public.student_logs where student_id = p_student_id),
    'classes', (select count(distinct created_at::date) from public.student_logs where student_id = p_student_id)
  );
end $$;

-- Saves one class. Keeps only the highest score per student, exercise and day.
create or replace function mm.log_class(p_pw text, p_student_id int, p_student_name text, p_date date, p_entries jsonb)
returns jsonb
language plpgsql set search_path = mm, public as $$
declare
  sid int := p_student_id;
  ts timestamptz := (p_date::text || ' 00:00:00+00')::timestamptz;
  e record;
  existing record;
  n_ins int := 0; n_upd int := 0; n_kept int := 0;
  created boolean := false;
begin
  perform mm.assert_pw(p_pw);
  if sid is null then
    if coalesce(trim(p_student_name), '') = '' then raise exception 'student_required'; end if;
    select id into sid from public.students where lower(trim(name)) = lower(trim(p_student_name)) limit 1;
    if sid is null then
      insert into public.students (name, teacher_id) values (trim(p_student_name), 1) returning id into sid;
      created := true;
    end if;
  end if;
  for e in
    select (x->>'item_id')::bigint as item_id, max((x->>'score')::float8) as score
    from jsonb_array_elements(p_entries) x
    where (x->>'item_id') is not null and (x->>'score') is not null
    group by 1
  loop
    if not exists (select 1 from public.items where id = e.item_id) then raise exception 'unknown_item %', e.item_id; end if;
    select id, score into existing from public.student_logs
      where student_id = sid and item_id = e.item_id and created_at::date = p_date
      order by score desc limit 1;
    if existing.id is null then
      insert into public.student_logs (student_id, item_id, score, created_at) values (sid, e.item_id, e.score, ts);
      n_ins := n_ins + 1;
    elsif e.score > existing.score then
      update public.student_logs set score = e.score where id = existing.id;
      n_upd := n_upd + 1;
    else
      n_kept := n_kept + 1;
    end if;
    existing := null;
  end loop;
  return jsonb_build_object('student_id', sid, 'created_student', created, 'inserted', n_ins, 'updated', n_upd, 'kept', n_kept);
end $$;

revoke all on all functions in schema mm from public, anon, authenticated;
revoke all on all tables in schema mm from public, anon, authenticated;
