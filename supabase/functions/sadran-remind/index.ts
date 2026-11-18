// sadran-remind: sends Sadran's availability reminders as browser notifications.
//
// POST {"cron": true}             Run by pg_cron every 10 minutes (database/reminders.sql). Sends the
//                                 reminders that are due: when the deadline for next week has
//                                 passed, to everyone who has not submitted, once per week.
// POST {"token": "...", "week": "YYYY-MM-DD"}
//                                 The manager's "send a reminder now". The token is the manager's
//                                 Sadran session; the database checks it.
//
// Deploy without JWT verification (the site signs in with its own sessions):
//   supabase functions deploy sadran-remind --no-verify-jwt
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_JWK (and optionally VAPID_SUBJECT).

import postgres from 'npm:postgres@3.4.5';
import { sendPush } from './webpush.js';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2 });
const VAPID = {
  publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
  privateJwk: JSON.parse(Deno.env.get('VAPID_PRIVATE_JWK') ?? '{}'),
  subject: Deno.env.get('VAPID_SUBJECT') ?? 'https://xdjeijflnutqoxzzodqh.supabase.co',
  ttl: 86400,
};
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

type Message = { endpoint: string; p256dh: string; auth: string; title: string; body: string; url: string; tag: string };

async function deliver(messages: Message[]) {
  let sent = 0, failed = 0;
  const statuses: Record<string, number> = {};
  for (const m of messages) {
    let status = 0;
    try {
      const payload = JSON.stringify({ title: m.title, body: m.body, url: m.url, tag: m.tag });
      status = (await sendPush({ endpoint: m.endpoint, p256dh: m.p256dh, auth: m.auth }, payload, VAPID)).status;
    } catch (e) {
      console.error('push failed', String(e));
    }
    statuses[status] = (statuses[status] ?? 0) + 1;
    if (status >= 200 && status < 300) sent++;
    else {
      failed++;
      // The browser unsubscribed or the subscription expired: forget it.
      if (status === 404 || status === 410) await sql`select sadran.push_drop(${m.endpoint})`;
    }
  }
  return { sent, failed, statuses };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'method' }, 405);
  let input: { cron?: boolean; token?: string; week?: string } = {};
  try { input = await req.json(); } catch { /* empty body */ }
  try {
    if (input.token) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.week ?? '')) return reply({ error: 'week' }, 400);
      const [{ r }] = await sql`select sadran.reminders_manual(${input.token}, ${input.week}::date) as r`;
      const result = await deliver(r.messages ?? []);
      return reply({ ...result, pending: r.pending, reached: r.reached, unreachable: r.unreachable });
    }
    const [{ r }] = await sql`select sadran.reminders_due() as r`;
    return reply(await deliver(r ?? []));
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (/^(auth|forbidden)$/.test(msg)) return reply({ error: 'auth' }, 401);
    console.error(msg);
    return reply({ error: 'server' }, 500);
  }
});
