# Database

Data files for the Sadran shift scheduler (`artifacts/interactive/sadran-shift-scheduler.html`).

## What is here

| File | What it is |
|---|---|
| `employees-template.xlsx` | The layout for the employee list: one row per employee with a name and a personal number. Fill it in and import it in the app. |

## The employee list

| Column | Required | Meaning |
|---|---|---|
| שם (name) | yes | What the employee types when signing in. |
| מספר אישי (personal number) | yes | 3 to 12 digits, different for every employee. Stored as text, so a leading zero is kept. |
| תפקידים (roles) | no | Role names exactly as they appear in the app's settings, separated by commas. |
| מקסימום משמרות בשבוע (max shifts per week) | no | A whole number from 1 to 7. Defaults to 5. |

Row 2 of the template is an example. Any row whose name contains the word "דוגמה" is skipped on import.

## How the app uses it

1. Sign in as manager, open the **צוות** tab and choose **ייבוא מאקסל**.
2. The app shows what will change before anything is saved: new employees, updates, and rows it cannot import.
3. An existing number updates that employee. A new number adds an employee. If a person's number changed, they are matched by name.
4. **ייצוא לאקסל** writes the current list back out in the same layout.

Employees sign in with their name and personal number. The manager signs in with the manager code, which is set in the **הגדרות** tab.

## Where the data lives today

The app keeps its data in the browser's local storage on each device. Nothing is written to this repository by the app, and nothing is shared between devices: an employee's availability stays on their own phone until the app is connected to a shared database.

Sign-in is checked in the browser, so it keeps people in their own view but does not protect the data.

## Privacy

This file is for a real staff list, so treat a filled-in copy as personal data. Prefer a short code as the personal number rather than a phone or ID number, and keep filled-in copies out of public repositories.
