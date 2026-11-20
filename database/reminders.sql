-- Sadran: run the availability reminders every 10 minutes.
--
-- Calls the sadran-remind Edge Function (supabase/functions/sadran-remind), which sends a browser
-- notification to everyone who has not submitted availability once the manager's deadline has
-- passed, and a summary to the manager. Run after schema.sql. Safe to run again.
--
-- The URL is this project's; change it if the function lives in another project.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'sadran-reminders',
  '*/10 * * * *',
  $job$
    select net.http_post(
      url := 'https://xdjeijflnutqoxzzodqh.supabase.co/functions/v1/sadran-remind',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{"cron": true}'::jsonb,
      timeout_milliseconds := 30000
    );
  $job$
);

-- Delete availability and rosters a year after their week, every night at 03:17 UTC.
select cron.schedule('sadran-purge-old', '17 3 * * *', $job$ select sadran.purge_old(); $job$);
