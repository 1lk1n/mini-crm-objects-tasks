-- =============================================================================
-- Mini-CRM "Объекты и задачи": schema, access rules (RLS), status workflow.
--
-- Security model in short:
--   * Every table has RLS enabled; the `anon` role has no privileges at all.
--   * Clients get only the column privileges they need. Columns such as
--     tasks.status, tasks.author_id, *.deleted_at are NOT writable via the API.
--   * Status changes happen only through public.change_task_status(), which
--     checks the transition table + the caller's role/assignment, and writes
--     the history row itself. History is append-only for everyone.
--   * Deletes are soft (deleted_at) and go through RPCs, so the status history
--     of a deleted task is never lost.
--   * Internal helpers live in the `private` schema, which is not exposed by
--     the Data API (PostgREST), so they cannot be called directly.
-- =============================================================================

create schema if not exists private;
grant usage on schema private to authenticated;

-- -----------------------------------------------------------------------------
-- 1. Types
-- -----------------------------------------------------------------------------

create type public.user_role as enum ('manager', 'executor');

create type public.task_status as enum (
  'new',          -- Новая
  'in_progress',  -- В работе
  'review',       -- На проверке
  'accepted',     -- Принята
  'rework'        -- На доработке
);

-- -----------------------------------------------------------------------------
-- 2. Tables
-- -----------------------------------------------------------------------------

-- One profile per auth user. The role lives here (not in user_metadata, which a
-- user can edit about themselves) and cannot be changed through the API.
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null check (length(trim(full_name)) between 1 and 200),
  role       public.user_role not null default 'executor',
  created_at timestamptz not null default now()
);

-- Construction site.
create table public.objects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) between 1 and 200),
  address    text not null check (length(trim(address)) between 1 and 500),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  object_id   uuid not null references public.objects (id),
  title       text not null check (length(trim(title)) between 1 and 200),
  description text not null default '' check (length(description) <= 5000),
  assignee_id uuid not null references public.profiles (id),
  status      public.task_status not null default 'new',
  author_id   uuid not null default auth.uid() references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index tasks_object_id_idx   on public.tasks (object_id)   where deleted_at is null;
create index tasks_assignee_id_idx on public.tasks (assignee_id) where deleted_at is null;

-- Allowed status transitions: the single source of truth, used both by the
-- database function below and by the UI to decide which buttons to show.
-- actor = 'executor' means "the executor assigned to the task".
create table public.task_status_transitions (
  from_status      public.task_status not null,
  to_status        public.task_status not null,
  actor            public.user_role   not null,
  comment_required boolean            not null default false,
  primary key (from_status, to_status)
);

insert into public.task_status_transitions (from_status, to_status, actor, comment_required) values
  ('new',         'in_progress', 'executor', false),
  ('in_progress', 'review',      'executor', false),
  ('review',      'accepted',    'manager',  false),
  ('review',      'rework',      'manager',  true),
  ('rework',      'in_progress', 'executor', false);
-- ("— -> new" happens on task creation and is recorded by a trigger.)

-- Status history: append-only.
create table public.task_status_history (
  id          bigint generated always as identity primary key,
  task_id     uuid not null references public.tasks (id),
  from_status public.task_status,             -- null = task created
  to_status   public.task_status not null,
  changed_by  uuid not null references public.profiles (id),
  changed_at  timestamptz not null default now(),
  comment     text check (comment is null or length(comment) <= 2000)
);

create index task_status_history_task_id_idx on public.task_status_history (task_id, changed_at);

-- -----------------------------------------------------------------------------
-- 3. Helper functions (private schema: not callable through the API)
-- -----------------------------------------------------------------------------

-- Role of the current user, or null if not logged in / no profile.
create function private.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

create function private.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_user_role() = 'manager', false);
$$;

revoke all on function private.current_user_role() from public;
revoke all on function private.is_manager()        from public;
grant execute on function private.current_user_role() to authenticated;
grant execute on function private.is_manager()        to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Triggers
-- -----------------------------------------------------------------------------

-- 4.1 New auth user -> profile. The role is read from app_metadata, which only
-- an admin (service_role) can set; anything else defaults to 'executor'.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), new.email, 'Без имени'),
    case when new.raw_app_meta_data ->> 'role' = 'manager'
         then 'manager'::public.user_role
         else 'executor'::public.user_role
    end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- 4.2 Tasks: server-controlled fields + integrity checks.
