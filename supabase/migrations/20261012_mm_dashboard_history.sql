-- Read functions for the Dashboard and Log History pages. All check the app password first.
create or replace function mm.students_summary(p_pw text) returns jsonb
language plpgsql set search_path = mm, public as $$
begin
  perform mm.assert_pw(p_pw);
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', trim(s.name),
      'classes', coalesce(x.classes, 0), 'entries', coalesce(x.entries, 0), 'exercises', coalesce(x.exercises, 0),
      'first_class', x.first_class, 'last_class', x.last_class) order by x.last_class desc nulls last, trim(s.name)), '[]')
    from public.students s
    left join (select student_id, count(distinct created_at::date) classes, count(*) entries, count(distinct item_id) exercises,
                      min(created_at)::date first_class, max(created_at)::date last_class
               from public.student_logs group by student_id) x on x.student_id = s.id);
end $$;

create or replace function mm.student_history(p_pw text, p_student_id integer) returns jsonb
language plpgsql set search_path = mm, public as $$
begin
  perform mm.assert_pw(p_pw);
  return (select coalesce(jsonb_agg(jsonb_build_object('item_id', item_id, 'score', score, 'date', created_at::date) order by created_at, id), '[]')
          from public.student_logs where student_id = p_student_id);
end $$;

create or replace function mm.log_history(p_pw text, p_student_id integer, p_limit integer, p_offset integer) returns jsonb
language plpgsql set search_path = mm, public as $$
begin
  perform mm.assert_pw(p_pw);
  return jsonb_build_object(
    'total', (select count(*) from public.student_logs l where p_student_id is null or l.student_id = p_student_id),
    'rows', (select coalesce(jsonb_agg(r), '[]') from (
      select l.id, l.student_id, l.item_id, l.score, l.created_at::date as date
      from public.student_logs l
      where p_student_id is null or l.student_id = p_student_id
      order by l.created_at desc, l.student_id, l.id
      limit least(greatest(coalesce(p_limit, 200), 1), 1000) offset greatest(coalesce(p_offset, 0), 0)) r));
end $$;

revoke all on all functions in schema mm from public, anon, authenticated;
