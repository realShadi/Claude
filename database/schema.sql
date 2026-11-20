-- Sadran shift scheduler: database schema for Supabase (Postgres 15+).
--
-- Safe to run more than once. Apply it in the Supabase SQL Editor, or through
-- the Management API (POST /v1/projects/{ref}/database/query).
--
-- Design
-- * One database serves many stores. Every row belongs to a store, and every function works only
--   inside the store of the person who is signed in.
-- * All tables live in the private schema "sadran", which the Data API does not
--   expose. The website never reads a table directly.
-- * The website calls the public functions below (sadran_*) with the project's
--   publishable key. Each function checks a session token before it reads or
--   writes anything, and returns only what that person may see.
-- * Anyone can open a store (name and manager code). Employees sign in to their store with their
--   name and personal number; the manager signs in with the manager code. Both secrets are stored
--   only as bcrypt hashes, so nobody, the manager included, can read them back. Repeated wrong
--   attempts are blocked for 15 minutes.
-- * Every consent (terms of use, and any optional one) is recorded with its
--   text version, time and the screen it was given on.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists sadran;
revoke all on schema sadran from public;
revoke all on schema sadran from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Upgrade from the single-store layout
-- ---------------------------------------------------------------------------
-- The first versions served one store: a single "settings" row, and tables without a store. If
-- that layout is found, its tables are set aside here, the new tables are created below, and the
-- old rows are then copied in as the first store (see "Upgrade, second part").
do $$
begin
  if to_regclass('sadran.settings') is not null then
    create table sadran.v1_settings as table sadran.settings;
    create table sadran.v1_employees as table sadran.employees;
    create table sadran.v1_availability as table sadran.availability;
    create table sadran.v1_weeks as table sadran.weeks;
    create table sadran.v1_sessions as table sadran.sessions;
    create table sadran.v1_push_subscriptions as table sadran.push_subscriptions;
    create table sadran.v1_reminders as table sadran.reminders;
    create table sadran.v1_consents as table sadran.consents;
    drop table sadran.consents, sadran.reminders, sadran.push_subscriptions, sadran.login_failures,
               sadran.sessions, sadran.weeks, sadran.availability, sadran.employees, sadran.settings cascade;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per store: its name, the manager code, and its roles, shifts, staffing and rules.
