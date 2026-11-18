# Legal content

Everything legal on the site is in this folder. The app reads these files when it loads and has no legal text of its own, so editing a text, a business detail or a consent never needs a code change.

| File | What it holds |
|---|---|
| `business.json` | The business details that fill the placeholders in the texts. **Start here.** |
| `legal.json` | The registry: which pages exist, which consents are asked for, and what the site stores in the browser. |
| `privacy.md`, `terms.md`, `accessibility.md`, `cookies.md` | The texts, in Hebrew. |

`../../../LEGAL_TODO.md` lists every placeholder and everything a lawyer still has to review.

## Filling in the business details

Open `business.json` and fill in the empty values. Wherever a text has `{{BUSINESS_NAME}}`, the site shows the value of `BUSINESS_NAME`.

A value that is still empty shows on the site as a yellow note, for example **[להשלים: שם העסק המלא]**, so an unfinished document can never be mistaken for a finished one. The manager also sees the list of what is missing under **הגדרות → מסמכים משפטיים**.

To add a new detail, add a key to `business.json` and a matching Hebrew label to `placeholders` in `legal.json`, then use `{{YOUR_KEY}}` in any text.

## Editing a text

The texts are Markdown, a small part of it:

- `# Title`, `## Section`, `### Sub-section`
- paragraphs, `- ` bullet lists, `1. ` numbered lists
- `**bold**`
- links: `[text](#privacy)` to another legal page, `[text](https://…)`, `[text](mailto:…)`, `[text](tel:…)`

Anything else is shown as plain text. HTML is not interpreted, on purpose: a text or a business detail cannot inject markup into the page.

After a change that matters to the people who use the site:

1. Update `updated` (and `version`) for that page in `legal.json`. The date is shown at the top of the page.
2. If people should **agree again**, also raise `version` of the `terms` consent (see below). Everyone is then asked on their next visit.
3. Set `reviewed` to `true` once a lawyer has approved the text. Until then the settings screen marks the page as not yet reviewed.

## Adding a page

For example a returns and cancellation page:

1. Write `returns.md` in this folder.
2. Add it to `pages` in `legal.json`:

   ```json
   { "id": "returns", "title": "ביטול עסקה והחזרות", "file": "returns.md", "version": "1.0", "updated": "2026-12-01", "footer": true, "reviewed": false }
   ```

The page is then served at `#returns`, linked from the footer of every screen (`"footer": true`) and listed in the settings. Other texts can link to it with `[ביטול עסקה](#returns)`. `id` uses lowercase letters, digits and hyphens.

## Consents

Each entry of `consents` in `legal.json` is one thing a person can agree to. The answer is saved in the database (`sadran.consents`) with the person, the version of the text, the time, and the screen it was given on. Nothing is overwritten: every change is a new row, so there is a history.

| Field | Meaning |
|---|---|
| `id` | Short name, saved with every answer. Do not change it later. |
| `enabled` | `false` hides the consent completely. |
| `required` | `true`: the site cannot be used without it. Shown as a box that is never ticked in advance, on the first-run form and after the first sign-in. `false`: optional, a separate box, also never ticked in advance. |
| `version` | Raise it when the text behind the consent changes. For a required consent everyone is asked again. |
| `audience` | Who is asked: `"manager"`, `"employee"` or both. |
| `title` | Short name shown in the privacy settings. |
| `label` | The sentence next to the box. Links and `{{PLACEHOLDERS}}` work here too. |
| `fields` | For an optional consent: details to collect when the box is ticked, for example an email address. Saved with the answer. |

To add a consent type, add an entry. No code changes.

### Marketing messages

The `marketing` consent is defined but **switched off** (`"enabled": false`), because the site sends no marketing today. Read `LEGAL_TODO.md` before switching it on. When it is on:

- it is a separate optional box, apart from the terms, and never ticked in advance;
- the answer is saved with its time, its source screen and the address typed in;
- the person can withdraw it at any time under **הגדרות עוגיות** in the footer;
- every answer gets an unsubscribe code. A link of the form `https://<the site>/?unsubscribe=<code>` withdraws the consent without signing in. Put that link in every message.

The site itself does not send email or SMS. Whatever tool sends them must read the current recipients from `sadran.consent_recipients('marketing')`, which returns only people whose latest answer is yes, together with their unsubscribe code.

## Cookies and what the site stores

`cookies.categories` in `legal.json` drives three things: the notice at the bottom of the screen, the **הגדרות עוגיות** dialog, and the list on the cookies page (`{{COOKIE_TABLE}}` in `cookies.md`).

- `necessary` is always on. List everything the site stores under `items`, so the cookies page stays true.
- `analytics` and `marketing` are empty today. While every optional category is empty, the notice only informs ("הבנתי"). As soon as one has `items` or `scripts`, the notice becomes a real choice with **אישור הכול**, **רק מה שהכרחי** and **התאמה אישית**, and nothing in that category loads before the person allows it.

To add an analytics tool:

```json
{
  "id": "analytics",
  "title": "ניתוח שימוש",
  "description": "עוזר להבין איך משתמשים באתר כדי לשפר אותו.",
  "items": [ { "name": "_tool_id", "what": "מזהה ניתוח", "why": "סופר ביקורים באתר", "kept": "שנה", "cookie": true } ],
  "scripts": [ { "src": "https://analytics.example/script.js", "attrs": { "data-site": "…" } } ]
}
```

Then:

1. **Never add the tool's `<script>` tag to `index.html`.** A script listed here is loaded only after consent; a tag in the page would load for everyone.
2. Allow the tool's address in the Content-Security-Policy in `site/index.html` (`script-src`, and `connect-src` if it sends data). Without that the browser blocks it.
3. Raise `cookies.version`. Everyone is asked again, including people who dismissed the earlier notice.
4. Update `privacy.md` and `cookies.md`: both currently say the site has no analytics, advertising or tracking.

`"cookie": true` on an item means it is a real cookie with that name; it is deleted when the person withdraws consent. Withdrawing also reloads the page, so a script that was already running stops. The choice is kept for `renewAfterDays` days and then asked again.

## Checking a change

Open the site and look at the page; a missing detail is yellow. For the single-file demo, rebuild it: `python3 tools/build-demo.py out.html` (the texts are copied into it).
