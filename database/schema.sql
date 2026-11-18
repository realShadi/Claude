-- Sadran shift scheduler: database schema for Supabase (Postgres 15+).
--
-- Safe to run more than once. Apply it in the Supabase SQL Editor, or through
-- the Management API (POST /v1/projects/{ref}/database/query).
--
-- Design
-- * All tables live in the private schema "sadran", which the Data API does not
--   expose. The website never reads a table directly.
-- * The website calls the public functions below (sadran_*) with the project's
--   publishable key. Each function checks a session token before it reads or
--   writes anything, and returns only what that person may see.
-- * Employees sign in with their name and personal number; the manager signs in
--   with the manager code, which is stored only as a bcrypt hash. Repeated wrong
--   attempts are blocked for 15 minutes.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists sadran;
revoke all on schema sadran from public;
revoke all on schema sadran from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row: the store's roles, shifts, staffing and rules, plus the manager code.
create table if not exists sadran.settings (
  id smallint primary key default 1 check (id = 1),
  config jsonb not null,
  manager_code_hash text,
  updated_at timestamptz not null default now()
);

insert into sadran.settings (id, config) values (1, $json$
{
  "store": { "name": "החנות שלי" },
  "roles": [
    { "id": "r_lead",  "name": "אחראי/ת משמרת", "color": 1 },
    { "id": "r_cash",  "name": "קופאי/ת",       "color": 4 },
    { "id": "r_stock", "name": "מחסנאי/ת",      "color": 3 },
    { "id": "r_recv",  "name": "קבלת סחורה",    "color": 5 }
  ],
  "shifts": [
    { "id": "s_am", "name": "בוקר", "start": "07:00", "end": "15:00" },
    { "id": "s_pm", "name": "ערב",  "start": "15:00", "end": "23:00" }
  ],
  "req": {
    "s_am": { "r_lead": 1, "r_cash": 2, "r_recv": 1 },
    "s_pm": { "r_lead": 1, "r_cash": 2, "r_stock": 1 }
  },
  "closed": { "5|s_pm": true, "6|s_am": true, "6|s_pm": true },
  "rules": { "minRest": 10 }
}
$json$::jsonb)
on conflict (id) do nothing;

create table if not exists sadran.employees (
  id text primary key check (id ~ '^e_[a-z0-9_]{1,40}$'),
  name text not null check (length(btrim(name)) between 1 and 80),
  number text not null check (number ~ '^[0-9]{3,12}$'),
  roles jsonb not null default '[]'::jsonb check (jsonb_typeof(roles) = 'array'),
  max_shifts smallint not null default 5 check (max_shifts between 1 and 7),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- deferred, so an import can swap two people's numbers in one go
  constraint employees_number_key unique (number) deferrable initially deferred
);

-- One row per employee per week. The week is the date of its Sunday.
create table if not exists sadran.availability (
  week date not null check (extract(dow from week) = 0),
  employee_id text not null references sadran.employees (id) on delete cascade,
  slots jsonb not null default '{}'::jsonb check (jsonb_typeof(slots) = 'object'),
  note text not null default '' check (length(note) <= 1000),
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (week, employee_id)
);