-- The id is public: it is what a link to the store's sign-in screen carries.
create table if not exists sadran.stores (
  id text primary key check (id ~ '^[a-z0-9]{6,16}$'),
  name text not null check (length(btrim(name)) between 2 and 60),
  manager_code_hash text not null,   -- bcrypt of the manager code (6 to 12 digits)
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  logo text,                         -- kept apart from the config so it is downloaded only when it changes
  logo_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sadran.employees (
  store_id text not null references sadran.stores (id) on delete cascade,
  id text not null check (id ~ '^e_[a-z0-9_]{1,40}$'),
  name text not null check (length(btrim(name)) between 1 and 80),
  number_hash text not null,   -- bcrypt of the personal number (4 to 12 digits); the number itself is never stored
  roles jsonb not null default '[]'::jsonb check (jsonb_typeof(roles) = 'array'),
  max_shifts smallint not null default 5 check (max_shifts between 1 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (store_id, id)
);

-- One row per employee per week. The week is the date of its Sunday.
create table if not exists sadran.availability (
  store_id text not null,
  week date not null check (extract(dow from week) = 0),
  employee_id text not null,
  slots jsonb not null default '{}'::jsonb check (jsonb_typeof(slots) = 'object'),
  note text not null default '' check (length(note) <= 1000),
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (store_id, week, employee_id),
  foreign key (store_id, employee_id) references sadran.employees (store_id, id) on delete cascade
);

-- The roster for one week: the working draft, per-shift changes to the staffing,
-- and the version that was last published to the team.
create table if not exists sadran.weeks (
  store_id text not null references sadran.stores (id) on delete cascade,
  week date not null check (extract(dow from week) = 0),
  slots jsonb not null default '{}'::jsonb,
  overrides jsonb not null default '{}'::jsonb,
  published jsonb,
  updated_at timestamptz not null default now(),
  primary key (store_id, week)
);

create table if not exists sadran.sessions (
  token_hash text primary key,
  store_id text not null references sadran.stores (id) on delete cascade,
  role text not null check (role in ('manager', 'employee')),
  employee_id text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check ((role = 'employee') = (employee_id is not null)),
  foreign key (store_id, employee_id) references sadran.employees (store_id, id) on delete cascade
);

-- Recent wrong sign-in attempts and store openings, to slow down guessing and bulk sign-ups.
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
  store_id text not null references sadran.stores (id) on delete cascade,
  role text not null check (role in ('manager', 'employee')),
  employee_id text,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((role = 'employee') = (employee_id is not null)),
  foreign key (store_id, employee_id) references sadran.employees (store_id, id) on delete cascade
);
create index if not exists push_subscriptions_store on sadran.push_subscriptions (store_id, employee_id);

-- Which deadline reminders went out, so each person gets one per week.
create table if not exists sadran.reminders (
  store_id text not null references sadran.stores (id) on delete cascade,
  week date not null,
  kind text not null,      -- 'deadline' for an employee, 'summary' for the manager
  target text not null,    -- employee id, or 'manager'
  sent_at timestamptz not null default now(),
  primary key (store_id, week, kind, target)
);

-- Every consent given or withdrawn, one row each, never changed afterwards: who, which consent,
-- which version of its text, when, and on which screen. A person's latest row is their current choice.
-- The consent types and their texts are defined in site/content/legal/legal.json.
create table if not exists sadran.consents (
  id bigint generated always as identity primary key,
  store_id text not null references sadran.stores (id) on delete cascade,
  subject text not null,                 -- 'manager', or the employee's id
  employee_id text,
  consent text not null check (consent ~ '^[a-z][a-z0-9_-]{0,39}$'),
  version text not null check (length(version) between 1 and 20),
  granted boolean not null,
  source text not null check (length(source) between 1 and 40),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  unsub_token text unique,               -- lets a link in a message withdraw this consent without signing in
  at timestamptz not null default now(),
  check ((subject = 'manager') = (employee_id is null)),
  check (employee_id is null or subject = employee_id),
  foreign key (store_id, employee_id) references sadran.employees (store_id, id) on delete cascade
);
create index if not exists consents_subject on sadran.consents (store_id, subject, consent, id desc);

-- Defence in depth: should the schema ever be exposed, nothing is readable.
alter table sadran.stores enable row level security;
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

-- Functions from the single-store layout whose arguments changed.
drop function if exists sadran.new_session(text, text);
drop function if exists sadran.is_manager_code(text);
drop function if exists sadran.pending(date);
drop function if exists sadran.consents_of(text);
drop function if exists sadran.consent_recipients(text);
drop function if exists public.sadran_status();
drop function if exists public.sadran_logo();
drop function if exists public.sadran_setup(text);
drop function if exists public.sadran_login_manager(text);
drop function if exists public.sadran_login_employee(text, text);
drop function if exists public.sadran_save_config(text, jsonb);

create or replace function sadran.norm_name(t text) returns text
language sql immutable set search_path = '' as $$
  select lower(regexp_replace(btrim(coalesce(t, '')), '\s+', ' ', 'g'))
$$;

create or replace function sadran.norm_number(t text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(coalesce(t, ''), '[\s().+-]', '', 'g')
$$;

-- One store per name, so the name someone picks from the list points at one store.
create unique index if not exists stores_name_key on sadran.stores (sadran.norm_name(name));
-- One employee per name in a store, so a name and a personal number always point at one person.
create unique index if not exists employees_name_key on sadran.employees (store_id, sadran.norm_name(name));

create or replace function sadran.hash_token(t text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(coalesce(t, ''), 'sha256'), 'hex')
$$;

create or replace function sadran.ms(t timestamptz) returns bigint
language sql immutable set search_path = '' as $$
  select case when t is null then null else floor(extract(epoch from t) * 1000)::bigint end
$$;

create or replace function sadran.new_store_id() returns text
language plpgsql volatile set search_path = '' as $$
declare
  sid text;
begin
  loop
    sid := encode(extensions.gen_random_bytes(4), 'hex');
    exit when not exists (select 1 from sadran.stores where id = sid);
  end loop;
  return sid;
end $$;

-- What a new store starts with: example roles and shifts the manager then changes.
create or replace function sadran.default_config(p_name text) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_set($json$
{
  "store": { "name": "" },
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
$json$::jsonb, '{store,name}', to_jsonb(p_name))
$$;

create or replace function sadran.new_session(p_store text, p_role text, p_employee text) returns text
language plpgsql volatile set search_path = '' as $$
declare
  tok text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  delete from sadran.sessions where expires_at < now();
  insert into sadran.sessions (token_hash, store_id, role, employee_id, expires_at)
  values (sadran.hash_token(tok), p_store, p_role, p_employee, now() + interval '30 days');
  return tok;
end $$;

-- The session behind a token; raises 'auth' when it is missing or expired. The session carries
-- the store, and every function below works only inside that store.
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

create or replace function sadran.is_manager_code(p_store text, p_number text) returns boolean
language sql stable set search_path = '' as $$
  select coalesce((select extensions.crypt(p_number, manager_code_hash) = manager_code_hash
                     from sadran.stores where id = p_store), false)
$$;

-- Where a request to open a store came from, as a short hash that is kept for a day at most. It is
-- used only to stop one source from opening stores in bulk.
create or replace function sadran.caller_key() returns text
language sql stable set search_path = '' as $$
  select 'open:' || left(md5(coalesce(nullif(btrim(h ->> 'cf-connecting-ip'), ''),
                                      nullif(btrim(split_part(h ->> 'x-forwarded-for', ',', 1)), ''), 'unknown')), 16)
    from (select coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json as h) x
$$;

-- "22–28.11", isolated so it keeps its order inside Hebrew text.
create or replace function sadran.week_label(w date) returns text
language sql stable set search_path = '' as $$
  select chr(8294) || case when extract(month from w) = extract(month from w + 6)
                           then to_char(w, 'FMDD') || '–' || to_char(w + 6, 'FMDD.FMMM')
                           else to_char(w, 'FMDD.FMMM') || '–' || to_char(w + 6, 'FMDD.FMMM') end || chr(8297)
$$;

-- A store's employees with no submitted availability for a week.
create or replace function sadran.pending(p_store text, p_week date) returns setof sadran.employees
language sql stable set search_path = '' as $$
  select e.* from sadran.employees e
   where e.store_id = p_store
     and not exists (select 1 from sadran.availability a
                      where a.store_id = p_store and a.week = p_week and a.employee_id = e.id and a.submitted_at is not null)
   order by e.name
$$;

-- Called by the sadran-remind function every few minutes. For each store whose deadline for next
-- week has passed, returns one message per device of each employee who has not submitted, plus a
-- summary for the manager's devices. Each reminder is recorded as it is returned, so it goes out once.
create or replace function sadran.reminders_due() returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  st record;
  dl jsonb;
  loc timestamp;
  wk date;
  due timestamp;
  msgs jsonb := '[]'::jsonb;
  part jsonb;
  names text[];
  n int;
begin
  -- Housekeeping on every run: forget what is no longer needed.
  delete from sadran.reminders where sent_at < now() - interval '90 days';
  delete from sadran.login_failures where at < now() - interval '1 day';
  delete from sadran.sessions where expires_at < now();
  for st in
    select id, name, config -> 'rules' -> 'deadline' as deadline from sadran.stores
     where coalesce((config -> 'rules' -> 'deadline' ->> 'on')::boolean, false)
  loop
    dl := st.deadline;
    begin
      loc := now() at time zone coalesce(nullif(dl ->> 'tz', ''), 'Asia/Jerusalem');
    exception when others then
      loc := now() at time zone 'Asia/Jerusalem';   -- a time zone name the database does not know
    end;
    wk := loc::date + (7 - extract(dow from loc)::int);   -- next Sunday
    due := (wk - 7 + coalesce((dl ->> 'day')::int, 4))::timestamp + coalesce(nullif(dl ->> 'time', ''), '18:00')::time;
    continue when loc < due;

    with claimed as (
      insert into sadran.reminders (store_id, week, kind, target)
      select st.id, wk, 'deadline', e.id from sadran.pending(st.id, wk) e
       where exists (select 1 from sadran.push_subscriptions p where p.store_id = st.id and p.employee_id = e.id)
      on conflict do nothing
      returning target
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth, 'title', st.name,
             'body', 'עוד לא הגשת זמינות לשבוע ' || sadran.week_label(wk) || ', והמועד להגשה עבר. אפשר להגיש עכשיו.',
             'url', './?store=' || st.id || '#my-availability', 'tag', 'deadline-' || wk)), '[]'::jsonb)
      into part
      from claimed c join sadran.push_subscriptions p on p.store_id = st.id and p.employee_id = c.target;
    msgs := msgs || part;

    select array_agg(e.name), count(*) into names, n from sadran.pending(st.id, wk) e;
    if n > 0 and exists (select 1 from sadran.push_subscriptions where store_id = st.id and role = 'manager') then
      insert into sadran.reminders (store_id, week, kind, target) values (st.id, wk, 'summary', 'manager') on conflict do nothing;
      if found then
        msgs := msgs || coalesce((
          select jsonb_agg(jsonb_build_object(
                   'endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth, 'title', st.name,
                   'body', case when n = 1 then 'עובד/ת אחד/ת עוד לא הגיש/ה זמינות לשבוע '
                                else n || ' עובדים עוד לא הגישו זמינות לשבוע ' end
                           || sadran.week_label(wk) || ': ' || array_to_string(names[1:5], ', ')
                           || case when n > 5 then ' ועוד ' || (n - 5) else '' end || '.',
                   'url', './?store=' || st.id || '#availability', 'tag', 'summary-' || wk))
            from sadran.push_subscriptions p where p.store_id = st.id and p.role = 'manager'), '[]'::jsonb);
      end if;
    end if;
  end loop;
  return msgs;
end $$;

-- The manager's "send a reminder now": messages for everyone in the store who has not submitted
-- for a week, with who can and cannot be reached.
create or replace function sadran.reminders_manual(p_token text, p_week date) returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  s sadran.sessions;
  store text;
begin
  s := sadran.auth(p_token, 'manager');
  select name into store from sadran.stores where id = s.store_id;
  return jsonb_build_object(
    'pending', (select count(*) from sadran.pending(s.store_id, p_week)),
    'reached', (select coalesce(jsonb_agg(e.name), '[]'::jsonb) from sadran.pending(s.store_id, p_week) e
                 where exists (select 1 from sadran.push_subscriptions p where p.store_id = s.store_id and p.employee_id = e.id)),
    'unreachable', (select coalesce(jsonb_agg(e.name), '[]'::jsonb) from sadran.pending(s.store_id, p_week) e
                     where not exists (select 1 from sadran.push_subscriptions p where p.store_id = s.store_id and p.employee_id = e.id)),
    'messages', (select coalesce(jsonb_agg(jsonb_build_object(
                   'endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth, 'title', store,
                   'body', 'תזכורת: עוד לא הגשת זמינות לשבוע ' || sadran.week_label(p_week) || '. אפשר להגיש עכשיו.',
                   'url', './?store=' || s.store_id || '#my-availability', 'tag', 'manual-' || p_week)), '[]'::jsonb)
                   from sadran.pending(s.store_id, p_week) e
                   join sadran.push_subscriptions p on p.store_id = s.store_id and p.employee_id = e.id));
end $$;

-- A push service said this subscription no longer exists.
create or replace function sadran.push_drop(p_endpoint text) returns void
language sql volatile set search_path = '' as $$
  delete from sadran.push_subscriptions where endpoint = p_endpoint;
$$;

-- A person's current consents: the latest record of each type.
create or replace function sadran.consents_of(p_store text, p_subject text) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_object_agg(c.consent, jsonb_build_object(
           'version', c.version, 'granted', c.granted, 'at', sadran.ms(c.at), 'source', c.source, 'details', c.details)), '{}'::jsonb)
    from (select distinct on (consent) consent, version, granted, at, source, details
            from sadran.consents where store_id = p_store and subject = p_subject order by consent, id desc) c