create function private.tasks_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- A task always starts as "new"; author and timestamps are set by the server.
    new.status     := 'new';
    new.author_id  := coalesce(auth.uid(), new.author_id);
    new.created_at := now();
    new.deleted_at := null;
  end if;
  new.updated_at := now();

  if tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id then
    if not exists (select 1 from public.profiles
                    where id = new.assignee_id and role = 'executor') then
      raise exception 'Исполнителем можно назначить только пользователя с ролью «исполнитель»'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'INSERT' or new.object_id is distinct from old.object_id then
    if not exists (select 1 from public.objects
                    where id = new.object_id and deleted_at is null) then
      raise exception 'Объект не найден' using errcode = '23503';
    end if;
  end if;

  return new;
end;
$$;

create trigger tasks_before_write
  before insert or update on public.tasks
  for each row execute function private.tasks_before_write();

-- 4.3 Task created -> first history row ("— -> Новая").
create function private.tasks_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.task_status_history (task_id, from_status, to_status, changed_by)
  values (new.id, null, new.status, new.author_id);
  return null;
end;
$$;

create trigger tasks_after_insert
  after insert on public.tasks
  for each row execute function private.tasks_after_insert();

-- 4.4 History is append-only: no UPDATE / DELETE, for any role (incl. service_role).
create function private.forbid_history_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'История статусов неизменяема' using errcode = '42501';
end;
$$;

create trigger task_status_history_append_only
  before update or delete on public.task_status_history
  for each row execute function private.forbid_history_change();

-- 4.5 Objects: creator is always the current user.
create function private.objects_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_by := coalesce(auth.uid(), new.created_by);
  new.created_at := now();
  new.deleted_at := null;
  return new;
end;
$$;

create trigger objects_before_insert
  before insert on public.objects
  for each row execute function private.objects_before_insert();

revoke all on function private.handle_new_user()       from public;
revoke all on function private.tasks_before_write()    from public;
revoke all on function private.tasks_after_insert()    from public;
revoke all on function private.forbid_history_change() from public;
revoke all on function private.objects_before_insert() from public;

-- -----------------------------------------------------------------------------
-- 5. Privileges (what the API roles may touch at all)
--    RLS policies below then decide WHICH ROWS.
-- -----------------------------------------------------------------------------

revoke all on public.profiles, public.objects, public.tasks,
              public.task_status_transitions, public.task_status_history
  from anon, authenticated;

grant select on public.profiles, public.objects, public.tasks,
                public.task_status_transitions, public.task_status_history
  to authenticated;

-- Only business fields are writable. Not writable: status, author, dates,
-- deleted_at. No DELETE privilege: deletion goes through the RPCs below.
grant insert (name, address), update (name, address) on public.objects to authenticated;
grant insert (object_id, title, description, assignee_id),
      update (object_id, title, description, assignee_id) on public.tasks to authenticated;

-- profiles, task_status_transitions, task_status_history: read-only for clients.

-- -----------------------------------------------------------------------------
-- 6. Row Level Security
-- -----------------------------------------------------------------------------

alter table public.profiles                enable row level security;
alter table public.objects                 enable row level security;
alter table public.tasks                   enable row level security;
alter table public.task_status_transitions enable row level security;
alter table public.task_status_history     enable row level security;

-- profiles: least privilege. A manager sees everyone (to assign tasks).
-- An executor sees only what their own task cards need: themselves, the
-- managers (task authors/reviewers) and anyone who appears in the history of
-- a task they can see (e.g. a previous assignee). The history subquery is
-- itself filtered by RLS, so it only covers the executor's own tasks.
create policy "profiles: self, managers and people on own tasks"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or role = 'manager'
    or (select private.is_manager())
    or exists (
      select 1 from public.task_status_history h
       where h.changed_by = profiles.id
    )
  );

-- transitions: reference data, read-only.
create policy "transitions: authenticated can read"
  on public.task_status_transitions for select to authenticated
  using (true);

-- tasks: manager sees everything, executor sees only tasks assigned to them.
create policy "tasks: manager reads all, executor reads own"
  on public.tasks for select to authenticated
  using (
    deleted_at is null
    and (
      (select private.is_manager())
      or assignee_id = (select auth.uid())
    )
  );

create policy "tasks: manager creates"
  on public.tasks for insert to authenticated
  with check ((select private.is_manager()));

create policy "tasks: manager edits"
  on public.tasks for update to authenticated
  using ((select private.is_manager()) and deleted_at is null)
  with check ((select private.is_manager()));
-- No UPDATE policy for executors at all: they change status via the RPC only.

