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
--   with the manager code. Both secrets are stored only as bcrypt hashes, so
--   nobody, the manager included, can read them back. Repeated wrong attempts
--   are blocked for 15 minutes.
-- * Every consent (terms of use, and any optional one) is recorded with its
--   text version, time and the screen it was given on.

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

-- The store logo, kept apart from the settings so it is downloaded only when it changes.
alter table sadran.settings add column if not exists logo text;
alter table sadran.settings add column if not exists logo_updated_at timestamptz;

create table if not exists sadran.employees (
  id text primary key check (id ~ '^e_[a-z0-9_]{1,40}$'),
  name text not null check (length(btrim(name)) between 1 and 80),
  number_hash text not null,   -- bcrypt of the personal number (4 to 12 digits); the number itself is never stored
  roles jsonb not null default '[]'::jsonb check (jsonb_typeof(roles) = 'array'),
  max_shifts smallint not null default 5 check (max_shifts between 1 and 99),
  double_ok boolean not null default false,   -- may be given two shifts on the same day
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upgrade: the weekly limit used to stop at 7 (one shift a day). It now goes up to every shift in
-- the week, and a person can be marked as fine with two shifts on the same day.
alter table sadran.employees drop constraint if exists employees_max_shifts_check;
alter table sadran.employees add constraint employees_max_shifts_check check (max_shifts between 1 and 99);
alter table sadran.employees add column if not exists double_ok boolean not null default false;

-- Upgrade from the first version, which kept the personal number readable.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'sadran' and table_name = 'employees' and column_name = 'number') then
    alter table sadran.employees add column if not exists number_hash text;
    update sadran.employees set number_hash = extensions.crypt(number, extensions.gen_salt('bf', 8)) where number_hash is null;
    alter table sadran.employees alter column number_hash set not null;
    alter table sadran.employees drop column number;
  end if;
end $$;

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

