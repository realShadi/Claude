# Legal to-do before going live

The site now has the legal pages, the consent boxes, the cookie notice and the accessibility work in place. **None of the legal text has been reviewed by a lawyer.** It is a careful first draft, written to match what the site really does. This file lists what is still missing and what a lawyer has to look at.

Nothing here is legal advice. Where this file says what a law requires, treat it as a pointer for the lawyer, not as a conclusion.

Everything below is edited in `site/content/legal/` (see the `README.md` there). No code changes are needed for any of it.

## 1. Business details: filled in

File: `site/content/legal/business.json`. The details are those of **the business that operates the site** for all the stores, not of any one store. They were filled in on 20.11.2026 with the operator (version 2.1.1):

| Key | Value | Notes for the lawyer |
|---|---|---|
| `BUSINESS_NAME` | שאדי שמסנה | A private person, not yet registered as a business. |
| `BUSINESS_ADDRESS` | ירושלים | City only, by choice. Check whether a full address is required (privacy §1, terms §15). |
| `CONTACT_EMAIL` | shadicraft5@gmail.com | |
| `PRIVACY_CONTACT` | מפעיל האתר | |
| `SITE_URL` | https://sadran.netlify.app | Change it if a domain is added. |
| `HOSTING_PROVIDER` | Netlify, Inc. (ארצות הברית) | |
| `DATA_LOCATION` | יפן (טוקיו) | Where the database is today (section 3 below). |
| `RETENTION_PERIOD` | one year from the start of the week, then deleted automatically | Enforced by `sadran.purge_old()`, run nightly (`database/reminders.sql`). See item 2.4. |
| `MINORS_POLICY` | stores may add employees under 18 and are responsible for lawful employment | See item 2.5. |
| `COURT_DISTRICT` | מחוז ירושלים | |
| `ACCESSIBILITY_COORDINATOR` | שאדי שמסנה | |
| `ACCESSIBILITY_EMAIL` | shadicraft5@gmail.com | |
| `ACCESSIBILITY_RESPONSE_TIME` | 14 ימים | |
| `ACCESSIBILITY_AUDIT` | what was actually checked in November 2026, and that no certified accessibility professional has checked it yet | See item 2.9. |
| `PHYSICAL_ACCESSIBILITY` | no premises open to the public; the service is online only | |

Left out on purpose:

- **No business ID.** The operator is not registered as a business (עוסק) yet, and their personal ID number is deliberately not published. Once registered, add `BUSINESS_ID` back to `business.json` and to `placeholders` in `legal.json`, and put `{{BUSINESS_ID}}` back in privacy §1. Ask whether the operator should register before taking on stores.
- **No phone number.** Contact is by email only, on the privacy, terms and accessibility pages. Ask whether the accessibility regulations require a phone number for the accessibility coordinator, and whether email alone is enough elsewhere.

## 2. For the lawyer

Each item says what the draft does today, so the lawyer can confirm it or change it.

Section and regulation numbers are given as pointers. They were checked in November 2026 against published summaries and law-firm updates, not against the official text, so the lawyer should verify each one.

### Privacy (Protection of Privacy Law, 5741-1981, as amended by Amendment 13)

**2.1 The privacy policy as a whole** (`privacy.md`). It is written as the notice given when personal data is collected (section 11 of the law): who holds the data and how to reach them, what is collected and why, that giving it is voluntary and what happens without it, who receives it, and the rights to see and correct it. Please confirm it meets the notice requirements as they stand after Amendment 13 (in force since 14 August 2025), and that the description of rights in §11 of the policy is complete.

As understood, the amended section 11 requires the notice to say: whether giving the data is a legal duty or voluntary, and what happens on refusal (policy §4); the purpose (§5); the name and contact details of whoever controls the database (§1); who receives the data and why (§6, §7); and the rights of access and correction under sections 13 and 14 (§11).

**2.2 The basis for processing employees' data.** Employees are asked to tick "קראתי ואני מסכים/ה" on their first sign-in, and the answer is recorded. Consent given by an employee to an employer may carry little weight, because the employee is not free to refuse. Please advise whether the store should rely on consent, on notice and legitimate management needs, or on both, and whether the wording of the box and of privacy §4 ("האם חובה למסור את המידע") should change. Terms §6 puts on the manager the duty to tell employees before adding them; confirm that is enough.

