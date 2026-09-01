# Taxi Almosafir — Company Handoff Guide

## Production URLs
- Customer booking: `https://taxi-almosafir.vercel.app/`
- Admin control center: `https://taxi-almosafir.vercel.app/admin`

## System architecture
Customer booking page → serverless booking API → persistent order storage → Telegram operations notification.

Admin control center → signed admin session → protected orders/config APIs → persistent storage.

## Main features
- Arabic-first customer experience with English switcher and RTL/LTR support.
- Map search, current location, fixed pickup pin and confirmed pickup flow.
- Centralized vehicle configuration shared by customer UI, booking validation and admin dashboard.
- Local/international phone validation and obvious fake-number rejection.
- Departure / arrival trip type.
- Telegram booking notifications with map location.
- Persistent order history with status timeline.
- Admin dashboard, analytics, filters, bulk status changes, manual orders and Excel export.
- Internal admin notes and order assignment history.
- Activity/audit view derived from order history.
- Fleet configuration and pricing-zone staging from admin settings.
- JSON backup export and system health view.

## Required Vercel Environment Variables
Store real values in Vercel only. Never commit secrets to Git.

### Telegram
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

### Persistent storage — preferred Supabase
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`

Legacy alternative:
- `SUPABASE_SERVICE_ROLE_KEY`

Optional fallback:
- `BLOB_READ_WRITE_TOKEN`

### Admin security
Set all three before formal ownership transfer:
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD_SHA256` or `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET` — long random secret, unique to production

After changing admin environment variables, redeploy production so the new values are active.

## Database setup
Run `supabase/orders-schema.sql` once in the Supabase SQL editor. The schema keeps customer order data server-only and denies browser-role access.

If the database was created before trip type support, apply the `trip_type` and `trip_label` additions included in the current schema. The backend contains a legacy compatibility fallback during migration.

## Admin status values
- `new` — new order
- `confirmed` — confirmed
- `completed` — completed
- `cancelled` — cancelled

Internal notes and assignments are stored as timestamped events in each order history and do not appear to the customer.

## Fleet management
Vehicle settings are centralized. Each vehicle supports:
- internal booking name
- Arabic/English display labels
- class
- passenger capacity
- luggage capacity
- image path
- Arabic/English description
- active/inactive state
- display order

Disabling a vehicle is preferred over deleting it when historical bookings exist.

## Pricing management
Pricing zones are staged in central configuration and remain hidden from public output while pricing is disabled. Enable pricing only after the final zone list and prices are approved and the customer price calculation flow is connected.

## Security checklist before company delivery
1. Rotate the admin username/password and session secret through Vercel Environment Variables.
2. Confirm the Telegram token belongs to the company-controlled bot/group.
3. Confirm Supabase/Vercel storage is company-owned.
4. Confirm `/api/orders` returns `401` without a valid admin session.
5. Confirm the admin System Health page reports storage and Telegram as connected.
6. Export a JSON backup and Excel order report as a final handoff test.
7. Test one Arabic booking and one English booking end-to-end.

## Key project files
- `index.html` — customer booking UI
- `assets/i18n.js` — customer localization
- `assets/vehicle-config.js` — centralized fleet renderer
- `admin.html` — admin control center
- `assets/admin.js` — main dashboard logic
- `assets/admin-final.js` — settings, audit and handoff enhancements
- `api/book.js` — booking endpoint + Telegram
- `api/orders.js` — protected admin orders API
- `api/config.js` — centralized public/admin configuration API
- `lib/orders.js` — persistent order storage abstraction
- `lib/config.js` — central company/fleet/pricing configuration
- `lib/admin-auth.js` — signed admin sessions
- `supabase/orders-schema.sql` — database schema

## Ownership transfer
Transfer or grant company access to the GitHub repository, Vercel project, domain/DNS account, Telegram bot/group, and persistent storage project. Rotate all credentials after the transfer and keep secrets only in the hosting provider’s Environment Variables.