-- Browsers that agreed to receive reminders. Only the big push services are accepted, so the
-- reminder function never posts to an address someone made up.
create table if not exists sadran.push_subscriptions (
  endpoint text primary key,
  role text not null check (role in ('manager', 'employee')),
  employee_id text references sadran.employees (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((role = 'employee') = (employee_id is not null))
);

-- Which deadline reminders went out, so each person gets one per week.
create table if not exists sadran.reminders (
  week date not null,
  kind text not null,      -- 'deadline' for an employee, 'summary' for the manager
  target text not null,    -- employee id, or 'manager'
  sent_at timestamptz not null default now(),
  primary key (week, kind, target)
);

-- Defence in depth: should the schema ever be exposed, nothing is readable.
-- Every consent given or withdrawn, one row each, never changed afterwards: who, which consent,
-- which version of its text, when, and on which screen. A person's latest row is their current choice.
-- The consent types and their texts are defined in site/content/legal/legal.json.
create table if not exists sadran.consents (
  id bigint generated always as identity primary key,
  subject text not null,                 -- 'manager', or the employee's id
  employee_id text references sadran.employees (id) on delete cascade,
  consent text not null check (consent ~ '^[a-z][a-z0-9_-]{0,39}$'),
  version text not null check (length(version) between 1 and 20),
  granted boolean not null,
  source text not null check (length(source) between 1 and 40),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  unsub_token text unique,               -- lets a link in a message withdraw this consent without signing in
  at timestamptz not null default now(),
  check ((subject = 'manager') = (employee_id is null)),
  check (employee_id is null or subject = employee_id)
);
create index if not exists consents_subject on sadran.consents (subject, consent, id desc);

alter table sadran.settings enable row level security;
alter table sadran.employees enable row level security;
alter table sadran.availability enable row level security;
alter table sadran.weeks enable row level security;
alter table sadran.sessions enable row level security;
alter table sadran.login_failures enable row level security;
alter table sadran.push_subscriptions enable row level security;
alter table sadran.reminders enable row level security;
alter table sadran.consents enable row level security;

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

-- One employee per name, so a name and a personal number always point at one person.
create unique index if not exists employees_name_key on sadran.employees (sadran.norm_name(name));

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

-- "22–28.11", isolated so it keeps its order inside Hebrew text.
create or replace function sadran.week_label(w date) returns text
language sql stable set search_path = '' as $$
  select chr(8294) || case when extract(month from w) = extract(month from w + 6)
                           then to_char(w, 'FMDD') || '–' || to_char(w + 6, 'FMDD.FMMM')
                           else to_char(w, 'FMDD.FMMM') || '–' || to_char(w + 6, 'FMDD.FMMM') end || chr(8297)
$$;

-- Employees with no submitted availability for a week.
create or replace function sadran.pending(p_week date) returns setof sadran.employees
language sql stable set search_path = '' as $$
  select e.* from sadran.employees e
   where not exists (select 1 from sadran.availability a
                      where a.week = p_week and a.employee_id = e.id and a.submitted_at is not null)
   order by e.name
$$;

-- Called by the sadran-remind function every few minutes. When the deadline for next week has
-- passed, returns one message per device of each employee who has not submitted, plus a summary
-- for the manager's devices. Each reminder is recorded as it is returned, so it goes out once.
create or replace function sadran.reminders_due() returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  cfg jsonb;
  dl jsonb;
  store text;
  loc timestamp;
  wk date;
  due timestamp;
  msgs jsonb := '[]'::jsonb;
  names text[];
  n int;
begin
  -- Housekeeping on every run: forget what is no longer needed.
  delete from sadran.reminders where sent_at < now() - interval '90 days';
  delete from sadran.login_failures where at < now() - interval '1 day';
  delete from sadran.sessions where expires_at < now();
  select config into cfg from sadran.settings where id = 1;
  dl := cfg -> 'rules' -> 'deadline';
  if dl is null or coalesce((dl ->> 'on')::boolean, false) is false then
    return msgs;
  end if;
  store := coalesce(nullif(cfg -> 'store' ->> 'name', ''), 'סדרן');
  loc := now() at time zone coalesce(nullif(dl ->> 'tz', ''), 'Asia/Jerusalem');
  wk := loc::date + (7 - extract(dow from loc)::int);   -- next Sunday
  due := (wk - 7 + coalesce((dl ->> 'day')::int, 4))::timestamp + coalesce(nullif(dl ->> 'time', ''), '18:00')::time;
  if loc < due then
    return msgs;
  end if;

  with claimed as (
    insert into sadran.reminders (week, kind, target)
    select wk, 'deadline', e.id from sadran.pending(wk) e
     where exists (select 1 from sadran.push_subscriptions p where p.employee_id = e.id)
    on conflict do nothing
    returning target
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth, 'title', store,
           'body', 'עוד לא הגשת זמינות לשבוע ' || sadran.week_label(wk) || ', והמועד להגשה עבר. אפשר להגיש עכשיו.',
           'url', './#my-availability', 'tag', 'deadline-' || wk)), '[]'::jsonb)
    into msgs
    from claimed c join sadran.push_subscriptions p on p.employee_id = c.target;

  select array_agg(e.name), count(*) into names, n from sadran.pending(wk) e;
  if n > 0 and exists (select 1 from sadran.push_subscriptions where role = 'manager') then
    insert into sadran.reminders (week, kind, target) values (wk, 'summary', 'manager') on conflict do nothing;
    if found then
      msgs := msgs || coalesce((
        select jsonb_agg(jsonb_build_object(
                 'endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth, 'title', store,
                 'body', case when n = 1 then 'עובד/ת אחד/ת עוד לא הגיש/ה זמינות לשבוע '
                              else n || ' עובדים עוד לא הגישו זמינות לשבוע ' end
                         || sadran.week_label(wk) || ': ' || array_to_string(names[1:5], ', ')
                         || case when n > 5 then ' ועוד ' || (n - 5) else '' end || '.',
                 'url', './#availability', 'tag', 'summary-' || wk))
          from sadran.push_subscriptions p where p.role = 'manager'), '[]'::jsonb);
    end if;
  end if;
  return msgs;
end $$;

-- The manager's "send a reminder now": messages for everyone who has not submitted for a week,
-- with who can and cannot be reached.
create or replace function sadran.reminders_manual(p_token text, p_week date) returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  store text;
begin
  perform sadran.auth(p_token, 'manager');
  select coalesce(nullif(config -> 'store' ->> 'name', ''), 'סדרן') into store from sadran.settings where id = 1;
  return jsonb_build_object(
    'pending', (select count(*) from sadran.pending(p_week)),
    'reached', (select coalesce(jsonb_agg(e.name), '[]'::jsonb) from sadran.pending(p_week) e
                 where exists (select 1 from sadran.push_subscriptions p where p.employee_id = e.id)),
    'unreachable', (select coalesce(jsonb_agg(e.name), '[]'::jsonb) from sadran.pending(p_week) e
                     where not exists (select 1 from sadran.push_subscriptions p where p.employee_id = e.id)),
    'messages', (select coalesce(jsonb_agg(jsonb_build_object(
                   'endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth, 'title', store,
                   'body', 'תזכורת: עוד לא הגשת זמינות לשבוע ' || sadran.week_label(p_week) || '. אפשר להגיש עכשיו.',
                   'url', './#my-availability', 'tag', 'manual-' || p_week)), '[]'::jsonb)
                   from sadran.pending(p_week) e join sadran.push_subscriptions p on p.employee_id = e.id));