-- The roster for one week: the working draft, per-shift changes to the staffing,
-- and the version that was last published to the team.
create table if not exists sadran.weeks (
  week date primary key check (extract(dow from week) = 0),
  slots jsonb not null default '{}'::jsonb,
  overrides jsonb not null default '{}'::jsonb,
  published jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists sadran.sessions (
  token_hash text primary key,
  role text not null check (role in ('manager', 'employee')),
  employee_id text references sadran.employees (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check ((role = 'employee') = (employee_id is not null))
);

create table if not exists sadran.login_failures (
  id bigint generated always as identity primary key,
  key text not null,
  at timestamptz not null default now()
);
create index if not exists login_failures_key_at on sadran.login_failures (key, at);

-- Defence in depth: should the schema ever be exposed, nothing is readable.
alter table sadran.settings enable row level security;
alter table sadran.employees enable row level security;
alter table sadran.availability enable row level security;
alter table sadran.weeks enable row level security;
alter table sadran.sessions enable row level security;
alter table sadran.login_failures enable row level security;

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable from the website)
-- ---------------------------------------------------------------------------

create or replace function sadran.norm_name(t text) returns text
language sql immutable set search_path = '' as $$
  select lower(regexp_replace(btrim(coalesce(t, '')), '\s+', ' ', 'g'))
$$;

create or replace function sadran.norm_number(t text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(coalesce(t, ''), '[\s().+-]', '', 'g')
$$;

create or replace function sadran.hash_token(t text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(coalesce(t, ''), 'sha256'), 'hex')
$$;

create or replace function sadran.ms(t timestamptz) returns bigint
language sql immutable set search_path = '' as $$
  select case when t is null then null else floor(extract(epoch from t) * 1000)::bigint end
$$;

create or replace function sadran.new_session(p_role text, p_employee text) returns text
language plpgsql volatile set search_path = '' as $$
declare
  tok text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  delete from sadran.sessions where expires_at < now();
  insert into sadran.sessions (token_hash, role, employee_id, expires_at)
  values (sadran.hash_token(tok), p_role, p_employee, now() + interval '30 days');
  return tok;
end $$;

-- The session behind a token; raises 'auth' when it is missing or expired.
create or replace function sadran.auth(p_token text, p_need text default null) returns sadran.sessions
language plpgsql volatile set search_path = '' as $$
declare
  s sadran.sessions;
begin
  select * into s from sadran.sessions
   where token_hash = sadran.hash_token(p_token) and expires_at > now();
  if not found then
    raise exception 'auth';
  end if;
  if p_need is not null and s.role <> p_need then
    raise exception 'forbidden';
  end if;
  if s.expires_at < now() + interval '29 days' then
    update sadran.sessions set expires_at = now() + interval '30 days' where token_hash = s.token_hash;
  end if;
  return s;
end $$;

create or replace function sadran.too_many(p_key text, p_limit int) returns boolean
language sql stable set search_path = '' as $$
  select count(*) >= p_limit from sadran.login_failures
   where key = p_key and at > now() - interval '15 minutes'
$$;

create or replace function sadran.record_failure(p_key text) returns void
language sql volatile set search_path = '' as $$
  delete from sadran.login_failures where at < now() - interval '1 day';
  insert into sadran.login_failures (key) values (p_key);
$$;

create or replace function sadran.is_manager_code(p_number text) returns boolean
language sql stable set search_path = '' as $$
  select coalesce((select manager_code_hash is not null
                          and extensions.crypt(p_number, manager_code_hash) = manager_code_hash
                     from sadran.settings where id = 1), false)
$$;

revoke all on all functions in schema sadran from public;

-- ---------------------------------------------------------------------------
-- Functions the website calls
-- ---------------------------------------------------------------------------

-- Before sign-in: is the manager code set yet, and the store's name.
create or replace function public.sadran_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('configured', manager_code_hash is not null,
                            'store', config -> 'store' ->> 'name')
    from sadran.settings where id = 1
$$;

-- First run only: choose the manager code. Refused once a code exists.
create or replace function public.sadran_setup(p_code text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  c text := sadran.norm_number(p_code);
begin
  if c !~ '^[0-9]{6,12}$' then
    return jsonb_build_object('ok', false, 'error', 'code_format');
  end if;
  update sadran.settings
     set manager_code_hash = extensions.crypt(c, extensions.gen_salt('bf', 8)), updated_at = now()
   where id = 1 and manager_code_hash is null;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'already_configured');
  end if;
  return jsonb_build_object('ok', true, 'token', sadran.new_session('manager', null));
end $$;

create or replace function public.sadran_login_manager(p_code text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  c text := sadran.norm_number(p_code);
  h text;
begin
  select manager_code_hash into h from sadran.settings where id = 1;
  if h is null then
    return jsonb_build_object('ok', false, 'error', 'not_configured');
  end if;
  if sadran.too_many('manager', 10) then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;
  if c = '' or extensions.crypt(c, h) <> h then
    perform sadran.record_failure('manager');
    return jsonb_build_object('ok', false, 'error', 'bad_login');
  end if;
  return jsonb_build_object('ok', true, 'token', sadran.new_session('manager', null));
end $$;

create or replace function public.sadran_login_employee(p_name text, p_number text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  k text := 'employee:' || sadran.norm_name(p_name);
  eid text;
begin
  if sadran.too_many(k, 10) then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;
  select id into eid from sadran.employees
   where number = sadran.norm_number(p_number) and sadran.norm_name(name) = sadran.norm_name(p_name);
  if eid is null then
    perform sadran.record_failure(k);
    return jsonb_build_object('ok', false, 'error', 'bad_login');
  end if;
  return jsonb_build_object('ok', true, 'token', sadran.new_session('employee', eid));
end $$;

create or replace function public.sadran_logout(p_token text) returns void
language sql volatile security definer set search_path = '' as $$
  delete from sadran.sessions where token_hash = sadran.hash_token(p_token);
$$;

-- Everything the signed-in person may see. Employees get their own availability,
-- published rosters and their teammates' names only; the manager gets it all.
create or replace function public.sadran_load(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  s sadran.sessions;
  mgr boolean;
  since date := current_date - 56;
  cfg jsonb;
  emps jsonb;
  av jsonb;
  wk jsonb;
begin
  s := sadran.auth(p_token);
  mgr := s.role = 'manager';
  select config into cfg from sadran.settings where id = 1;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id,
           'name', e.name,
           'number', case when mgr then e.number else '' end,
           'roles', case when mgr or e.id = s.employee_id then e.roles else '[]'::jsonb end,
           'max', e.max_shifts) order by e.created_at, e.id), '[]'::jsonb)
    into emps from sadran.employees e;
  select coalesce(jsonb_object_agg(w.week, w.recs), '{}'::jsonb) into av from (
    select a.week::text as week,
           jsonb_object_agg(a.employee_id, jsonb_build_object(
             'slots', a.slots, 'note', a.note, 'submittedAt', sadran.ms(a.submitted_at))) as recs
      from sadran.availability a
     where a.week >= since and (mgr or a.employee_id = s.employee_id)
     group by a.week) w;
  select coalesce(jsonb_object_agg(w.week::text, jsonb_build_object(
           'slots', case when mgr then w.slots else '{}'::jsonb end,
           'over', case when mgr then w.overrides else '{}'::jsonb end,
           'published', w.published)), '{}'::jsonb)
    into wk from sadran.weeks w
   where w.week >= since and (mgr or w.published is not null);
  return jsonb_build_object('role', s.role, 'me', s.employee_id, 'config', cfg,
                            'employees', emps, 'avail', av, 'weeks', wk);
end $$;

create or replace function public.sadran_save_config(p_token text, p_config jsonb) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform sadran.auth(p_token, 'manager');
  if jsonb_typeof(p_config) is distinct from 'object'
     or jsonb_typeof(p_config -> 'roles') is distinct from 'array'
     or jsonb_typeof(p_config -> 'shifts') is distinct from 'array'
     or length(p_config::text) > 200000 then
    raise exception 'bad_input';
  end if;
  update sadran.settings set config = p_config, updated_at = now() where id = 1;
end $$;

create or replace function public.sadran_save_employee(p_token text, p_employee jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  eid text := p_employee ->> 'id';
  nm text := regexp_replace(btrim(coalesce(p_employee ->> 'name', '')), '\s+', ' ', 'g');
  n text := sadran.norm_number(p_employee ->> 'number');
  clash text;
begin
  perform sadran.auth(p_token, 'manager');
  if nm = '' then
    return jsonb_build_object('ok', false, 'error', 'name');
  end if;
  if n !~ '^[0-9]{3,12}$' then
    return jsonb_build_object('ok', false, 'error', 'number_format');
  end if;
  select name into clash from sadran.employees where number = n and id <> eid;
  if clash is not null then
    return jsonb_build_object('ok', false, 'error', 'number_taken', 'name', clash);
  end if;
  if sadran.is_manager_code(n) then
    return jsonb_build_object('ok', false, 'error', 'number_is_code');
  end if;
  insert into sadran.employees (id, name, number, roles, max_shifts)
  values (eid, nm, n, coalesce(p_employee -> 'roles', '[]'::jsonb),
          coalesce((p_employee ->> 'max')::smallint, 5))
  on conflict (id) do update
     set name = excluded.name, number = excluded.number, roles = excluded.roles,
         max_shifts = excluded.max_shifts, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.sadran_delete_employee(p_token text, p_id text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform sadran.auth(p_token, 'manager');
  delete from sadran.employees where id = p_id;
end $$;

-- Add or update many employees, and optionally remove some, in one step.
create or replace function public.sadran_import_employees(p_token text, p_upserts jsonb, p_deletes jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  item jsonb;
begin
  perform sadran.auth(p_token, 'manager');
  for item in select value from jsonb_array_elements(coalesce(p_upserts, '[]'::jsonb)) loop
    if btrim(coalesce(item ->> 'name', '')) = '' or sadran.norm_number(item ->> 'number') !~ '^[0-9]{3,12}$' then
      return jsonb_build_object('ok', false, 'error', 'bad_row', 'name', item ->> 'name');
    end if;
    if sadran.is_manager_code(sadran.norm_number(item ->> 'number')) then
      return jsonb_build_object('ok', false, 'error', 'number_is_code', 'name', item ->> 'name');
    end if;
  end loop;
  delete from sadran.employees
   where id in (select jsonb_array_elements_text(coalesce(p_deletes, '[]'::jsonb)));
  insert into sadran.employees (id, name, number, roles, max_shifts)
  select x.value ->> 'id',
         regexp_replace(btrim(x.value ->> 'name'), '\s+', ' ', 'g'),
         sadran.norm_number(x.value ->> 'number'),
         coalesce(x.value -> 'roles', '[]'::jsonb),
         coalesce((x.value ->> 'max')::smallint, 5)
    from jsonb_array_elements(coalesce(p_upserts, '[]'::jsonb)) as x
  on conflict (id) do update
     set name = excluded.name, number = excluded.number, roles = excluded.roles,
         max_shifts = excluded.max_shifts, updated_at = now();
  set constraints sadran.employees_number_key immediate;
  return jsonb_build_object('ok', true);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'number_taken');
end $$;

-- An employee saves their own availability; the manager may save anyone's.
create or replace function public.sadran_save_availability(
  p_token text, p_week date, p_employee text, p_slots jsonb, p_note text, p_submitted boolean
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  s sadran.sessions;
  at timestamptz;
begin
  s := sadran.auth(p_token);
  if s.role = 'employee' and s.employee_id is distinct from p_employee then
    raise exception 'forbidden';
  end if;
  if jsonb_typeof(p_slots) is distinct from 'object' then
    raise exception 'bad_input';
  end if;
  insert into sadran.availability (week, employee_id, slots, note, submitted_at, updated_at)
  values (p_week, p_employee, p_slots, left(coalesce(p_note, ''), 1000),
          case when p_submitted then now() end, now())
  on conflict (week, employee_id) do update
     set slots = excluded.slots,
         note = excluded.note,
         submitted_at = case when p_submitted then coalesce(sadran.availability.submitted_at, now())
                             else sadran.availability.submitted_at end,
         updated_at = now()
  returning submitted_at into at;
  return jsonb_build_object('submittedAt', sadran.ms(at));
end $$;

create or replace function public.sadran_save_week(
  p_token text, p_week date, p_slots jsonb, p_over jsonb, p_published jsonb
) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform sadran.auth(p_token, 'manager');
  insert into sadran.weeks (week, slots, overrides, published, updated_at)
  values (p_week, coalesce(p_slots, '{}'::jsonb), coalesce(p_over, '{}'::jsonb),
          case when jsonb_typeof(p_published) = 'object' then p_published end, now())
  on conflict (week) do update
     set slots = excluded.slots, overrides = excluded.overrides,
         published = excluded.published, updated_at = now();
end $$;

-- Change the manager code. Other manager sign-ins are ended.
create or replace function public.sadran_set_code(p_token text, p_code text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  s sadran.sessions;
  c text := sadran.norm_number(p_code);
begin
  s := sadran.auth(p_token, 'manager');
  if c !~ '^[0-9]{6,12}$' then
    return jsonb_build_object('ok', false, 'error', 'code_format');
  end if;
  if exists (select 1 from sadran.employees where number = c) then
    return jsonb_build_object('ok', false, 'error', 'code_is_number');
  end if;
  update sadran.settings
     set manager_code_hash = extensions.crypt(c, extensions.gen_salt('bf', 8)), updated_at = now()
   where id = 1;
  delete from sadran.sessions where role = 'manager' and token_hash <> s.token_hash;
  return jsonb_build_object('ok', true);
end $$;

-- Only the functions above are callable from the website.
do $$
declare
  f text;
begin
  for f in
    select p.oid::regprocedure::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'sadran\_%'
  loop
    execute format('revoke all on function %s from public, authenticated', f);
    execute format('grant execute on function %s to anon', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