$$;

-- For a future sender of messages that need consent (for example promotions): everyone, in every
-- store, whose latest record for that consent is a grant, with what they gave and the token for
-- their unsubscribe link. Not callable from the website.
create or replace function sadran.consent_recipients(p_consent text)
returns table (store_id text, subject text, details jsonb, unsub_token text, granted_at timestamptz)
language sql stable set search_path = '' as $$
  select c.store_id, c.subject, c.details, c.unsub_token, c.at
    from (select distinct on (store_id, subject) * from sadran.consents where consent = p_consent order by store_id, subject, id desc) c
   where c.granted
$$;

-- Remove a store and everything in it. For the operator of the service; not callable from the website.
create or replace function sadran.close_store(p_store text) returns boolean
language plpgsql volatile set search_path = '' as $$
begin
  delete from sadran.stores where id = p_store;
  return found;
end $$;

-- ---------------------------------------------------------------------------
-- Upgrade, second part: the old single store becomes the first store
-- ---------------------------------------------------------------------------
do $$
declare
  old record;
  sid text;
  nm text;
begin
  if to_regclass('sadran.v1_settings') is null then
    return;
  end if;
  select * into old from sadran.v1_settings limit 1;
  if found and old.manager_code_hash is not null then
    sid := sadran.new_store_id();
    nm := left(regexp_replace(btrim(coalesce(old.config -> 'store' ->> 'name', '')), '\s+', ' ', 'g'), 60);
    if length(nm) < 2 then
      nm := 'החנות שלי';
    end if;
    insert into sadran.stores (id, name, manager_code_hash, config, logo, logo_updated_at, updated_at)
    values (sid, nm, old.manager_code_hash, jsonb_set(old.config, '{store}', jsonb_build_object('name', nm)),
            old.logo, old.logo_updated_at, old.updated_at);
    insert into sadran.employees (store_id, id, name, number_hash, roles, max_shifts, created_at, updated_at)
      select sid, id, name, number_hash, roles, max_shifts, created_at, updated_at from sadran.v1_employees;
    insert into sadran.availability (store_id, week, employee_id, slots, note, submitted_at, updated_at)
      select sid, week, employee_id, slots, note, submitted_at, updated_at from sadran.v1_availability;
    insert into sadran.weeks (store_id, week, slots, overrides, published, updated_at)
      select sid, week, slots, overrides, published, updated_at from sadran.v1_weeks;
    insert into sadran.sessions (token_hash, store_id, role, employee_id, created_at, expires_at)
      select token_hash, sid, role, employee_id, created_at, expires_at from sadran.v1_sessions;
    insert into sadran.push_subscriptions (endpoint, store_id, role, employee_id, p256dh, auth, created_at, updated_at)
      select endpoint, sid, role, employee_id, p256dh, auth, created_at, updated_at from sadran.v1_push_subscriptions;
    insert into sadran.reminders (store_id, week, kind, target, sent_at)
      select sid, week, kind, target, sent_at from sadran.v1_reminders;
    insert into sadran.consents (store_id, subject, employee_id, consent, version, granted, source, details, unsub_token, at)
      select sid, subject, employee_id, consent, version, granted, source, details, unsub_token, at
        from sadran.v1_consents order by id;
  end if;
  drop table sadran.v1_settings, sadran.v1_employees, sadran.v1_availability, sadran.v1_weeks, sadran.v1_sessions,
             sadran.v1_push_subscriptions, sadran.v1_reminders, sadran.v1_consents;
