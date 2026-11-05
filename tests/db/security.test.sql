-- Security / workflow tests for the migration. Run with scripts/test-db.sh.
-- Each check prints PASS or FAIL; the runner fails if any FAIL/ERROR appears.
-- "Logging in" is emulated the same way PostgREST does it:
--   SET ROLE authenticated + request.jwt.claims = {"sub": <user id>}.
\set QUIET on
\set VERBOSITY terse
set client_min_messages = notice;

-- ---------- test helpers (security invoker: run as the current role) ----------
create schema test;
grant usage on schema test to anon, authenticated, service_role;

create function test.ok(name text, q text) returns void language plpgsql as $$
begin
  execute q;
  raise notice 'PASS  %', name;
exception when others then
  raise notice 'FAIL  % -> unexpected error: %', name, sqlerrm;
end $$;

create function test.fails(name text, q text) returns void language plpgsql as $$
begin
  execute q;
  raise notice 'FAIL  % -> succeeded but should have been rejected', name;
exception when others then
  raise notice 'PASS  % [%]', name, sqlerrm;
end $$;

create function test.rows(name text, q text, expected int) returns void language plpgsql as $$
declare n int;
begin
  execute q;
  get diagnostics n = row_count;
  if n = expected then raise notice 'PASS  % (% rows)', name, n;
  else raise notice 'FAIL  % -> % rows, expected %', name, n, expected; end if;
exception when others then
  if expected = 0 then raise notice 'PASS  % [%]', name, sqlerrm;
  else raise notice 'FAIL  % -> error: %', name, sqlerrm; end if;
end $$;

create function test.cnt(name text, q text, expected int) returns void language plpgsql as $$
declare n int;
begin
  execute 'select count(*) from (' || q || ') s' into n;
  if n = expected then raise notice 'PASS  % (count=%)', name, n;
  else raise notice 'FAIL  % -> count=%, expected %', name, n, expected; end if;
exception when others then
  raise notice 'FAIL  % -> error: %', name, sqlerrm;
end $$;

create function test.eq(name text, q text, expected text) returns void language plpgsql as $$
declare v text;
begin
  execute q into v;
  if v is not distinct from expected then raise notice 'PASS  % (=%)', name, v;
  else raise notice 'FAIL  % -> got %, expected %', name, v, expected; end if;
end $$;

grant execute on all functions in schema test to anon, authenticated, service_role;