end $$;

-- A push service said this subscription no longer exists.
create or replace function sadran.push_drop(p_endpoint text) returns void
language sql volatile set search_path = '' as $$
  delete from sadran.push_subscriptions where endpoint = p_endpoint;
$$;

-- A person's current consents: the latest record of each type.
create or replace function sadran.consents_of(p_subject text) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_object_agg(c.consent, jsonb_build_object(
           'version', c.version, 'granted', c.granted, 'at', sadran.ms(c.at), 'source', c.source, 'details', c.details)), '{}'::jsonb)
    from (select distinct on (consent) consent, version, granted, at, source, details
            from sadran.consents where subject = p_subject order by consent, id desc) c
$$;

-- For a future sender of messages that need consent (for example promotions): everyone whose
-- latest record for that consent is a grant, with what they gave and the token for their
-- unsubscribe link. Not callable from the website.
create or replace function sadran.consent_recipients(p_consent text)
returns table (subject text, details jsonb, unsub_token text, granted_at timestamptz)
language sql stable set search_path = '' as $$
  select c.subject, c.details, c.unsub_token, c.at
    from (select distinct on (subject) * from sadran.consents where consent = p_consent order by subject, id desc) c
   where c.granted
$$;

revoke all on all functions in schema sadran from public;

-- ---------------------------------------------------------------------------
-- Functions the website calls
-- ---------------------------------------------------------------------------

-- Before sign-in: is the manager code set yet, and the store's name.
create or replace function public.sadran_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('configured', manager_code_hash is not null,
                            'store', config -> 'store' ->> 'name',
                            'theme', config -> 'theme',
                            'logoVer', sadran.ms(logo_updated_at))
    from sadran.settings where id = 1
$$;

-- The store logo is public: it is shown on the sign-in screen.
create or replace function public.sadran_logo() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('logo', logo, 'logoVer', sadran.ms(logo_updated_at))
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
  n text := sadran.norm_number(p_number);
  eid text;
  h text;
begin
  if sadran.too_many(k, 10) then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;
  select id, number_hash into eid, h from sadran.employees
   where sadran.norm_name(name) = sadran.norm_name(p_name);
  if eid is null then
    -- The same work as a real check, so the response time does not reveal which names exist.
    perform extensions.crypt(n, extensions.gen_salt('bf', 8));
  end if;
  if eid is null or n = '' or extensions.crypt(n, h) <> h then
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
           'roles', case when mgr or e.id = s.employee_id then e.roles else '[]'::jsonb end,
           'max', e.max_shifts,
           'double', case when mgr or e.id = s.employee_id then e.double_ok else false end) order by e.created_at, e.id), '[]'::jsonb)
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
                            'employees', emps, 'avail', av, 'weeks', wk,
                            'logoVer', (select sadran.ms(logo_updated_at) from sadran.settings where id = 1),
                            'consents', sadran.consents_of(coalesce(s.employee_id, 'manager')));
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

