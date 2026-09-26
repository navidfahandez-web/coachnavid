# coachnavid.com — padel lesson booking

Landing page for Coach Navid Fahandezh's padel lessons in Klaipėda and Palanga, Lithuania. Students pick a day, a lesson
length (1h / 1h 30 / 2h) and a start time between 10:00 and 17:00 (Lithuanian time). Navid gets the
request on WhatsApp and taps **Yes** or **No**. A confirmed lesson blocks the slot for everyone else
until it's cancelled.

```
index.html, assets/          the page (plain HTML/CSS/JS, no build step)
shared/rules.js              booking rules used by both the page and the server
netlify/functions/
  availability.mjs           GET  /api/availability   busy times for the calendar (no student data)
  bookings.mjs               POST /api/bookings        new request → WhatsApp to Navid
                             GET  /api/bookings/:id    status the student's page polls
  whatsapp-webhook.mjs       /api/whatsapp             Navid's replies (Yes / No / CANCEL / LIST)
netlify/lib/                 storage (Netlify Blobs) + WhatsApp Cloud API helpers
```

## How a booking works

1. The student sends a request. The slot is **held** (nobody else can request it) for up to 24h
   while Navid decides.
2. Navid gets a WhatsApp message with the student's name, phone and the time, plus **Yes, confirm**
   and **No, decline** buttons.
3. **Yes**: the lesson is confirmed and the slot stays blocked. **No**, or no answer within 24h: the slot opens again.
4. The student's page updates by itself (it checks every few seconds), and they can come back later to see the status.

### WhatsApp commands (send these from Navid's phone)

| Message | What it does |
|---|---|
| tap **Yes, confirm** / **No, decline** | answers that request |
| `YES` / `NO` | answers the only open request (asks which one if there are several) |
| `YES K7Q2` / `NO K7Q2` | answers a specific request by its ref |
| `CANCEL K7Q2` | cancels a lesson and frees the slot |
| `LIST` | upcoming lessons and open requests |

Only messages from `COACH_WHATSAPP` are acted on. Everyone else is ignored.

### Changing your dates or clubs

Edit **`shared/schedule.js`** and redeploy. Only the dates in `OPEN_DATES` can be booked (currently
1, 2, 5, 6 and 7 October 2026). The clubs are in `LOCATIONS`: Klaipėda at A1 Padel and Palanga at Oshee,
which is still marked "to be confirmed". Students pick the city when they book, and it appears in the
"When" line of your WhatsApp message. To close one of the open dates at short notice without a redeploy,
set the `BLOCKED_DATES` env var, e.g. `2026-10-06`.

Other rules are in `shared/rules.js`: hours 10:00–17:00, 30-min steps, 2h minimum notice and the 24h hold.
The public "Message Navid" WhatsApp number is in `assets/js/config.js`.

---

## Setup

### 1. Deploy on Netlify

1. Push this folder to a GitHub repo, then in Netlify go to **Add new site → Import from Git**. No build command; the publish dir is `.`
   (already set in `netlify.toml`). Netlify installs `@netlify/blobs` from `package.json` automatically.
2. Add the env vars from `.env.example` under **Site configuration → Environment variables**.

### 2. Point coachnavid.com (GoDaddy) at Netlify

In Netlify: **Domain management → Add a domain → `coachnavid.com`**. Then in GoDaddy, go to **My Products →
coachnavid.com → DNS** and do **one** of these:

- **Keep GoDaddy DNS.** Set an `A` record: host `@` → `75.2.60.5`. Set a `CNAME` record: host `www` →
  `<your-site>.netlify.app`. Delete any other `A` records for `@`, including GoDaddy's "parked" record.
- **Use Netlify DNS.** Choose "Set up Netlify DNS" in Netlify, then in GoDaddy go to **Nameservers → Change → I'll use my own**
  and paste the 4 Netlify nameservers.

Netlify issues the HTTPS certificate automatically once DNS resolves (anywhere from minutes to a few hours).

### 3. WhatsApp Cloud API (Meta)

The messages come **from a WhatsApp Business sender number** and go **to your personal WhatsApp**.
The sender can't be your personal number. Start with Meta's free test number, then add a real one later.

1. Go to <https://developers.facebook.com> → **Create app** → type **Business** → add the **WhatsApp** product.
2. Open **WhatsApp → API Setup**:
   - Copy the **Phone number ID** into `WHATSAPP_PHONE_NUMBER_ID`.
   - Under "To", add and verify **your personal WhatsApp number**. Put the same number in `COACH_WHATSAPP`,
     digits only with country code, e.g. `37061234567`.
3. Create a **permanent token**: go to Business Settings → Users → **System users** → Add, then
   generate a token with the `whatsapp_business_messaging` and `whatsapp_business_management` permissions.
   Put it in `WHATSAPP_TOKEN`. The temporary token on the API Setup page expires after 24h.
4. Get the app secret from **App settings → Basic → App secret** and put it in `WHATSAPP_APP_SECRET`.
5. Create the message template under **WhatsApp Manager → Message templates → Create**:
   - Category **Utility**, name **`lesson_request`**, language **English**
   - Body:
     ```
     🎾 New padel lesson request

     Student: {{1}}
     Phone: {{2}}
     When: {{3}}
     Ref: {{4}}

     Confirm this lesson?
     ```
   - Buttons: **Quick reply** `Yes, confirm`, then **Quick reply** `No, decline`. Keep this order.
   - Submit it. Approval usually takes minutes. Then set `WHATSAPP_TEMPLATE=lesson_request`.
6. Set up the webhook under **WhatsApp → Configuration → Webhook → Edit**:
   - Callback URL: `https://coachnavid.com/api/whatsapp`
   - Verify token: any random string. Put the same value in `WHATSAPP_VERIFY_TOKEN` and redeploy **before** clicking Verify.
   - After it verifies, **subscribe to the `messages` field**.

Why the template matters: WhatsApp only allows free-form business messages within 24h of your
last message to the business number. The approved template can be sent anytime. After you tap a
button the 24h window opens, so the "Confirmed ✅" replies go through normally.

**Testing before the template is approved:** leave `WHATSAPP_TEMPLATE` empty and send any message (e.g. "hi") to the
business/test number from your phone. For the next 24h, requests arrive as a plain message with buttons.

### 4. Try it

Open the site, request a lesson, tap **Yes** in WhatsApp, and the day's slot turns striped on the page.
Reply `LIST` to see your schedule.

## Local preview

Serve the folder with any static server (for example `python3 -m http.server`) and open `localhost`. The
functions aren't running there, so the page switches to **demo mode**: bookings are stored in the browser,
and a panel lets you pretend to be Navid tapping Yes or No. Demo mode can only turn on locally or with `?demo`
in the URL. The live site never falls back to fake bookings. To run the real functions locally, use
`npx netlify dev` (needs Node.js).
