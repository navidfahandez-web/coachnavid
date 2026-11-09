# coachnavid.com — padel lesson booking

Landing page for Coach Navid Fahandezh's padel lessons at The Padel Project, Musaffah (Abu Dhabi), in English and Lithuanian. Students pick a day, a lesson
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
| `YES SMASH0001` / `NO SMASH0001` | answers a specific request by its ref |
| `CANCEL SMASH0001` | cancels a lesson and frees the slot |
| `LIST` | upcoming lessons and open requests |

Only messages from `COACH_WHATSAPP` are acted on. Everyone else is ignored.

### Changing hours, club or days off

Edit **`shared/schedule.js`** and redeploy. Lessons currently run every day at **The Padel Project, Musaffah (Abu Dhabi)**,
on UAE time: **Mon–Fri 12:00–17:00** and **Sat–Sun 08:00–14:00**. To close a day without a redeploy, set
`BLOCKED_DATES` in Netlify, e.g. `2026-12-02,2026-12-03`. The "coming soon" text (Lithuania at Christmas, Oman / Padel Addicts)
is in `assets/js/i18n.js`. All visitor text is there in English (`en`) and Lithuanian (`lt`).

### Students & announcements (admin page)

The admin page has a **Students** list grouped by location (UAE, Lithuania, Oman — see `shared/regions.js`).
Everyone with a confirmed lesson appears automatically; add others by hand. Students can be messaged if they ticked
“Let me know when Navid is coaching in my area again” when booking, or if you added them yourself.
**Announce new dates** writes one message and gives a one-tap WhatsApp link per student (`{name}`, `{dates}`, `{place}` are filled in).

### Video analysis uploads (coachnavid.com/upload)

Students upload match videos (up to 10 files, 8 GB each). Each upload gets its own folder, `VA0001 · Name (+phone)`,
inside **Coach Navid – Video analysis** in Navid's Google Drive (navid.fahandez@gmail.com). Files go **straight from the
browser to Google**, not through our server. Navid gets a WhatsApp alert with the folder link. On the admin page he can open
the folder and **share it with the student**, which creates a view-only link and a ready-to-send WhatsApp message.
The site only has `drive.file` access, so it can only see files and folders it created itself.

One-time setup:
1. Go to <https://console.cloud.google.com>, create a project called "coachnavid", then under **APIs & Services → Library** enable **Google Drive API**.
2. In **OAuth consent screen / Google Auth Platform**, choose External, app name "Coach Navid", and add the `.../auth/drive.file` scope.
   Then **Publish app**. Leaving it in Testing makes the connection expire every 7 days.
3. Under **Credentials → Create credentials → OAuth client ID**, choose **Web application** with redirect URI `https://coachnavid.com/api/google/callback`.
4. In Netlify, add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then redeploy.
5. On the admin page, click **Connect Google Drive**, choose navid.fahandez@gmail.com, and click **Allow**.

### Admin page: coachnavid.com/admin

A private dashboard listing every request, with **Confirm / Decline / Cancel** buttons and a one-tap WhatsApp confirmation
to the student. It works even when the WhatsApp alerts aren't set up. If a WhatsApp alert fails, the request is still
saved and shows up there. To enable it, set **`ADMIN_PASSWORD`** in Netlify (choose a strong one) and redeploy.

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

Two numbers are involved:

| Role | Number | Where it's set |
|---|---|---|
| **Sender**: the business number students see | business WhatsApp +971 56 167 7227 | connected to the Cloud API (below) → `WHATSAPP_PHONE_NUMBER_ID` |
| **Receiver**: gets requests, taps Yes/No | Navid's personal WhatsApp | `COACH_WHATSAPP` (digits only, private env var) |

The real values are in the local, gitignored `.env` file. Copy them into Netlify's environment variables.

1. Go to <https://developers.facebook.com> → **Create app** → type **Business** → add the **WhatsApp** product.
2. **First test with Meta's free test sender.** Under **WhatsApp → API Setup**, add and verify your **personal**
   number in the "To" list. Copy the test number's **Phone number ID** into `WHATSAPP_PHONE_NUMBER_ID`.
   Everything below works with the test sender, so you can try the whole flow before connecting the business number.
