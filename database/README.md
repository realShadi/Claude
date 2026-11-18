# Sadran: data and hosting

Sadran (`site/index.html`) is the weekly shift scheduler. This folder holds what it needs around the page itself: the database definition and the Excel layout for the employee list.

| File | What it is |
|---|---|
| `schema.sql` | The database: tables, sign-in checks and the functions the site calls. Safe to run again. |
| `employees-template.xlsx` | The layout for the employee list (name and personal number), for import in the app. |

## How it fits together

```
phone / computer ──► site/index.html ──► Supabase project (xdjeijflnutqoxzzodqh)
                     (any static host)    private "sadran" schema + sadran_* functions
```

- The site is one HTML file with no build step. It talks to Supabase with the project's **publishable key**, which is written into the page. That key is meant to be public: it can only call the `sadran_*` functions.
- Every function checks a sign-in before it reads or writes anything:
  - **Employees** sign in with their name and personal number. They see their own availability, their teammates' names and published rosters. They can change only their own availability.
  - **The manager** signs in with the manager code. The manager sees and changes everything.
- The tables live in a private schema the Data API does not expose, with row-level security turned on and no policies, so nothing can read them directly.
- The manager code is stored only as a bcrypt hash. Ten wrong attempts on one name, or on the manager code, block further attempts for 15 minutes.
- Changes are saved automatically about a second after the last edit. Other devices pick them up within about 30 seconds, or right away when the page is opened or brought back to the front. If the connection drops, the header shows "לא נשמר" and the change is sent when it returns.

Inside the Claude viewer, pages cannot reach outside services, so the same file runs there as a one-device demo with example data, saved in that browser only.

## First run

1. Open the hosted site. A new database opens on **הגדרה ראשונה**: choose the manager code (6 to 12 digits).
2. In **צוות**, import the employee list from Excel (**ייבוא מאקסל**) or add people one by one.
3. Check the roles, shifts and staffing in **הגדרות**.
4. Send the link to the team. Each person signs in with their name and personal number.

The first-run screen is open to whoever reaches the site first, so do step 1 before sharing the link.

## The employee list (`employees-template.xlsx`)

| Column | Required | Meaning |
|---|---|---|
| שם (name) | yes | What the employee types when signing in. |
| מספר אישי (personal number) | yes | 3 to 12 digits, different for every employee and from the manager code. Stored as text, so a leading zero is kept. |
| תפקידים (roles) | no | Role names exactly as they appear in the app's settings, separated by commas. |
| מקסימום משמרות בשבוע (max shifts per week) | no | A whole number from 1 to 7. Defaults to 5. |

Row 2 of the template is an example. Any row whose name contains "דוגמה" is skipped on import. On import, an existing number updates that employee and a new number adds one; a person whose number changed is matched by name. **ייצוא לאקסל** writes the current list back out in the same layout.

## Hosting

Any static host works. Publish the `site/` folder; there is nothing to build.

- **Netlify**: create a site from this repository. `netlify.toml` already tells it to publish `site/`, and every push to `main` updates the site.
- **GitHub Pages**: needs a public repository, or a paid GitHub plan for a private one.

## Changing the database

Edit `schema.sql` and run it again, in the Supabase SQL Editor or through the Management API (`POST /v1/projects/{ref}/database/query`). It only creates what is missing and replaces the functions, so existing data stays.

To check the security setup, use **Advisors → Security** in the Supabase dashboard. It lists every `sadran_*` function as callable by the public key; that is intended, since each one checks the sign-in first.

## Privacy

A filled-in employee list is personal data. Prefer short codes as personal numbers rather than phone or ID numbers, and keep filled-in copies of the Excel file out of public repositories.