**2.3 Data stored outside Israel.** The database is hosted by Supabase in **Tokyo, Japan**. Supabase has no region in Israel, so the data is abroad whatever region is chosen. Privacy §7 and §8 say so. Please confirm that the transfer meets the Privacy Protection (Transfer of Data to Databases Abroad) Regulations, 5761-2001, which destination is preferable, and whether a written undertaking from the provider (its data processing agreement) must be signed and kept. See also section 3.

Pointers: regulation 2(8) allows a transfer to a country that is party to Convention 108 (EU member states) or that receives data from EU member states on the same terms (countries with an EU adequacy decision, which Japan has; no statement by the Authority about Japan specifically was found). Regulation 3 requires a written undertaking from the recipient to protect the data and not to pass it on.

**2.4 How long data is kept.** The site deletes failed sign-in attempts after a day, reminder records after 90 days, and everything about an employee when the manager removes them. Availability and rosters are now deleted automatically a year after the start of their week (`sadran.purge_old()`, nightly), as privacy §10 says. Please confirm a year is right, taking into account how long an employer may need scheduling records (stores can export rosters to keep their own copies) and the duty not to keep more data than needed.

**2.5 Employees under 18.** Stores often employ teenagers. `MINORS_POLICY` now says stores may add employees under 18 and are responsible for employing them lawfully. Please confirm the wording, and advise whether a parent's consent is needed before a minor's details are entered or before the minor agrees to the terms.

**2.6 Registration, officer and security duties.** Please confirm that a store of this size does not have to register the database or appoint a privacy protection officer, and say which security level of the Privacy Protection (Data Security) Regulations, 5777-2017 applies and which documents it requires (for example a database definition document and a security procedure). The technical measures in place are listed in section 5.

Pointers: after Amendment 13, registration (section 8א) and a privacy protection officer (section 17ב1) appear to apply to public bodies, data brokers and large-scale processing of especially sensitive data. That did not describe a single store; please check it again for an operator that holds the data of many stores. Under the security regulations the likely level is basic (or "managed by an individual" if at most the owner and two others have access). Basic-level duties include a database definition document, a security procedure, access permissions, an incident log, and a written agreement with outside processors such as the cloud provider (regulation 15).

**2.7 Free-text notes.** Employees can write a note to the manager with their availability. The site asks them, next to the field and in both documents, not to write sensitive information such as medical details. Confirm that is sufficient.

### Terms of use (`terms.md`)

**2.8 The terms as a whole**, and in particular: §3 (opening a store), §7 (the automatic roster is only a suggestion, and the site does not check labour-law limits), §11 (limitation of liability), §13 (how changes take effect) and §14 (governing law and court). These are standard-form terms, so clauses that limit liability or fix a court may be open to challenge under the Standard Contracts Law, 5743-1982.

The scheduler treats two shifts on the same day as normal for everyone, and the weekly maximum can go up to every shift in the week. The minimum rest set by the manager applies between different days only. The site does not check daily or weekly working hours or rest periods against the Hours of Work and Rest Law; §7 says the employer stays responsible for that. Please confirm the wording is enough for a store that schedules double shifts.

Who the "site operator" is should also be confirmed: the draft now assumes one operator runs the site for many stores (items 2.12 to 2.15).

### Accessibility (`accessibility.md`)

**2.9 Whether the service-accessibility rules apply, and the statement.** The site is used by the store's own manager and employees, not by the public. Please confirm whether the Equal Rights for Persons with Disabilities (Service Accessibility Adjustments) Regulations, 5773-2013 (regulation 35, Israeli Standard 5568) apply to it, or only the duty to accommodate employees, and whether any small-business exemption is relevant. The statement is written to be accurate either way: it says the business *works to* meet the standard at level AA, lists what was done and the known limits, and gives a contact.

