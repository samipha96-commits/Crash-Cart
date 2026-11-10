# Crash Cart

Crash cart checks, stock and expiry tracking for hospitals, on the web and on phones.

One app serves many hospitals. Each hospital has its own carts, item list, staff and check history,
and nobody can see another hospital's data. A person can belong to several hospitals (for example a
pharmacist covering two sites) and switch between them.

## What it does

- **Carts with floors.** Each cart has floors (drawers) holding items with a par quantity, lot number
  and expiry date. New hospitals can start with three standard adult carts (ICU, Emergency, Ward).
- **Checks.** Daily seal checks, monthly full checks, quarterly audits and after-code restocks. Staff go
  floor by floor and mark each item OK, short, missing, expired, expiring or damaged. Items whose
  recorded expiry has passed are flagged automatically. A check moves from *in progress* to
  *awaiting review* to *closed*, with remarks and seal numbers kept on the record.
- **Expiry tracker.** Every item in every cart, soonest expiry first, with a per-hospital warning
  window (30 days by default). Pharmacy updates the date and lot when they replace stock.
- **Dashboard.** Carts due a daily check, checks waiting for review, expired and expiring items.
- **Reports.** CSV export and print view for any check and for the expiry list.
- **Roles.** A single **Super admin** (the platform owner) is the only one who can create hospitals
  and give anyone access or change their role. Inside each hospital:

  | Role | Can do |
  | --- | --- |
  | Hospital admin | Carts, item list, checks, review, hospital settings (not staff rights) |
  | Pharmacy | Restock carts (quantities, lots, expiry dates), maintain the item list, run checks |
  | Nurse | Run checks |
  | Quality | Run checks, review and close them |
  | Manager | View everything, review and close checks |

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # logic tests
npm run build      # production build in dist/
```

With no configuration the app runs in **Demo mode**: a Super admin, two sample hospitals and four
sample staff accounts, stored in the browser only. Use it to try the app; nothing is shared between devices.

## Connect a real database (shared between devices and hospitals)

The app uses [Supabase](https://supabase.com) (hosted Postgres with sign-in) for real use.

1. Create a Supabase project.
2. In the SQL editor, run [`supabase/migrations/0001_crash_cart.sql`](supabase/migrations/0001_crash_cart.sql).
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
