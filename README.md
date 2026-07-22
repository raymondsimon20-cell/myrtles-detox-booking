# Myrtle's Detox Spa — Booking Site

Customers pick a service, choose an open time on the calendar, and reserve it with the required deposit ($75, or the full price if the service costs less). The owner has a private admin page to see all bookings, confirm deposits, block off times, and add flex-hour/Sunday bookings.

## How it works

**Customer page (`/`)**
1. Pick a service (real prices and deposits are built in).
2. Pick a date (Mon–Thu, 10 AM–5 PM last appointment) and an open time slot.
3. Enter name + phone/email.
4. Pay the deposit:
   - **PayPal / Venmo online** (once PayPal is set up) → confirmed instantly, or
   - **Zelle / Cash App / PayPal handle / cash** → the slot is held as "awaiting deposit"; the customer sees the payment instructions (Zelle: myrtle.rogers724@gmail.com, Cash App: 340-513-2343, PayPal: MyrtleRogers296) and the owner confirms once the money arrives.
5. All deposit policies (non-refundable, $50 late-cancel/no-show, Sundays prepaid + $25 flex fee, etc.) are shown on the page.

**Owner admin page (`/admin.html`)** — password protected
- Month calendar showing every booking and block, color-coded.
- Click a day: confirm "awaiting deposit" bookings, cancel bookings, block/unblock single slots or the whole day.
- Add bookings manually at ANY day/time (flex hours, Sundays, phone bookings).

**Tech:** static site + Netlify Functions + Netlify Blobs (built-in storage — nothing else to sign up for). PayPal is optional; the site works fine before it's configured.

## Deploy (one-time setup, ~15 minutes)

### 1. Create the GitHub repo
1. Go to https://github.com/new → name it `myrtles-detox-booking` → Create (keep it **private**).
2. On your computer, in this project folder:
   ```
   git init
   git add .
   git commit -m "Initial booking site"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/myrtles-detox-booking.git
   git push -u origin main
   ```

### 2. Create the Netlify site
1. Go to https://app.netlify.com → **Add new site → Import an existing project** → pick the GitHub repo.
2. Build settings are read automatically from `netlify.toml` — just click **Deploy**.
3. In **Site configuration → Environment variables**, add:
   - `ADMIN_PASSWORD` = a strong password for the owner's admin page (required)
4. Done — the site is live at `https://YOUR-SITE.netlify.app`. The admin page is at `/admin.html`.

### 3. (Optional) Enable email notifications (Gmail)

Customers get "slot held" (with payment instructions), "confirmed", and "cancelled" emails; the owner gets an email for every new booking.

1. On the owner's Google account, turn on 2-Step Verification (https://myaccount.google.com/security).
2. Go to https://myaccount.google.com/apppasswords → create an app password named "Booking site" → copy the 16-character password.
3. In Netlify → Site configuration → Environment variables, add:
   - `GMAIL_USER` = the Gmail address (e.g. myrtle.rogers724@gmail.com)
   - `GMAIL_APP_PASSWORD` = the 16-character app password
   - `OWNER_EMAIL` = (optional) where new-booking alerts go, if different from GMAIL_USER
4. Trigger a redeploy. Without these vars the site works normally, just without emails.

### 4. (Optional, later) Enable online PayPal/Venmo deposits
1. The owner creates a free **PayPal Business** account at https://www.paypal.com/business (can use the existing MyrtleRogers296 account).
2. Go to https://developer.paypal.com → **Apps & Credentials** → **Live** → Create App → copy the **Client ID** and **Secret**.
3. In Netlify environment variables add:
   - `PAYPAL_CLIENT_ID` = the Client ID
   - `PAYPAL_SECRET` = the Secret
   - `PAYPAL_ENV` = `live`
4. Redeploy (Deploys → Trigger deploy). PayPal/Venmo buttons now appear at checkout and deposits confirm bookings instantly.
   - To test first without real money, use the **Sandbox** credentials and leave `PAYPAL_ENV` unset.

## Everyday use (for the owner)

- Open `https://YOUR-SITE.netlify.app/admin.html`, enter the admin password.
- Yellow **awaiting deposit** bookings: when a Zelle/Cash App payment arrives, click **"Deposit received ✓"** to confirm.
- If a deposit never arrives, click **Cancel** to free the slot.
- Block a vacation day with **"Block whole day"**, or block single hours.
- Sundays/flex hours: collect prepayment (+$25 flex fee), then add the booking with the "Add a booking yourself" form.

## Changing services, prices, or hours

Edit `netlify/functions/utils/config.js` (services, deposits, hours, policies, payment handles), commit, and push — Netlify redeploys automatically.

## Notes & limits

- Bookings and blocks are stored in Netlify Blobs under the key `slot:<date>:<time>`; a slot can hold one booking or one block, which prevents double-booking.
- Online-payment holds expire after 15 minutes if the customer abandons checkout, so slots aren't lost.
- "Awaiting deposit" holds do NOT expire — the owner decides (confirm or cancel). This matches "appointments confirmed as deposits are received."
- The $50 missed-appointment fee is policy text only; since deposits are non-refundable and at least $50 for every service, it's covered by keeping the deposit.
- Slot length is 60 minutes (`slotMinutes` in config).

## Photo credits

Logo from the spa's YouTube channel. Owner-provided photos: body-analysis.jpg (Quantum Resonance poster), colonic.jpg (LIBBE device), hydromassage.jpg, foot-detox.jpg.

Remaining photos are free-licensed (Creative Commons via Openverse):

- consultation.jpg: "Nutritionist displaying fresh fruits..." by nenadstojkovicart (CC BY) — flickr.com/photos/202846129@N03/54538370547
- colonic-abd.jpg: "Total care and relaxation" by Scubaspa Maldives (CC BY) — flickr.com/photos/145748390@N03/30273731091
- body-wrap.jpg: "Spa treatment room portrait" by bloggeratlarge (CC0) — flickr.com/photos/184934270@N04/52262895342
- sauna.jpg: "Sauna at Hotel Arthur" by Hotel Arthur Helsinki (CC BY) — flickr.com/photos/88467564@N06/9314082768
- body-part-manip.jpg: "massage" by Collin Parker (CC BY) — flickr.com/photos/158282012@N07/43781411011

To swap any photo: replace the file in `public/img/` (640×480 works best), keep the same filename.

## Local development

```
npm install
npx netlify dev
```
Set env vars in a `.env` file or via `netlify env:set`.
