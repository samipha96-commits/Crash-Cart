# Crash Cart

Crash cart checks, stock and expiry tracking for hospitals, on the web and on phones.

One app serves many hospitals. Each hospital has its own carts, item list, staff and check history,
and nobody can see another hospital's data. A person can belong to several hospitals (for example a
pharmacist covering two sites) and switch between them.

## What it does

- **Hospital portals.** The **Super admin** creates each hospital's portal with its own UI design
  (Classic, Clinical, Modern, Friendly, Executive: menu position and colour, card style, typeface,
  shapes, spacing, all fine-tunable), colours and logo, and its wards (one crash cart per ward).
- **Item list per hospital.** Code, Description, Strength, Generic and Category (the hospital's own
  categories or the defaults), kept by the Hospital admin. Exportable to CSV.
- **Wards and crash carts.** Each ward's cart has floors (drawers) holding items with an approved
  quantity, lot number and expiry date. The ward's Hospital admin sets the items.
- **Nurses.** No checking in the app: the Wards tab gives the ward's item list as CSV to check the
  cart against, and shows when the pharmacy last checked it or that a check is due. The Checks tab
  shows the pharmacy's submissions with their issues and whether they are closed. Nurses update
  expiry dates in the Expiry tab.
- **Pharmacist audits.** Pharmacists audit their wards' carts monthly with the same checklist,
  close every observation with the action taken, then send the audit to the Pharmacy manager, who
  reviews and closes it (or sends it back).
- **Reports tab.** Per ward or all wards, in the hospital's *CRASH AUDIT* workbook format:
  - *One month*: percentage summary per ward (approved, available, % availability, near expiry,
    expired, below and above standard, % variation, remarks) and each ward's item sheet
    (ITEMS / QTY / QTY PRESENT / EXPIRY / REMARKS by drawer).
  - *Several months*: the same, with a monthly summary per ward and one *Remarks* column for each
    selected month.
  - Every report has an overall performance gauge and a comparison with the previous month (or
    across the selected months), and exports to Excel (.xlsx) or prints to PDF.
- **Expiry tracker.** Every item in your wards, soonest expiry first.

### Who can do what

| ID | Wards | Can do |
| --- | --- | --- |
| Super admin | all hospitals | Create hospital portals (look, logo), wards, and any ID, including several Hospital admins per hospital |
| Hospital admin | some or all wards (set by Super admin) | Set crash cart items of their wards; create nurse and pharmacist IDs inside their wards |
| Nurse | exactly one ward | Item list (CSV), update expiry dates, see the pharmacy's checks |
| Nursing manager | all wards | The same for every ward |
| Pharmacist | some or all wards | Monthly audits, close observations, restock lot/expiry, reports of their wards |
| Pharmacy manager (was Quality) | all wards | Review and close audits, reports of every ward |

Only the Super admin and Hospital admins see the Staff tab. The rules are enforced in the database
(row-level security), not only in the app.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # logic tests
npm run build      # production build in dist/
```

With no configuration the app runs in **Demo mode**: a Super admin, two themed sample hospitals,
one sample account for every role (password `demo1234`) and four months of pharmacist audits so the
Reports tab has history to compare, stored in the browser only. Use it to try the app; nothing is shared between devices.

## Connect a real database (shared between devices and hospitals)

The app uses [Supabase](https://supabase.com) (hosted Postgres with sign-in) for real use.

1. Create a Supabase project.
2. In the SQL editor, run [`supabase/migrations/0001_crash_cart.sql`](supabase/migrations/0001_crash_cart.sql), then
   [`0002_roles_wards_reports.sql`](supabase/migrations/0002_roles_wards_reports.sql) (existing *Quality* users become
   *Pharmacy manager*, *Manager* becomes *Nursing manager*; existing staff keep access to all wards).
   It creates the tables and the row-level security rules that keep each hospital's data private
   and enforce the roles above in the database itself, not just in the app.
3. Copy `.env.example` to `.env.local` and fill in the project URL and anon (publishable) key from
   *Project settings → API*.
4. In *Authentication → URL configuration*, add the address where you host the app.
5. Sign up in the app with the email you'll use as Super admin and confirm it, then in the SQL editor run:

   ```sql
   insert into super_admins (email) values ('you@example.org');
   ```

The Super admin creates each hospital and adds staff by email with their role from **Staff & rights**.
People join automatically when they sign up or sign in with that email. Anyone else who signs up sees
"Waiting for access" and can do nothing until the Super admin adds them.

## Put it online

The build is a static site (`dist/`), so any static host works. On Vercel, import the repository,
add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables and deploy;
`vercel.json` is already set up.

## Mobile

**Install from the browser (no app store).** The app is a Progressive Web App. On iPhone open the site in
Safari, tap Share, then *Add to Home Screen*. On Android open it in Chrome and tap *Install app*. It then
opens full screen like a native app and the app shell works offline.

**Native Android / iOS apps (for the app stores).** The same build is wrapped with
[Capacitor](https://capacitorjs.com):

```bash
npm install @capacitor/android @capacitor/ios
npx cap add android      # needs Android Studio
npx cap add ios          # needs a Mac with Xcode
npm run cap:sync         # build the web app and copy it into the native projects
npx cap open android     # or: npx cap open ios
```

## Project layout

```
src/lib/api.ts              business logic (carts, checks, expiry, staff)
src/lib/backend/            storage: supabase.ts (cloud) and local.ts (demo, same rules)
src/lib/catalog.ts          starter items, roles and permissions
src/pages/                  screens
supabase/migrations/        database schema and security rules
legacy/                     the earlier CartCheck build this app is based on
```