-- objects: manager sees all; executor sees objects where they have a task.
-- (The subquery runs under the tasks policy above, i.e. only own tasks.)
create policy "objects: manager reads all, executor reads where has a task"
  on public.objects for select to authenticated
  using (
    deleted_at is null
    and (
      (select private.is_manager())
      or exists (
        select 1 from public.tasks t
         where t.object_id = objects.id
           and t.assignee_id = (select auth.uid())
           and t.deleted_at is null
      )
    )
  );

create policy "objects: manager creates"
  on public.objects for insert to authenticated
  with check ((select private.is_manager()));

create policy "objects: manager edits"
  on public.objects for update to authenticated
  using ((select private.is_manager()) and deleted_at is null)
  with check ((select private.is_manager()));

-- history: visible to whoever can see the task (the subquery is itself
-- filtered by the tasks policy). No INSERT/UPDATE/DELETE policies or grants.
create policy "history: visible with the task"
  on public.task_status_history for select to authenticated
  using (
    exists (select 1 from public.tasks t where t.id = task_status_history.task_id)
  );

-- -----------------------------------------------------------------------------
-- 7. API functions (RPC)
--    SECURITY DEFINER = they run with the table owner's rights and bypass RLS,
--    so every check is done explicitly inside.
-- -----------------------------------------------------------------------------

-- Change a task's status. The only way a status can change.
create function public.change_task_status(
  p_task_id    uuid,
  p_new_status public.task_status,
  p_comment    text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_role    public.user_role;
  v_task    public.tasks%rowtype;
  v_rule    public.task_status_transitions%rowtype;
  v_comment text := nullif(trim(p_comment), '');
begin
  if v_uid is null then
    raise exception 'Требуется вход в систему' using errcode = '42501';
  end if;

  v_role := private.current_user_role();
  if v_role is null then
    raise exception 'Профиль пользователя не найден' using errcode = '42501';
  end if;

  -- Lock the row: two concurrent requests cannot both pass the check below.
  select * into v_task
    from public.tasks
   where id = p_task_id and deleted_at is null
     for update;

  -- An executor gets the same answer for "doesn't exist" and "not yours",
  -- so the function cannot be used to probe other people's tasks.
  if not found or (v_role = 'executor' and v_task.assignee_id <> v_uid) then
    raise exception 'Задача не найдена' using errcode = 'P0002';
  end if;

  select * into v_rule
    from public.task_status_transitions
   where from_status = v_task.status and to_status = p_new_status;

  if not found or v_rule.actor <> v_role then
    raise exception 'Переход из статуса «%» в «%» недоступен для вашей роли',
      v_task.status, p_new_status
      using errcode = '42501';
  end if;

  if v_rule.comment_required and v_comment is null then
    raise exception 'Для этого перехода нужен комментарий' using errcode = '23514';
  end if;

  update public.tasks set status = p_new_status where id = p_task_id;

  insert into public.task_status_history (task_id, from_status, to_status, changed_by, comment)
  values (p_task_id, v_task.status, p_new_status, v_uid, v_comment);
end;
$$;

-- Soft-delete a task (manager only). History is kept.
create function public.delete_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_manager() then
    raise exception 'Удалять задачи может только постановщик' using errcode = '42501';
  end if;

  update public.tasks set deleted_at = now()
   where id = p_task_id and deleted_at is null;

  if not found then
    raise exception 'Задача не найдена' using errcode = 'P0002';
  end if;
end;
$$;

-- Soft-delete an object together with its tasks (manager only).
create function public.delete_object(p_object_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_manager() then
    raise exception 'Удалять объекты может только постановщик' using errcode = '42501';
  end if;

  update public.objects set deleted_at = now()
   where id = p_object_id and deleted_at is null;

  if not found then
    raise exception 'Объект не найден' using errcode = 'P0002';
  end if;

  update public.tasks set deleted_at = now()
   where object_id = p_object_id and deleted_at is null;
end;
$$;

-- Functions are executable by PUBLIC by default: restrict to logged-in users.
revoke all on function public.change_task_status(uuid, public.task_status, text) from public, anon;
revoke all on function public.delete_task(uuid)                                   from public, anon;
revoke all on function public.delete_object(uuid)                                 from public, anon;
grant execute on function public.change_task_status(uuid, public.task_status, text) to authenticated;
grant execute on function public.delete_task(uuid)                                   to authenticated;
grant execute on function public.delete_object(uuid)                                 to authenticated;