-- Add or change one employee. The personal number is required for a new employee and optional
-- afterwards: leaving it out keeps the current one. A new number signs the employee out everywhere.
create or replace function public.sadran_save_employee(p_token text, p_employee jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  eid text := p_employee ->> 'id';
  nm text := regexp_replace(btrim(coalesce(p_employee ->> 'name', '')), '\s+', ' ', 'g');
  n text := sadran.norm_number(p_employee ->> 'number');
  is_new boolean;
begin
  perform sadran.auth(p_token, 'manager');
  if nm = '' then
    return jsonb_build_object('ok', false, 'error', 'name');
  end if;
  is_new := not exists (select 1 from sadran.employees where id = eid);
  if n = '' and is_new then
    return jsonb_build_object('ok', false, 'error', 'number_required');
  end if;
  if n <> '' and n !~ '^[0-9]{4,12}$' then
    return jsonb_build_object('ok', false, 'error', 'number_format');
  end if;
  if n <> '' and sadran.is_manager_code(n) then
    return jsonb_build_object('ok', false, 'error', 'number_is_code');
  end if;
  if exists (select 1 from sadran.employees where sadran.norm_name(name) = sadran.norm_name(nm) and id <> eid) then
    return jsonb_build_object('ok', false, 'error', 'name_taken');
  end if;
  insert into sadran.employees (id, name, number_hash, roles, max_shifts, double_ok)
  values (eid, nm, case when n <> '' then extensions.crypt(n, extensions.gen_salt('bf', 8)) else '' end,
          coalesce(p_employee -> 'roles', '[]'::jsonb),
          least(greatest(coalesce((p_employee ->> 'max')::int, 5), 1), 99),
          coalesce((p_employee ->> 'double')::boolean, false))
  on conflict (id) do update
     set name = excluded.name,
         number_hash = case when excluded.number_hash <> '' then excluded.number_hash else sadran.employees.number_hash end,
         roles = excluded.roles, max_shifts = excluded.max_shifts,
         -- a page loaded before this setting existed does not send it: keep what is stored
         double_ok = case when p_employee ? 'double' then excluded.double_ok else sadran.employees.double_ok end,
         updated_at = now();
  if n <> '' and not is_new then
    delete from sadran.sessions where employee_id = eid;
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.sadran_delete_employee(p_token text, p_id text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform sadran.auth(p_token, 'manager');
  delete from sadran.employees where id = p_id;
end $$;

-- Add or update many employees, and optionally remove some, in one step: all of it or none.
-- As above, a row for an existing employee may leave the personal number out.
create or replace function public.sadran_import_employees(p_token text, p_upserts jsonb, p_deletes jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  item jsonb;
  num text;
begin
  perform sadran.auth(p_token, 'manager');
  if jsonb_array_length(coalesce(p_upserts, '[]'::jsonb)) > 500 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;
  for item in select value from jsonb_array_elements(coalesce(p_upserts, '[]'::jsonb)) loop
    num := sadran.norm_number(item ->> 'number');
    if btrim(coalesce(item ->> 'name', '')) = '' or (num <> '' and num !~ '^[0-9]{4,12}$') then
      return jsonb_build_object('ok', false, 'error', 'bad_row', 'name', item ->> 'name');
    end if;
    if num = '' and not exists (select 1 from sadran.employees where id = item ->> 'id') then
      return jsonb_build_object('ok', false, 'error', 'number_required', 'name', item ->> 'name');
    end if;
    if num <> '' and sadran.is_manager_code(num) then
      return jsonb_build_object('ok', false, 'error', 'number_is_code', 'name', item ->> 'name');
    end if;
  end loop;
  delete from sadran.employees
   where id in (select jsonb_array_elements_text(coalesce(p_deletes, '[]'::jsonb)));
  -- A new number signs that employee out everywhere.
  delete from sadran.sessions
   where employee_id in (select x.value ->> 'id' from jsonb_array_elements(coalesce(p_upserts, '[]'::jsonb)) as x
                          where sadran.norm_number(x.value ->> 'number') <> '');
  insert into sadran.employees (id, name, number_hash, roles, max_shifts, double_ok)
  select x.value ->> 'id',
         regexp_replace(btrim(x.value ->> 'name'), '\s+', ' ', 'g'),
         case when sadran.norm_number(x.value ->> 'number') <> ''
              then extensions.crypt(sadran.norm_number(x.value ->> 'number'), extensions.gen_salt('bf', 8)) else '' end,
         coalesce(x.value -> 'roles', '[]'::jsonb),
         least(greatest(coalesce((x.value ->> 'max')::int, 5), 1), 99),
         coalesce((x.value ->> 'double')::boolean, (select e.double_ok from sadran.employees e where e.id = x.value ->> 'id'), false)
    from jsonb_array_elements(coalesce(p_upserts, '[]'::jsonb)) as x
  on conflict (id) do update
     set name = excluded.name,
         number_hash = case when excluded.number_hash <> '' then excluded.number_hash else sadran.employees.number_hash end,
         roles = excluded.roles, max_shifts = excluded.max_shifts, double_ok = excluded.double_ok, updated_at = now();
  return jsonb_build_object('ok', true);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'name_taken');
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
  if jsonb_typeof(p_slots) is distinct from 'object' or length(p_slots::text) > 20000 then
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
  if length(coalesce(p_slots, '{}'::jsonb)::text) + length(coalesce(p_over, '{}'::jsonb)::text)
     + length(coalesce(p_published, '{}'::jsonb)::text) > 600000 then
    raise exception 'bad_input';
  end if;
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
  if exists (select 1 from sadran.employees where number_hash = extensions.crypt(c, number_hash)) then
    return jsonb_build_object('ok', false, 'error', 'code_is_number');
  end if;
  update sadran.settings
     set manager_code_hash = extensions.crypt(c, extensions.gen_salt('bf', 8)), updated_at = now()
   where id = 1;
  delete from sadran.sessions where role = 'manager' and token_hash <> s.token_hash;
  return jsonb_build_object('ok', true);
end $$;

-- A PNG, JPEG or WebP data URL, already resized by the page; null removes the logo.
create or replace function public.sadran_save_logo(p_token text, p_logo text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  ver timestamptz := case when p_logo is null then null else now() end;
begin
  perform sadran.auth(p_token, 'manager');
  if p_logo is not null and (length(p_logo) > 300000
     or p_logo !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$') then
    return jsonb_build_object('ok', false, 'error', 'bad_image');
  end if;
  update sadran.settings set logo = p_logo, logo_updated_at = ver, updated_at = now() where id = 1;
  return jsonb_build_object('ok', true, 'logoVer', sadran.ms(ver));
end $$;

-- Remember this browser for reminders, for the signed-in employee or the manager.
create or replace function public.sadran_push_subscribe(p_token text, p_endpoint text, p_p256dh text, p_auth text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  s sadran.sessions;
begin
  s := sadran.auth(p_token);
  if coalesce(p_endpoint, '') !~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/'
     or length(p_endpoint) > 1000
     or coalesce(p_p256dh, '') !~ '^[A-Za-z0-9_-]{80,100}={0,2}$'
     or coalesce(p_auth, '') !~ '^[A-Za-z0-9_-]{16,32}={0,2}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_subscription');
  end if;
  insert into sadran.push_subscriptions (endpoint, role, employee_id, p256dh, auth)
  values (p_endpoint, s.role, s.employee_id, p_p256dh, p_auth)
  on conflict (endpoint) do update
     set role = excluded.role, employee_id = excluded.employee_id,
         p256dh = excluded.p256dh, auth = excluded.auth, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.sadran_push_unsubscribe(p_token text, p_endpoint text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  s sadran.sessions;
begin
  s := sadran.auth(p_token);
  delete from sadran.push_subscriptions
   where endpoint = p_endpoint and (s.role = 'manager' or employee_id = s.employee_id);
end $$;

-- Record that the signed-in person gave or withdrew a consent. `p_source` is the screen it happened
-- on ('first-run', 'sign-in', 'preferences'), `p_details` anything given with it (for example the
-- address for promotions). Returns the person's current consents.
create or replace function public.sadran_consent_set(
  p_token text, p_consent text, p_version text, p_granted boolean, p_source text, p_details jsonb
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  s sadran.sessions;
  subj text;
begin
  s := sadran.auth(p_token);
  subj := coalesce(s.employee_id, 'manager');
  if coalesce(p_consent, '') !~ '^[a-z][a-z0-9_-]{0,39}$'
     or length(coalesce(p_version, '')) not between 1 and 20
     or length(coalesce(p_source, '')) not between 1 and 40
     or p_granted is null
     or jsonb_typeof(coalesce(p_details, '{}'::jsonb)) <> 'object'
     or length(coalesce(p_details, '{}'::jsonb)::text) > 2000 then
    raise exception 'bad_input';
  end if;
  insert into sadran.consents (subject, employee_id, consent, version, granted, source, details, unsub_token)
  values (subj, s.employee_id, p_consent, p_version, p_granted, p_source, coalesce(p_details, '{}'::jsonb),
          case when p_granted then encode(extensions.gen_random_bytes(24), 'hex') end);
  return sadran.consents_of(subj);
end $$;

-- Withdraw a consent from a link in a message, without signing in. The token is the one stored
-- with the grant. Asking again for a consent that is already withdrawn changes nothing.
create or replace function public.sadran_unsubscribe(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  c sadran.consents;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{48}$' then
    return jsonb_build_object('ok', false);
  end if;
  select * into c from sadran.consents where unsub_token = p_token;
  if not found then
    return jsonb_build_object('ok', false);
  end if;
  if (select granted from sadran.consents where subject = c.subject and consent = c.consent order by id desc limit 1) then
    insert into sadran.consents (subject, employee_id, consent, version, granted, source)
    values (c.subject, c.employee_id, c.consent, c.version, false, 'unsubscribe-link');
  end if;
  return jsonb_build_object('ok', true, 'consent', c.consent);
end $$;

-- Only the functions above are callable from the website. The sadran.* helpers, including the
-- reminder functions the sadran-remind function calls, are reachable only from inside the database.
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