end $$;

revoke all on all functions in schema sadran from public;

-- ---------------------------------------------------------------------------
-- Functions the website calls
-- ---------------------------------------------------------------------------

-- The list a visitor chooses their store from: names that contain what was typed, 30 at most.
create or replace function public.sadran_stores(p_query text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with q as (select sadran.norm_name(left(coalesce(p_query, ''), 60)) as t),
       hits as (
         select s.id, s.name, row_number() over (order by sadran.norm_name(s.name), s.id) as rn
           from sadran.stores s, q
          where q.t = '' or position(q.t in sadran.norm_name(s.name)) > 0)
  select jsonb_build_object(
           'stores', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by rn) from hits where rn <= 30), '[]'::jsonb),
           'more', exists (select 1 from hits where rn > 30))
$$;

-- Before sign-in: does the store exist, and its name, colours and logo version for the sign-in screen.
create or replace function public.sadran_status(p_store text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('found', true, 'id', id, 'store', name,
                                             'theme', config -> 'theme', 'logoVer', sadran.ms(logo_updated_at))
                     from sadran.stores where id = p_store), jsonb_build_object('found', false))
$$;

-- The store logo is public: it is shown on the sign-in screen.
create or replace function public.sadran_logo(p_store text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('logo', logo, 'logoVer', sadran.ms(logo_updated_at))
    from sadran.stores where id = p_store
$$;

-- Open a new store: its name and the manager code. Signs the manager in.
create or replace function public.sadran_open_store(p_name text, p_code text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  nm text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  c text := sadran.norm_number(p_code);
  who text := sadran.caller_key();
  sid text;
begin
  if length(nm) not between 2 and 60 then
    return jsonb_build_object('ok', false, 'error', 'name');
  end if;
  if c !~ '^[0-9]{6,12}$' then
    return jsonb_build_object('ok', false, 'error', 'code_format');
  end if;
  -- One source may open a few stores in a quarter of an hour, and the whole service a bounded number a day.
  if sadran.too_many(who, 3) or (select count(*) from sadran.stores where created_at > now() - interval '1 day') >= 60 then
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;
  if exists (select 1 from sadran.stores where sadran.norm_name(name) = sadran.norm_name(nm)) then
    return jsonb_build_object('ok', false, 'error', 'name_taken');
  end if;
  sid := sadran.new_store_id();
  insert into sadran.stores (id, name, manager_code_hash, config)
  values (sid, nm, extensions.crypt(c, extensions.gen_salt('bf', 8)), sadran.default_config(nm));
  perform sadran.record_failure(who);
  return jsonb_build_object('ok', true, 'store', sid, 'token', sadran.new_session(sid, 'manager', null));
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'name_taken');
end $$;

create or replace function public.sadran_login_manager(p_store text, p_code text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  c text := sadran.norm_number(p_code);
  k text := 'manager:' || coalesce(p_store, '');
  h text;
begin
  select manager_code_hash into h from sadran.stores where id = p_store;
  if h is null then
    return jsonb_build_object('ok', false, 'error', 'no_store');
  end if;
  if sadran.too_many(k, 10) then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;
  if c = '' or extensions.crypt(c, h) <> h then
    perform sadran.record_failure(k);
    return jsonb_build_object('ok', false, 'error', 'bad_login');
  end if;
  return jsonb_build_object('ok', true, 'token', sadran.new_session(p_store, 'manager', null));
end $$;

create or replace function public.sadran_login_employee(p_store text, p_name text, p_number text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  k text := 'employee:' || coalesce(p_store, '') || ':' || sadran.norm_name(p_name);
  n text := sadran.norm_number(p_number);
  eid text;
  h text;
begin
  if not exists (select 1 from sadran.stores where id = p_store) then
    return jsonb_build_object('ok', false, 'error', 'no_store');
  end if;
  if sadran.too_many(k, 10) then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;
  select id, number_hash into eid, h from sadran.employees
   where store_id = p_store and sadran.norm_name(name) = sadran.norm_name(p_name);
  if eid is null then
    -- The same work as a real check, so the response time does not reveal which names exist.
    perform extensions.crypt(n, extensions.gen_salt('bf', 8));
  end if;
  if eid is null or n = '' or extensions.crypt(n, h) <> h then
    perform sadran.record_failure(k);
    return jsonb_build_object('ok', false, 'error', 'bad_login');
  end if;
  return jsonb_build_object('ok', true, 'token', sadran.new_session(p_store, 'employee', eid));
end $$;

create or replace function public.sadran_logout(p_token text) returns void
language sql volatile security definer set search_path = '' as $$
  delete from sadran.sessions where token_hash = sadran.hash_token(p_token);
$$;

-- The settings as employees get them: without the order of priority the manager set in each role,
-- which is the manager's own assessment of the team.
create or replace function sadran.config_for_employees(p_config jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_config -> 'roles') = 'array'
    then jsonb_set(p_config, '{roles}', coalesce((select jsonb_agg(r.value - 'rank' order by r.ord)
                                                    from jsonb_array_elements(p_config -> 'roles') with ordinality r(value, ord)), '[]'::jsonb))
    else p_config end
$$;

-- Everything the signed-in person may see, in their store only. Employees get their own
-- availability, published rosters and their teammates' names; the manager gets it all.
create or replace function public.sadran_load(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  s sadran.sessions;
  mgr boolean;
  since date := current_date - 56;
  st sadran.stores;
  emps jsonb;
  av jsonb;
  wk jsonb;
begin
  s := sadran.auth(p_token);
  mgr := s.role = 'manager';
  select * into st from sadran.stores where id = s.store_id;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id,
           'name', e.name,
           'roles', case when mgr or e.id = s.employee_id then e.roles else '[]'::jsonb end,
           'max', e.max_shifts) order by e.created_at, e.id), '[]'::jsonb)
    into emps from sadran.employees e where e.store_id = s.store_id;
  select coalesce(jsonb_object_agg(w.week, w.recs), '{}'::jsonb) into av from (
    select a.week::text as week,
           jsonb_object_agg(a.employee_id, jsonb_build_object(
             'slots', a.slots, 'note', a.note, 'submittedAt', sadran.ms(a.submitted_at))) as recs
      from sadran.availability a
     where a.store_id = s.store_id and a.week >= since and (mgr or a.employee_id = s.employee_id)
     group by a.week) w;
  select coalesce(jsonb_object_agg(w.week::text, jsonb_build_object(
           'slots', case when mgr then w.slots else '{}'::jsonb end,
           'over', case when mgr then w.overrides else '{}'::jsonb end,
           'published', w.published)), '{}'::jsonb)
    into wk from sadran.weeks w
   where w.store_id = s.store_id and w.week >= since and (mgr or w.published is not null);
  return jsonb_build_object('role', s.role, 'me', s.employee_id, 'store', st.id,
                            'config', jsonb_set(case when mgr then st.config else sadran.config_for_employees(st.config) end,
                                                '{store}', jsonb_build_object('name', st.name)),
                            'employees', emps, 'avail', av, 'weeks', wk,
                            'logoVer', sadran.ms(st.logo_updated_at),
                            'consents', sadran.consents_of(s.store_id, coalesce(s.employee_id, 'manager')));
end $$;

-- The store's settings. The name is not changed here: it has its own function, because it must
-- stay unique. Whatever name arrives with the settings is replaced by the stored one.
create or replace function public.sadran_save_config(p_token text, p_config jsonb) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  s sadran.sessions;
begin
  s := sadran.auth(p_token, 'manager');
  if jsonb_typeof(p_config) is distinct from 'object'
     or jsonb_typeof(p_config -> 'roles') is distinct from 'array'
     or jsonb_typeof(p_config -> 'shifts') is distinct from 'array'
     or length(p_config::text) > 200000 then
    raise exception 'bad_input';
  end if;
  update sadran.stores
     set config = jsonb_set(p_config, '{store}', jsonb_build_object('name', name)), updated_at = now()
   where id = s.store_id;
end $$;

-- Rename the store. Names are unique, so the list people choose from never shows two alike.
create or replace function public.sadran_rename_store(p_token text, p_name text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  s sadran.sessions;
  nm text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  s := sadran.auth(p_token, 'manager');
  if length(nm) not between 2 and 60 then
    return jsonb_build_object('ok', false, 'error', 'name');
  end if;
  if exists (select 1 from sadran.stores where sadran.norm_name(name) = sadran.norm_name(nm) and id <> s.store_id) then
    return jsonb_build_object('ok', false, 'error', 'name_taken');
  end if;
  update sadran.stores
     set name = nm, config = jsonb_set(config, '{store}', jsonb_build_object('name', nm)), updated_at = now()
   where id = s.store_id;
  return jsonb_build_object('ok', true, 'name', nm);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'name_taken');
end $$;

-- Add or change one employee. The personal number is required for a new employee and optional
-- afterwards: leaving it out keeps the current one. A new number signs the employee out everywhere.
create or replace function public.sadran_save_employee(p_token text, p_employee jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  s sadran.sessions;
  eid text := p_employee ->> 'id';
  nm text := regexp_replace(btrim(coalesce(p_employee ->> 'name', '')), '\s+', ' ', 'g');
  n text := sadran.norm_number(p_employee ->> 'number');
  is_new boolean;
begin
  s := sadran.auth(p_token, 'manager');
  if nm = '' then
    return jsonb_build_object('ok', false, 'error', 'name');
  end if;
  is_new := not exists (select 1 from sadran.employees where store_id = s.store_id and id = eid);
  if n = '' and is_new then
    return jsonb_build_object('ok', false, 'error', 'number_required');
  end if;
  if n <> '' and n !~ '^[0-9]{4,12}$' then
    return jsonb_build_object('ok', false, 'error', 'number_format');
  end if;
  if n <> '' and sadran.is_manager_code(s.store_id, n) then
    return jsonb_build_object('ok', false, 'error', 'number_is_code');
  end if;
  if exists (select 1 from sadran.employees
              where store_id = s.store_id and sadran.norm_name(name) = sadran.norm_name(nm) and id <> eid) then
    return jsonb_build_object('ok', false, 'error', 'name_taken');
  end if;
  insert into sadran.employees (store_id, id, name, number_hash, roles, max_shifts)
  values (s.store_id, eid, nm, case when n <> '' then extensions.crypt(n, extensions.gen_salt('bf', 8)) else '' end,
          coalesce(p_employee -> 'roles', '[]'::jsonb),
          least(greatest(coalesce((p_employee ->> 'max')::int, 5), 1), 99))
  on conflict (store_id, id) do update
     set name = excluded.name,
         number_hash = case when excluded.number_hash <> '' then excluded.number_hash else sadran.employees.number_hash end,
         roles = excluded.roles, max_shifts = excluded.max_shifts, updated_at = now();
  if n <> '' and not is_new then
    delete from sadran.sessions where store_id = s.store_id and employee_id = eid;
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.sadran_delete_employee(p_token text, p_id text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  s sadran.sessions;
begin
  s := sadran.auth(p_token, 'manager');
  delete from sadran.employees where store_id = s.store_id and id = p_id;
end $$;

-- Add or update many employees, and optionally remove some, in one step: all of it or none.
-- As above, a row for an existing employee may leave the personal number out.
create or replace function public.sadran_import_employees(p_token text, p_upserts jsonb, p_deletes jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  s sadran.sessions;
  item jsonb;
  num text;
begin
  s := sadran.auth(p_token, 'manager');
  if jsonb_array_length(coalesce(p_upserts, '[]'::jsonb)) > 500 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;
  for item in select value from jsonb_array_elements(coalesce(p_upserts, '[]'::jsonb)) loop
    num := sadran.norm_number(item ->> 'number');
    if btrim(coalesce(item ->> 'name', '')) = '' or (num <> '' and num !~ '^[0-9]{4,12}$') then
      return jsonb_build_object('ok', false, 'error', 'bad_row', 'name', item ->> 'name');
    end if;
    if num = '' and not exists (select 1 from sadran.employees where store_id = s.store_id and id = item ->> 'id') then
      return jsonb_build_object('ok', false, 'error', 'number_required', 'name', item ->> 'name');
    end if;
    if num <> '' and sadran.is_manager_code(s.store_id, num) then
      return jsonb_build_object('ok', false, 'error', 'number_is_code', 'name', item ->> 'name');
    end if;
  end loop;
  delete from sadran.employees
   where store_id = s.store_id and id in (select jsonb_array_elements_text(coalesce(p_deletes, '[]'::jsonb)));
  -- A new number signs that employee out everywhere.
  delete from sadran.sessions
   where store_id = s.store_id
     and employee_id in (select x.value ->> 'id' from jsonb_array_elements(coalesce(p_upserts, '[]'::jsonb)) as x
                          where sadran.norm_number(x.value ->> 'number') <> '');
  insert into sadran.employees (store_id, id, name, number_hash, roles, max_shifts)
  select s.store_id, x.value ->> 'id',
         regexp_replace(btrim(x.value ->> 'name'), '\s+', ' ', 'g'),
         case when sadran.norm_number(x.value ->> 'number') <> ''
              then extensions.crypt(sadran.norm_number(x.value ->> 'number'), extensions.gen_salt('bf', 8)) else '' end,
         coalesce(x.value -> 'roles', '[]'::jsonb),
         least(greatest(coalesce((x.value ->> 'max')::int, 5), 1), 99)
    from jsonb_array_elements(coalesce(p_upserts, '[]'::jsonb)) as x
  on conflict (store_id, id) do update
     set name = excluded.name,
         number_hash = case when excluded.number_hash <> '' then excluded.number_hash else sadran.employees.number_hash end,
         roles = excluded.roles, max_shifts = excluded.max_shifts, updated_at = now();
  return jsonb_build_object('ok', true);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'name_taken');
end $$;

-- An employee saves their own availability; the manager may save anyone's in the store.
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
  if not exists (select 1 from sadran.employees where store_id = s.store_id and id = p_employee) then
    raise exception 'bad_input';
  end if;
  insert into sadran.availability (store_id, week, employee_id, slots, note, submitted_at, updated_at)
  values (s.store_id, p_week, p_employee, p_slots, left(coalesce(p_note, ''), 1000),
          case when p_submitted then now() end, now())
  on conflict (store_id, week, employee_id) do update
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
declare
  s sadran.sessions;
begin
  s := sadran.auth(p_token, 'manager');
  if length(coalesce(p_slots, '{}'::jsonb)::text) + length(coalesce(p_over, '{}'::jsonb)::text)
     + length(coalesce(p_published, '{}'::jsonb)::text) > 600000 then
    raise exception 'bad_input';
  end if;
  insert into sadran.weeks (store_id, week, slots, overrides, published, updated_at)
  values (s.store_id, p_week, coalesce(p_slots, '{}'::jsonb), coalesce(p_over, '{}'::jsonb),
          case when jsonb_typeof(p_published) = 'object' then p_published end, now())
  on conflict (store_id, week) do update
     set slots = excluded.slots, overrides = excluded.overrides,
         published = excluded.published, updated_at = now();
end $$;

-- Change the manager code. Other manager sign-ins to the store are ended.
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
  if exists (select 1 from sadran.employees where store_id = s.store_id and number_hash = extensions.crypt(c, number_hash)) then
    return jsonb_build_object('ok', false, 'error', 'code_is_number');
  end if;
  update sadran.stores
     set manager_code_hash = extensions.crypt(c, extensions.gen_salt('bf', 8)), updated_at = now()
   where id = s.store_id;
  delete from sadran.sessions where store_id = s.store_id and role = 'manager' and token_hash <> s.token_hash;
  return jsonb_build_object('ok', true);
end $$;

-- A PNG, JPEG or WebP data URL, already resized by the page; null removes the logo.
create or replace function public.sadran_save_logo(p_token text, p_logo text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  s sadran.sessions;
  ver timestamptz := case when p_logo is null then null else now() end;
begin
  s := sadran.auth(p_token, 'manager');
  if p_logo is not null and (length(p_logo) > 300000
     or p_logo !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$') then
    return jsonb_build_object('ok', false, 'error', 'bad_image');
  end if;
  update sadran.stores set logo = p_logo, logo_updated_at = ver, updated_at = now() where id = s.store_id;
  return jsonb_build_object('ok', true, 'logoVer', sadran.ms(ver));
end $$;

-- Remember this browser for reminders, for the signed-in employee or the manager. A browser that
-- signs in to another store takes its subscription with it.
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
  insert into sadran.push_subscriptions (endpoint, store_id, role, employee_id, p256dh, auth)
  values (p_endpoint, s.store_id, s.role, s.employee_id, p_p256dh, p_auth)
  on conflict (endpoint) do update
     set store_id = excluded.store_id, role = excluded.role, employee_id = excluded.employee_id,
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
   where endpoint = p_endpoint and store_id = s.store_id and (s.role = 'manager' or employee_id = s.employee_id);
end $$;

-- Record that the signed-in person gave or withdrew a consent. `p_source` is the screen it happened
-- on ('open-store', 'sign-in', 'preferences'), `p_details` anything given with it (for example the
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
  insert into sadran.consents (store_id, subject, employee_id, consent, version, granted, source, details, unsub_token)
  values (s.store_id, subj, s.employee_id, p_consent, p_version, p_granted, p_source, coalesce(p_details, '{}'::jsonb),
          case when p_granted then encode(extensions.gen_random_bytes(24), 'hex') end);
  return sadran.consents_of(s.store_id, subj);
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
  if (select granted from sadran.consents
       where store_id = c.store_id and subject = c.subject and consent = c.consent order by id desc limit 1) then
    insert into sadran.consents (store_id, subject, employee_id, consent, version, granted, source)
    values (c.store_id, c.subject, c.employee_id, c.consent, c.version, false, 'unsubscribe-link');
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
