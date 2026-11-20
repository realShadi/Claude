# Sadran: data, reminders and hosting

Sadran (`site/`) is the weekly shift scheduler. This folder holds what it needs around the page itself: the database definition, the reminder schedule and the Excel layout for the employee list.

| File | What it is |
|---|---|
| `schema.sql` | The database: tables, sign-in checks and the functions the site calls. Safe to run again. |
| `reminders.sql` | Runs the availability reminders every 10 minutes (pg_cron). Run after `schema.sql`. |
| `employees-template.xlsx` | The layout for the employee list (name and personal number), for import in the app. Built by `../tools/make-template.py`. |
| `../supabase/functions/sadran-remind/` | The Edge Function that sends the reminders as browser notifications. |
| `../site/content/legal/` | The legal texts, the business details that fill them, and the consent and cookie settings. See its `README.md`. |
| `../LEGAL_TODO.md` | What still has to be filled in and reviewed by a lawyer before going live. |

## How it fits together

```
phone / computer ──► site/ (static host) ──► Supabase project (xdjeijflnutqoxzzodqh)
       ▲                                       private "sadran" schema + sadran_* functions
       │                                              │
       └──── browser push service ◄── sadran-remind ◄─┘ every 10 minutes (pg_cron + pg_net)
```

- The site has no build step: `index.html`, `app.css` and `app.js`, with the fonts (`fonts/`) and the Excel library (`vendor/`) served from the site itself, so a visit contacts no third party. `manifest.webmanifest` and the icons let it be added to a phone's home screen. `sw.js` shows notifications and is installed only on devices where notifications are switched on. The site talks to Supabase with the project's **publishable key**, which is written into `app.js`. That key is meant to be public: it can only call the `sadran_*` functions.
- Every function checks a sign-in before it reads or writes anything:
  - **Employees** sign in with their name and personal number. They see their own availability, their teammates' names and published rosters. They can change only their own availability.
  - **The manager** signs in with the manager code. The manager sees and changes everything.
- The tables live in a private schema the Data API does not expose, with row-level security turned on and no policies, so nothing can read them directly.
- The manager code and the employees' personal numbers are stored only as bcrypt hashes, and sign-in sessions as SHA-256 hashes. Nobody can read a personal number back, the manager included: the manager can only set a new one, which signs that employee out everywhere. Ten wrong attempts on one name, or on the manager code, block further attempts for 15 minutes.
- Every agreement to the terms, and any optional consent, is recorded in `sadran.consents` with the person, the version of the text, the time and the screen it was given on.
- Changes are saved automatically about a second after the last edit. Other devices pick them up within about 30 seconds, or right away when the page is opened or brought back to the front. If the connection drops, the header shows "לא נשמר" and the change is sent when it returns.

Inside the Claude viewer, pages cannot reach outside services, so the site runs there as a one-device demo with example data, saved in that browser only. Because that data exists nowhere else, the demo sets a copy aside before a newer version of the page, a reset or a restore could replace it, and its settings screen can save everything to a backup file and load it back (**גיבוי הנתונים**). `python3 tools/build-demo.py out.html` folds the site into the single file the viewer needs. Notifications do not run there.

## What the manager can set (הגדרות)

- **Store**: name and logo. The logo is resized in the browser to at most 360 px and stored in the database; each device keeps a copy and downloads it again only when it changes.
- **Colour theme** for everyone: seven presets or any colour. The site derives the rest from it and keeps text readable in light and dark. Each person can also switch their own device between light, dark and the device setting with the button at the top of the screen.
- **Role colours**: 12 highlight colours.
- **Per employee** (in צוות): the roles they can fill and the most shifts a week, from 1 up to every shift in the week (14 with two shifts a day).
- **Two shifts on the same day are normal.** Anyone who marked both shifts of a day as available can be given both, as long as the two do not overlap. The minimum rest between shifts applies between different days (an evening, then the next morning) and to a third shift on one day. The site does not check daily working hours against the law.
- **Export style** for the roster as PDF or JPEG: colourful, light, dark, or print (black on white). Both the manager (any week, marked "טיוטה" if not published as shown) and employees (published weeks) can save the roster as a file. The exported roster shows names and hours only, without roles.
- **Availability deadline**: a day and time in the week before. Employees see it on their availability screen.

Employees can mark a shift as possible or preferred, and with the clock button, limit it to specific hours: up to two ranges inside the shift, for example 11:30–13:50, or 16:30 to the end of the shift. A range that ends at the shift's end follows the shift if its hours change. Someone available for part of a shift can be scheduled in it, automatically or by hand, and the roster shows their hours next to their name. People free for the whole shift are placed first.

## Reminders

When the deadline for next week has passed, everyone who has not submitted availability and has turned notifications on gets a browser notification, once per week. The manager's devices with notifications on get a list of who has not submitted. In **זמינות**, **שליחת התראה** sends a reminder right away, and says who could not be reached.

- Employees turn notifications on at the bottom of their availability screen; the manager at the deadline card in the settings. Signing out turns them off on that device.
- **iPhone and iPad**: notifications work only when the site was added to the home screen (Safari: Share, Add to Home Screen) and is opened from there. The site explains this on those devices.
- Android, and desktop Chrome, Edge and Firefox, work in the browser.