Pointers: regulations 35 and 35א (SI 5568 at level AA; the current edition of the standard still adopts WCAG 2.0), 35ה (what the statement must contain) and 35ו (exemptions: an exempt dealer, or average yearly turnover up to NIS 100,000; the higher tiers are conditional and published sources disagree about them). No official statement was found on whether a staff-only tool counts as a service to the public.

What was checked, and what was not, so `ACCESSIBILITY_AUDIT` can be written truthfully:

- Checked automatically (axe-core 4.14, rules for WCAG 2.0, 2.1 and 2.2 at levels A and AA): every screen and dialog, in light and dark, on phone and desktop widths, under all seven colour themes and two custom colours. No violations remain.
- Checked by script: full keyboard use with a visible focus mark, focus kept inside dialogs and returned afterwards, layout at 320 px wide and with enlarged text spacing, and colour contrast for every colour pairing in 180 theme variations.
- **Not checked:** use by a person with a screen reader (NVDA, JAWS, VoiceOver, TalkBack), voice control, or screen magnification. Automated tools find only part of the problems. An accessibility consultant (מורשה נגישות שירות) should test the site before the statement claims conformance.
- Known limits, already listed in the statement: the PDF and JPEG exports of the roster are images; the team availability table is dense on small screens; notifications depend on the browser.

**2.10 The contact person.** Confirm whether the store must name a formal accessibility coordinator (רכז נגישות) or may name any contact person, and what response time to promise. As understood, a coordinator is mandatory only for a business with 25 or more employees.

### Cookies (`cookies.md`)