-- ---------- users (as an admin would create them) ----------
\set M  '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set M2 '''aaaaaaaa-0000-0000-0000-00000000000b'''
\set E1 '''eeeeeeee-0000-0000-0000-0000000000e1'''
\set E2 '''eeeeeeee-0000-0000-0000-0000000000e2'''

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  (:M,  'manager@test',  '{"full_name":"Анна Петрова"}',  '{"role":"manager"}'),
  (:M2, 'manager2@test', '{"full_name":"Олег Смирнов"}',  '{"role":"manager"}'),
  (:E1, 'exec1@test',    '{"full_name":"Иван Иванов"}',   '{}'),
  -- tries to self-assign manager via user_metadata: must be ignored
  (:E2, 'exec2@test',    '{"full_name":"Пётр Сидоров","role":"manager"}', '{}');

\echo '--- profiles created by trigger'
select test.eq('trigger: manager role from app_metadata', $$select role::text from public.profiles where full_name='Анна Петрова'$$, 'manager');
select test.eq('trigger: user_metadata role is ignored',  $$select role::text from public.profiles where full_name='Пётр Сидоров'$$, 'executor');

-- ============================ anon =============================
\echo '--- anon (not logged in)'
set role anon;
select test.fails('anon cannot read objects',  'select * from public.objects');
select test.fails('anon cannot read tasks',    'select * from public.tasks');
select test.fails('anon cannot read profiles', 'select * from public.profiles');
select test.fails('anon cannot call change_task_status', $$select public.change_task_status(gen_random_uuid(), 'accepted', null)$$);
reset role;

-- ============================ manager ==========================
\echo '--- manager creates data'
set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :M)::text, false);

select test.ok('manager creates object 1', $$insert into public.objects (name, address) values ('ЖК Север', 'ул. Ленина, 1')$$);
select test.ok('manager creates object 2', $$insert into public.objects (name, address) values ('ТЦ Южный', 'пр. Мира, 10')$$);
select test.ok('manager creates object 3', $$insert into public.objects (name, address) values ('Склад', 'ул. Заводская, 5')$$);
select test.fails('manager cannot set created_by', format($$insert into public.objects (name, address, created_by) values ('x','y', %L)$$, :E1));
select test.fails('manager cannot hard-delete object', $$delete from public.objects where name = 'Склад'$$);
reset role;

select id as o1 from public.objects where name = 'ЖК Север' \gset
select id as o2 from public.objects where name = 'ТЦ Южный' \gset
select id as o3 from public.objects where name = 'Склад' \gset

set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :M)::text, false);
select test.ok('manager creates task T1 (o1, E1)', format($$insert into public.tasks (object_id, title, description, assignee_id) values (%L, 'Залить фундамент', 'Секция А', %L)$$, :'o1', :E1));
select test.ok('manager creates task T2 (o1, E2)', format($$insert into public.tasks (object_id, title, assignee_id) values (%L, 'Кладка стен', %L)$$, :'o1', :E2));
select test.ok('manager creates task T3 (o2, E2)', format($$insert into public.tasks (object_id, title, assignee_id) values (%L, 'Электрика', %L)$$, :'o2', :E2));
select test.fails('manager cannot insert task with status', format($$insert into public.tasks (object_id, title, assignee_id, status) values (%L, 'x', %L, 'accepted')$$, :'o1', :E1));
select test.fails('manager cannot set author_id', format($$insert into public.tasks (object_id, title, assignee_id, author_id) values (%L, 'x', %L, %L)$$, :'o1', :E1, :E1));
select test.fails('assignee must be an executor', format($$insert into public.tasks (object_id, title, assignee_id) values (%L, 'x', %L)$$, :'o1', :M2));
select test.fails('object must exist', format($$insert into public.tasks (object_id, title, assignee_id) values (gen_random_uuid(), 'x', %L)$$, :E1));
select test.fails('empty title rejected', format($$insert into public.tasks (object_id, title, assignee_id) values (%L, '   ', %L)$$, :'o1', :E1));
reset role;

select id as t1 from public.tasks where title = 'Залить фундамент' \gset
select id as t2 from public.tasks where title = 'Кладка стен' \gset
select id as t3 from public.tasks where title = 'Электрика' \gset

select test.eq('T1 created with status new', format($$select status::text from public.tasks where id=%L$$, :'t1'), 'new');
select test.eq('T1 author is the manager',   format($$select author_id::text from public.tasks where id=%L$$, :'t1'), 'aaaaaaaa-0000-0000-0000-00000000000a');
select test.eq('creation history row written', format($$select coalesce(from_status::text,'—')||'->'||to_status from public.task_status_history where task_id=%L$$, :'t1'), '—->new');

\echo '--- manager: status rules'
set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :M)::text, false);
select test.fails('manager cannot UPDATE status column directly', format($$update public.tasks set status='accepted' where id=%L$$, :'t1'));
select test.fails('manager cannot take task into work (executor transition)', format($$select public.change_task_status(%L, 'in_progress')$$, :'t1'));
select test.fails('manager cannot accept a "new" task', format($$select public.change_task_status(%L, 'accepted')$$, :'t1'));
select test.fails('manager cannot insert history', format($$insert into public.task_status_history (task_id, to_status, changed_by) values (%L, 'accepted', %L)$$, :'t1', :M));
select test.rows('manager can edit task title', format($$update public.tasks set title='Залить фундамент (секция А)' where id=%L$$, :'t1'), 1);
select test.cnt('manager sees all 3 tasks', 'select * from public.tasks', 3);
select test.cnt('manager sees all 3 objects', 'select * from public.objects', 3);
reset role;

-- ============================ executor E1 ======================
\echo '--- executor E1: visibility'
set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :E1)::text, false);
select test.cnt('E1 sees only own task', 'select * from public.tasks', 1);
select test.cnt('E1 does not see T2 (E2 task)', format($$select * from public.tasks where id=%L$$, :'t2'), 0);
select test.cnt('E1 sees only object with own task', 'select * from public.objects', 1);
select test.cnt('E1 does not see history of T2', format($$select * from public.task_status_history where task_id=%L$$, :'t2'), 0);
select test.cnt('E1 sees history of own T1', format($$select * from public.task_status_history where task_id=%L$$, :'t1'), 1);
select test.cnt('E1 sees profiles: self + 2 managers only', 'select * from public.profiles', 3);
select test.cnt('E1 does not see E2 profile', format($$select * from public.profiles where id=%L$$, :E2), 0);

\echo '--- executor E1: writes'
select test.fails('E1 cannot create object', $$insert into public.objects (name, address) values ('x','y')$$);
select test.fails('E1 cannot create task', format($$insert into public.tasks (object_id, title, assignee_id) values (%L, 'x', %L)$$, :'o1', :E1));
select test.rows('E1 cannot edit own task fields (0 rows)', format($$update public.tasks set title='hack' where id=%L$$, :'t1'), 0);
select test.rows('E1 cannot edit T2 (0 rows)', format($$update public.tasks set title='hack' where id=%L$$, :'t2'), 0);
select test.rows('E1 cannot reassign T2 to self (0 rows)', format($$update public.tasks set assignee_id=%L where id=%L$$, :E1, :'t2'), 0);
select test.fails('E1 cannot UPDATE status directly', format($$update public.tasks set status='review' where id=%L$$, :'t1'));
select test.fails('E1 cannot delete task', format($$select public.delete_task(%L)$$, :'t1'));
select test.fails('E1 cannot delete object', format($$select public.delete_object(%L)$$, :'o1'));
select test.fails('E1 cannot change role in profile', format($$update public.profiles set role='manager' where id=%L$$, :E1));
select test.fails('E1 cannot insert profile', format($$insert into public.profiles (id, full_name, role) values (gen_random_uuid(), 'x', 'manager')$$));
select test.fails('E1 cannot edit transitions table', $$insert into public.task_status_transitions values ('new','accepted','executor',false)$$);

\echo '--- executor E1: transitions'
select test.fails('E1: new -> review is forbidden', format($$select public.change_task_status(%L, 'review')$$, :'t1'));
select test.fails('E1: new -> accepted is forbidden', format($$select public.change_task_status(%L, 'accepted')$$, :'t1'));
select test.fails('E1 cannot move T2 (not assignee)', format($$select public.change_task_status(%L, 'in_progress')$$, :'t2'));
select test.ok('E1: new -> in_progress', format($$select public.change_task_status(%L, 'in_progress')$$, :'t1'));
select test.fails('E1: in_progress -> in_progress (repeat) forbidden', format($$select public.change_task_status(%L, 'in_progress')$$, :'t1'));
select test.fails('E1: in_progress -> accepted forbidden', format($$select public.change_task_status(%L, 'accepted')$$, :'t1'));
select test.ok('E1: in_progress -> review', format($$select public.change_task_status(%L, 'review', 'Готово')$$, :'t1'));
select test.fails('E1 cannot accept own task', format($$select public.change_task_status(%L, 'accepted')$$, :'t1'));
select test.fails('E1 cannot return own task to rework', format($$select public.change_task_status(%L, 'rework', 'x')$$, :'t1'));

\echo '--- history is tamper-proof'
select test.fails('E1 cannot insert history', format($$insert into public.task_status_history (task_id, to_status, changed_by) values (%L, 'accepted', %L)$$, :'t1', :M));
select test.fails('E1 cannot update history', format($$update public.task_status_history set comment='x' where task_id=%L$$, :'t1'));
select test.fails('E1 cannot delete history', format($$delete from public.task_status_history where task_id=%L$$, :'t1'));
reset role;

-- ============================ manager review ===================
\echo '--- manager reviews'
set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :M2)::text, false);
select test.fails('rework without comment is rejected', format($$select public.change_task_status(%L, 'rework')$$, :'t1'));
select test.fails('rework with blank comment is rejected', format($$select public.change_task_status(%L, 'rework', '   ')$$, :'t1'));
select test.ok('second manager returns to rework with comment', format($$select public.change_task_status(%L, 'rework', 'Трещины в углу')$$, :'t1'));
select test.fails('manager cannot update history', format($$update public.task_status_history set comment='x' where task_id=%L$$, :'t1'));
select test.fails('manager cannot delete history', format($$delete from public.task_status_history where task_id=%L$$, :'t1'));
reset role;

set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :E1)::text, false);
select test.fails('E1: rework -> review forbidden', format($$select public.change_task_status(%L, 'review')$$, :'t1'));
select test.ok('E1: rework -> in_progress', format($$select public.change_task_status(%L, 'in_progress')$$, :'t1'));
select test.ok('E1: in_progress -> review again', format($$select public.change_task_status(%L, 'review')$$, :'t1'));
reset role;

set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :M)::text, false);
select test.ok('manager accepts', format($$select public.change_task_status(%L, 'accepted')$$, :'t1'));
select test.fails('accepted is final', format($$select public.change_task_status(%L, 'rework', 'again')$$, :'t1'));
reset role;

select test.eq('full history of T1', format($$select string_agg(coalesce(from_status::text,'—')||'->'||to_status, ' | ' order by id) from public.task_status_history where task_id=%L$$, :'t1'),
  '—->new | new->in_progress | in_progress->review | review->rework | rework->in_progress | in_progress->review | review->accepted');
select test.eq('rework comment saved', format($$select comment from public.task_status_history where task_id=%L and to_status='rework'$$, :'t1'), 'Трещины в углу');
select test.eq('history author recorded (rework by M2)', format($$select changed_by::text from public.task_status_history where task_id=%L and to_status='rework'$$, :'t1'), 'aaaaaaaa-0000-0000-0000-00000000000b');

-- ============================ reassignment / deletion ==========
\echo '--- reassignment & soft delete'
set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :E2)::text, false);
select test.ok('E2 takes T3 into work', format($$select public.change_task_status(%L, 'in_progress')$$, :'t3'));
reset role;
set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :M)::text, false);
select test.rows('manager reassigns T3 (in progress) to E1', format($$update public.tasks set assignee_id=%L where id=%L$$, :E1, :'t3'), 1);
reset role;
set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :E2)::text, false);
select test.cnt('E2 no longer sees T3', format($$select * from public.tasks where id=%L$$, :'t3'), 0);
select test.cnt('E2 no longer sees T3 history', format($$select * from public.task_status_history where task_id=%L$$, :'t3'), 0);
select test.cnt('E2 sees only o1 now', 'select * from public.objects', 1);
select test.fails('E2 can no longer move T3', format($$select public.change_task_status(%L, 'review')$$, :'t3'));
reset role;
set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :E1)::text, false);
select test.cnt('E1 now sees T1 and T3', 'select * from public.tasks', 2);
select test.cnt('E1 now sees o1 and o2', 'select * from public.objects', 2);
select test.cnt('E1 now also sees E2 (in T3 history)', 'select * from public.profiles', 4);
select test.ok('new assignee E1 continues T3: in_progress -> review', format($$select public.change_task_status(%L, 'review')$$, :'t3'));
reset role;

set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :M)::text, false);
select test.ok('manager soft-deletes T2', format($$select public.delete_task(%L)$$, :'t2'));
select test.cnt('deleted task hidden', format($$select * from public.tasks where id=%L$$, :'t2'), 0);
select test.cnt('history of deleted task hidden', format($$select * from public.task_status_history where task_id=%L$$, :'t2'), 0);
select test.fails('cannot move deleted task', format($$select public.change_task_status(%L, 'in_progress')$$, :'t2'));
select test.ok('manager soft-deletes object 2 (with T3)', format($$select public.delete_object(%L)$$, :'o2'));
select test.cnt('object 2 hidden', format($$select * from public.objects where id=%L$$, :'o2'), 0);
select test.cnt('T3 hidden with its object', format($$select * from public.tasks where id=%L$$, :'t3'), 0);
select test.fails('cannot create task in deleted object', format($$insert into public.tasks (object_id, title, assignee_id) values (%L, 'x', %L)$$, :'o2', :E1));
select test.rows('cannot un-delete via update (column not writable)', format($$update public.objects set name = 'x' where id=%L$$, :'o2'), 0);
select test.fails('cannot write deleted_at directly', format($$update public.objects set deleted_at = null where id=%L$$, :'o2'));
reset role;
select test.cnt('history of deleted task still stored in DB', format($$select * from public.task_status_history where task_id=%L$$, :'t2'), 1);

\echo '--- service_role cannot tamper with history either'
set role service_role;
select test.fails('service_role cannot update history', $$update public.task_status_history set comment = 'x'$$);
select test.fails('service_role cannot delete history', $$delete from public.task_status_history$$);
reset role;
