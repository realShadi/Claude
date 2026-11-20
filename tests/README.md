# Tests

Browser tests for what must keep working as the site changes: the legal pages, the consent boxes and cookie choices, accessibility, and safety against injected markup. They run against the single-file demo (example data, one device), so they need no database and change nothing.

```bash
cd tests
npm install
npx playwright install chromium
npm test
```

| File | What it checks |
|---|---|
| `contrast.test.js` | Colour contrast of every text and field-outline pairing, for all preset themes and a sweep of custom colours, light and dark (WCAG 1.4.3, 1.4.11). No browser needed. |
| `legal.test.js` | Legal pages and placeholders, footer and form links, the agreement screen (unticked box, record with version, time and source, asked again on a new version), the cookie notice and settings. |
| `consent.test.js` | With an analytics script and the marketing consent switched on in a copy of the registry (`variant.py`): nothing optional loads before consent, choices are kept and can be withdrawn, and the marketing opt-in is separate, unticked and recorded. |
| `keyboard.test.js` | Keyboard-only use, visible focus, dialogs, form errors tied to fields, layout at 320 px and with wide text spacing, control sizes. |
| `injection.test.js` | Markup and script typed into names, notes and settings, or placed in the legal files, is shown as text and never runs. |
| `embed.test.js` | The demo inside a sandboxed frame with no storage and form submission forbidden, the strictest way a viewer might embed it: links, dialogs, the agreement and sign-in still work. |
| `schedule.test.js` | Scheduling rules and data safety: the weekly maximum up to every shift in the week, two shifts a day only for people marked for it, part-shift availability, exports without roles, data from an earlier version kept through an update, and backup and restore, including a hostile backup file. |
| `axe.test.js` | axe-core on every screen and dialog, light and dark, phone and desktop. Pass a theme as a third argument to audit another colour theme: `node axe.test.js both mobile '{"preset":"forest"}'`. |

`axe.test.js` also prints items the tool could not judge by itself ("review"): text on the role highlight colours (covered by `contrast.test.js`) and the `+`/`−` buttons (named with `aria-label`).

Run them after changing anything in `site/` or `site/content/legal/`.
