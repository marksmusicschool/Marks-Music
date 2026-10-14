-- Decision 6: Harith Gowda, 2025-11-14, C major chord scale downstroke. Keep log 45 (35), remove log 46 (70).
delete from public.student_logs where id = 46 and student_id = 3 and item_id = 56 and score = 70;

-- Decision 3: the alternate picking subcategory is empty now that the item sits directly under Right Hand Technique.
delete from public.subcategories s
 where s.name = 'alternative picking excercise'
   and not exists (select 1 from public.items i where i.subcategory_id = s.id);
