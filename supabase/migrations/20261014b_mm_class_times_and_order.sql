-- The app now works in India time and in curriculum order.
-- Class days are India dates (Asia/Kolkata), so a 12:30 am class stays on its own day.
-- Exercises are listed by items.exc_order, and an item's category is items.category_id.

create or replace function mm.ist_date(ts timestamptz) returns date
language sql immutable as $$ select (ts at time zone 'Asia/Kolkata')::date $$;

create or replace function mm.bootstrap(p_pw text)
returns jsonb language plpgsql set search_path to 'mm', 'public' as $function$
begin
  perform mm.assert_pw(p_pw);
  return jsonb_build_object(
    'students', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', trim(s.name)) order by trim(s.name)), '[]') from public.students s),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'sub', sc.name, 'cat', c.name, 'order', i.exc_order) order by i.exc_order), '[]')
              from public.items i
              left join public.subcategories sc on sc.id = i.subcategory_id
              left join public.categories c on c.id = i.category_id)
  );
end $function$;

-- p_at is when the class happened (the calendar event's start, or the time it was logged).
-- If the student already has logs that day, the new entries join that class's time.
-- Without a usable p_at, the student's usual time for that weekday is used, then their usual time, then noon.
create or replace function mm.log_class(p_pw text, p_student_id integer, p_student_name text, p_date date, p_entries jsonb, p_at timestamptz)
returns jsonb language plpgsql set search_path to 'mm', 'public' as $function$
declare
  sid int := p_student_id;
  ts timestamptz;
  usual time;
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

  select min(created_at) into ts from public.student_logs where student_id = sid and mm.ist_date(created_at) = p_date;
  if ts is null and p_at is not null and mm.ist_date(p_at) = p_date then ts := p_at; end if;
  if ts is null then
    select (created_at at time zone 'Asia/Kolkata')::time into usual
      from public.student_logs where student_id = sid
     group by 1
     order by count(distinct mm.ist_date(created_at)) filter (where extract(isodow from created_at at time zone 'Asia/Kolkata') = extract(isodow from p_date)) desc,
              count(distinct mm.ist_date(created_at)) desc
     limit 1;
    ts := (p_date + coalesce(usual, time '12:00')) at time zone 'Asia/Kolkata';
  end if;

  for e in
    select (x->>'item_id')::bigint as item_id, max((x->>'score')::float8) as score
    from jsonb_array_elements(p_entries) x
    where (x->>'item_id') is not null and (x->>'score') is not null
    group by 1
  loop
    if not exists (select 1 from public.items where id = e.item_id) then raise exception 'unknown_item %', e.item_id; end if;
    select id, score into existing from public.student_logs
      where student_id = sid and item_id = e.item_id and mm.ist_date(created_at) = p_date
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
  return jsonb_build_object('student_id', sid, 'created_student', created, 'inserted', n_ins, 'updated', n_upd, 'kept', n_kept, 'at', ts);
end $function$;

create or replace function mm.log_history(p_pw text, p_student_id integer, p_limit integer, p_offset integer)
returns jsonb language plpgsql set search_path to 'mm', 'public' as $function$
begin
  perform mm.assert_pw(p_pw);
  return jsonb_build_object(
    'total', (select count(*) from public.student_logs l where p_student_id is null or l.student_id = p_student_id),
    'rows', (select coalesce(jsonb_agg(r), '[]') from (
      select l.id, l.student_id, l.item_id, l.score, mm.ist_date(l.created_at) as date, l.created_at as at
      from public.student_logs l
      where p_student_id is null or l.student_id = p_student_id
      order by l.created_at desc, l.student_id, l.id
      limit least(greatest(coalesce(p_limit, 200), 1), 1000) offset greatest(coalesce(p_offset, 0), 0)) r));
end $function$;

create or replace function mm.student_bests(p_pw text, p_student_id integer)
returns jsonb language plpgsql set search_path to 'mm', 'public' as $function$
begin
  perform mm.assert_pw(p_pw);
  return jsonb_build_object(
    'bests', (select coalesce(jsonb_agg(jsonb_build_object('item_id', item_id, 'best', best, 'last', last_score, 'last_date', last_date)), '[]') from (
        select distinct on (item_id) item_id,
               max(score) over (partition by item_id) as best,
               score as last_score, mm.ist_date(created_at) as last_date
        from public.student_logs where student_id = p_student_id
        order by item_id, created_at desc, score desc) b),
    'last_class', (select mm.ist_date(max(created_at)) from public.student_logs where student_id = p_student_id),
    'classes', (select count(distinct mm.ist_date(created_at)) from public.student_logs where student_id = p_student_id)
  );
end $function$;

create or replace function mm.student_history(p_pw text, p_student_id integer)
returns jsonb language plpgsql set search_path to 'mm', 'public' as $function$
begin
  perform mm.assert_pw(p_pw);
  return (select coalesce(jsonb_agg(jsonb_build_object('item_id', item_id, 'score', score, 'date', mm.ist_date(created_at)) order by created_at, id), '[]')
          from public.student_logs where student_id = p_student_id);
end $function$;

create or replace function mm.students_summary(p_pw text)
returns jsonb language plpgsql set search_path to 'mm', 'public' as $function$
begin
  perform mm.assert_pw(p_pw);
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', trim(s.name),
      'classes', coalesce(x.classes, 0), 'entries', coalesce(x.entries, 0), 'exercises', coalesce(x.exercises, 0),
      'first_class', x.first_class, 'last_class', x.last_class) order by x.last_class desc nulls last, trim(s.name)), '[]')
    from public.students s
    left join (select student_id, count(distinct mm.ist_date(created_at)) classes, count(*) entries, count(distinct item_id) exercises,
                      mm.ist_date(min(created_at)) first_class, mm.ist_date(max(created_at)) last_class
               from public.student_logs group by student_id) x on x.student_id = s.id);
end $function$;