**2.11** The site sets no cookies and loads nothing from third parties. It stores a few items in the browser that it needs in order to work, listed on the cookies page from `legal.json`. The notice at the bottom of the screen therefore only informs. Please confirm that an informational notice is appropriate for strictly necessary storage. As understood, no Israeli statute requires a cookie banner; the general notice and consent rules of the Privacy Law apply, and the Privacy Protection Authority has recommended a separate opt-in for cookies that are not essential, which is what the site does. If an analytics or advertising tool is ever added, the notice becomes a real choice and the tool loads only after consent (see the folder's `README.md`).

### One site, many stores

The site used to serve a single store. It is now a service: anyone can open a store on it, each store's data is separate, and the operator holds all of it. The drafts were updated for that, and this is the part that most needs a lawyer.

**2.12 Who is responsible for what.** The drafts say that each store decides what data about its employees is entered and is responsible for it, and that the operator holds the data for the stores and uses it only to run the site (privacy §1, terms §6). Please confirm this split under the Protection of Privacy Law (the owner of the database and the party holding it for them), and whether the operator needs a written data-processing agreement with each store (Data Security Regulations, regulation 15), or whether the terms can serve as that agreement and what they must then say.

**2.13 Opening a store is open to everyone.** A name and a manager code are all it takes: no approval, no payment and no check of who is opening it. Terms §2 and §3 have the person declare they may act for the store, and forbid misleading names and opening stores in bulk; the database also limits how many stores one source can open in a short time. Please confirm the wording, and say whether the operator should check who opens a store. If the service is ever sold, terms for paying customers will be needed.

**2.14 Store names are public.** The list of stores is shown to anyone who opens the site, so employees can find theirs, and a store's logo is shown on its sign-in screen. Privacy §3 and §6 say so. Please confirm that is acceptable, or whether stores should be reachable only through their own link.

**2.15 Closing a store.** A manager cannot close a store from the site. They ask the operator, who removes the store in the database (`select sadran.close_store('<store id>');`), which deletes everything of that store. Terms §12 and privacy §10 describe this. Please confirm the wording and what response time to promise. A "close my store" button can be added on request.

## 3. A decision for the owner: where the database is

The Supabase project was created in the **Tokyo** region. Two reasons to consider moving it to a European region (for example Frankfurt):

- **Law.** Data in the EU is the destination Israeli practice is most used to. The lawyer's answer to item 2.3 decides this.
- **Speed.** Tokyo is far from Israel, so every save and load takes noticeably longer than it would from Europe.

A project's region cannot be changed. Moving means creating a new project in the new region and pointing the site at it. The database is empty today, so there is nothing to migrate: run `database/schema.sql` and `database/reminders.sql` in the new project, set the two notification secrets, deploy the reminder function, and replace the project address and publishable key in `site/app.js` and in the Content-Security-Policy in `site/index.html`. Then update `DATA_LOCATION`.

## 4. Not applicable today, and what to do if that changes

### Marketing email or SMS (Communications Law, section 30A)

The site sends no marketing and collects no email addresses or phone numbers. The only messages are availability reminders, sent as browser notifications to people who switched them on.

The mechanism for marketing consent is built and **switched off**: a separate box that is never ticked in advance, the answer saved with its time and source, withdrawal in the privacy settings and by an unsubscribe link (see "Marketing messages" in the folder's `README.md`). Before switching it on (`"enabled": true` for `marketing` in `legal.json`), have the lawyer confirm:

- the wording of the consent sentence (`label`), and who may be asked. Today only the manager would be; offering it to employees raises the same question as item 2.2;
- that every message will carry what section 30A requires. As understood: an email must have the word **"פרסומת"** in its subject line, the sender's name, address and contact details, and notice of the right to refuse with a simple way to do it, which is the unsubscribe link; an SMS must carry the sender's name and contact details for refusing. The law sets damages of up to NIS 1,000 per message sent in breach, without proof of harm;
- whether the people to be contacted gave prior explicit consent, which is what the stored record shows, or fall under the narrow exception for existing customers;
- that the sending tool takes its recipients only from `sadran.consent_recipients('marketing')`, so a person who withdrew is never contacted again;
- the changes needed in `privacy.md`: §3 ("מה לא נאסף") and §5 ("המידע אינו משמש לדיוור שיווקי") would no longer be true.

### Selling anything (Consumer Protection Law)

Nothing is sold through the site and there is no payment. If that changes:

- show the full price, including VAT and delivery, before payment;
- add a cancellation and returns page (`returns.md`, see "Adding a page" in the folder's `README.md`) covering the 14-day right to cancel a distance sale and how to use it;
- make the purchase form carry its own unticked agreement box. A required consent with its own `id` in `legal.json` gives the stored record; showing it on a checkout form is a small code change;
- take payment only through a payment provider's hosted page or fields. Card numbers must never reach the site or its database.

### Analytics, advertising or any other third-party tool

Follow "Cookies and what the site stores" in the folder's `README.md`: register the tool in `legal.json` so it loads only after consent, allow its address in the Content-Security-Policy, raise the cookie list version, and update `privacy.md` and `cookies.md`, which both currently say there is none.

## 5. Security measures in place (for the lawyer's review of item 2.6)

- HTTPS only: the page redirects plain HTTP, and the host is told to refuse it for a year (`Strict-Transport-Security` in `netlify.toml`).
- A strict Content-Security-Policy: scripts, styles, fonts and images only from the site itself; connections only to the site and its database. The site cannot be embedded in another site.
- The manager code and the employees' personal numbers are stored only as bcrypt hashes. Nobody can read them back, the manager included. Sign-in sessions are stored as hashes and expire after 30 days without use.
- Ten wrong sign-in attempts block further attempts for 15 minutes.
- The database tables cannot be read directly. Every request goes through a function that first checks who is signed in: an employee can change only their own availability.
- No secret key is in the site's code. The one key there is the database's publishable key, which is meant to be public.
- Minimal data: a name, a hashed sign-in number, roles, availability and rosters. No email, phone, ID number, address, location or payment details.
- No third-party requests: fonts and libraries are served from the site itself.

Not covered by the site, and still the owner's job: who knows the manager code, access to the Supabase and hosting accounts (use two-step sign-in on both), and what happens to filled-in Excel lists of employees.

## 6. After the review

1. Apply the lawyer's changes to the `.md` files and to `business.json`.
2. In `legal.json`, set `"reviewed": true` and today's date in `updated` for each approved page.
3. If the text people agreed to has changed, raise `version` of the `terms` consent. Everyone is then asked to agree again on their next visit.
4. Open the site and check that **הגדרות → מסמכים משפטיים** shows no missing details and no page marked "טרם אושר על ידי עורך/ת דין".