3. **Then connect the business number as the sender.** In **API Setup → Add phone number**, choose the option to
   **connect an existing WhatsApp Business app number**. You scan a QR code from the WhatsApp Business app, and the
   number keeps working in the app as normal. Replace `WHATSAPP_PHONE_NUMBER_ID` with the new number's ID.
   ⚠️ If Meta only offers to *register/migrate* the number instead, stop there: migrating removes it from the
   WhatsApp Business app. Use a separate number as the sender instead, or keep the test sender for now.
4. Create a **permanent token**: go to Business Settings → Users → **System users** → Add, then
   generate a token with the `whatsapp_business_messaging` and `whatsapp_business_management` permissions.
   Put it in `WHATSAPP_TOKEN`. The temporary token on the API Setup page expires after 24h.
5. Get the app secret from **App settings → Basic → App secret** and put it in `WHATSAPP_APP_SECRET`.
6. **Alert templates** (so alerts reach you anytime, not only within 24h of your last message):
   open coachnavid.com/admin → *whatsapp connection* → **Check templates** → **Create alert templates**.
   This creates `lesson_request` (new requests, with Yes/No buttons) and `coach_alert` (video uploads,
   reminder digests, with a *Show details* button) in Meta. Approval usually takes minutes; until then
   the site falls back to plain messages. Template text lives in `COACH_TEMPLATES` in `netlify/lib/whatsapp.mjs`.
7. Set up the webhook under **WhatsApp → Configuration → Webhook → Edit**:
   - Callback URL: `https://coachnavid.com/api/whatsapp`
   - Verify token: any random string. Put the same value in `WHATSAPP_VERIFY_TOKEN` and redeploy **before** clicking Verify.
   - After it verifies, **subscribe to the `messages` field**.

8. **Student confirmation template** (so students get a WhatsApp when you tap Yes). Create a second template:
   - Category **Utility**, name **`lesson_confirmed`**, language **English**
   - Body:
     ```
     Hi {{1}}! ✅ Your padel lesson with Coach Navid is confirmed.

     📅 {{2}}
     📍 {{3}}

     See you on court! If you need to change anything, just reply to this message.
     ```
   - Sample values for review: `Rūta`, `Wed 7 Oct, 16:00–17:00 (1h)`, `Klaipėda · A1 Padel`
   - Once approved, set `WHATSAPP_STUDENT_TEMPLATE=lesson_confirmed` in Netlify and redeploy.
   - This only works once the **business number** is the sender, because the test number can only message verified numbers.
     Until then, your "Confirmed ✅" reply includes a one-tap link that opens WhatsApp with the confirmation already typed.

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

## Lesson voice notes (admin → Players)

From your phone open **coachnavid.com/admin/player**, pick a player, tap 🎙️ and talk about the lesson.
The site turns the recording into text (OpenAI speech-to-text), Claude (`claude-opus-5-5`) writes the lesson
summary in the player's language — comparing it with their earlier lessons, reports and GlassWall data —
and a PDF is saved in the player's Drive folder. **Send PDF on WhatsApp** opens a chat with the link ready.

No keys needed: Netlify's **AI Gateway** gives the functions access to Claude and OpenAI and bills it in
Netlify credits (a few cents per lesson). To use your own accounts instead, set `ANTHROPIC_API_KEY` and/or
`OPENAI_API_KEY` in Netlify → Environment variables. With your own Anthropic key, summaries also use Claude's
server-side refusal fallback (`fallbacks: "default"`); the gateway doesn't forward beta headers, so it's off there.

## AI first draft of video reports (report builder → 🤖 Make AI draft)

The student's video is streamed from their Drive folder to Google **Gemini** (it watches video natively, up to
about an hour per match), with Navid's framework: the 7 areas / 43 shots, the drill library, the plan type, the
student's note ("red shirt, revés side"), earlier reports and GlassWall data. Gemini fills the report builder:
scores per area and shot, the top 3 errors with timestamps, fixes, drills and (Match Report) the 3-week plan,
plus "who it analysed" and "not sure about" notes for Navid only. Navid checks everything, then publishes.
The copy at Google is deleted when the draft is done.

Setup: aistudio.google.com → **Get API key** (use a Google Cloud project **with billing enabled** — on the free
tier Google may use the videos to improve its models) → Netlify env **`GEMINI_VIDEO_KEY`** → redeploy.
Cost: roughly a few cents for a clip, up to ~$1 for a full match (Gemini pricing).