How it is wired:

1. `sadran.reminders_due()` works out next week's deadline in the store's time zone (saved with the deadline setting), and returns one message per device, recording each reminder so it goes out once.
2. `supabase/functions/sadran-remind` signs each message with the app's VAPID key, encrypts it for the device (RFC 8291) and posts it to the device's push service. Devices that report they are gone are removed.
3. `reminders.sql` schedules the function every 10 minutes.

The function connects with `SUPABASE_DB_URL` (provided by Supabase) and needs two secrets: `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_JWK`. The public key is also in `site/app.js` (`VAPID_PUBLIC`). The private key exists only as a Supabase secret; it must never be committed. Only the push services' own addresses (Google, Mozilla, Apple, Microsoft) are accepted as devices.

To replace the key pair: generate a new P-256 key pair, set both secrets, put the new public key in `site/app.js`, and redeploy. Everyone then turns notifications on again.

Deploy the function with the Supabase CLI:

```
supabase functions deploy sadran-remind --no-verify-jwt
```

## First run

1. Fill in the business details in `site/content/legal/business.json` and go through `LEGAL_TODO.md`, so the legal pages are complete before anyone is asked to agree to them.
2. Open the hosted site. A new database opens on **הגדרה ראשונה**: choose the manager code (6 to 12 digits) and tick the agreement to the terms of use and the privacy policy.
3. In **צוות**, import the employee list from Excel (**ייבוא מאקסל**) or add people one by one. Tell each person their personal number then: the site does not show it again.
4. In **הגדרות**, add the logo, choose the colours and the export style, check the roles, shifts and staffing, and set the availability deadline.
5. Send the link to the team. Each person signs in with their name and personal number, is asked once to agree to the terms and the privacy policy, and can turn on notifications.

The first-run screen is open to whoever reaches the site first, so do step 2 before sharing the link.

## The employee list (`employees-template.xlsx`)

| Column | Required | Meaning |
|---|---|---|
| שם (name) | yes | What the employee types when signing in. |
| מספר אישי (personal number) | for a new employee | 4 to 12 digits, different from the manager code. Stored as text, so a leading zero is kept. Leave it empty for someone already in the system to keep their number. |
| תפקידים (roles) | no | Role names exactly as they appear in the app's settings, separated by commas. |
| מקסימום משמרות בשבוע (max shifts per week) | no | A whole number, 1 or more, up to the number of shifts in a week. Defaults to 5. |

Row 2 of the template is an example. Any row whose name contains "דוגמה" is skipped on import. People are matched by name, so every name must be different: a name already in the system is updated, a new name is added. A number in the file replaces that person's number and signs them out. **ייצוא לאקסל** writes the current list back out in the same layout, with the number column empty, because the numbers cannot be read back.

## Hosting

Any static host with HTTPS works. Publish the `site/` folder; there is nothing to build. The page sends plain-HTTP visitors to HTTPS, and notifications need it.

- **Netlify**: create a site from this repository. `netlify.toml` already tells it to publish `site/` and sets the security headers; every push to `main` updates the site.
- **GitHub Pages**: needs a public repository, or a paid GitHub plan for a private one. It cannot send custom headers, so the protections in `netlify.toml` (below) are missing there.

### Security headers

The page carries its own Content-Security-Policy (in `index.html`): scripts, styles, fonts and images only from the site itself, and connections only to the site and the Supabase project. Nothing can be loaded from another address unless it is added there.

`netlify.toml` adds the headers a page cannot set for itself: HTTPS only for a year (`Strict-Transport-Security`), no embedding in other sites (`frame-ancestors 'none'`, `X-Frame-Options`), no type guessing, a short referrer, and no camera, microphone, location or payment access. On another host, set the same headers there.

## Legal pages, consents and cookies

The privacy policy, terms of use, accessibility statement and cookies page, the "I agree" boxes and the cookie notice are all driven by the files in `site/content/legal/`. Its `README.md` explains how to edit a text, add a page, add a consent type, or add an analytics tool that loads only after consent. `LEGAL_TODO.md` at the top of the repository lists what must be filled in and reviewed first.

## Changing the database

Edit `schema.sql` and run it again, in the Supabase SQL Editor or through the Management API (`POST /v1/projects/{ref}/database/query`). It only creates what is missing and replaces the functions, so existing data stays.

To check the security setup, use **Advisors → Security** in the Supabase dashboard. It lists every `sadran_*` function as callable by the public key; that is intended, since each one checks the sign-in first.

## Privacy

- The site keeps the minimum: a name, a hashed sign-in number, roles, availability and rosters. It asks for no email address, phone number, ID number or payment details.
- A filled-in employee list is personal data. Prefer random codes as personal numbers rather than phone or ID numbers, keep filled-in copies of the Excel file out of repositories, and delete them after the import.
- Deleting an employee deletes their availability, notes, consent records, notification subscriptions and sessions. Failed sign-in attempts are deleted after a day and reminder records after 90 days.
- The database is in the Supabase region chosen when the project was created (this project: Tokyo). That is outside Israel; see `LEGAL_TODO.md`.
