# DarkX Bot Builder

A website that generates ready-to-deploy **DarkX Mini** WhatsApp bot zips
(.ping, .play, .vv2) based on details a user fills in — no coding needed.

## How it works

- **Single Session (free):** user fills in bot name, owner name, owner
  number, and their own MongoDB connection string → clicks Generate →
  instantly downloads a zip, pre-configured, that supports 1 linked
  WhatsApp number.
- **Multi Session (35,000 TZS):** same form, plus payment proof (screenshot
  + transaction number). The order goes into a pending queue. The admin
  reviews the proof in the Admin panel and approves it — the page then
  automatically shows a Download button for a zip that supports several
  linked WhatsApp numbers.

## Running locally

```bash
npm install
cp .env.example .env   # then edit ADMIN_PASSWORD, PAYMENT_NUMBER, etc.
npm start
```

Open http://localhost:4000

## Environment variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | Port to listen on | `4000` |
| `ADMIN_PASSWORD` | Password for the Admin panel | `admin123` |
| `PAYMENT_NUMBER` | Mobile money number shown to buyers | `0775710774` |
| `PAYMENT_NAME` | Registered name shown to buyers | `JAMILA` |
| `DEFAULT_MULTI_SESSIONS` | How many sessions a Multi-Session zip supports | `5` |

**Change `ADMIN_PASSWORD` before deploying this publicly.**

## Folder structure

```
server.js            → main Express app
lib/zipBuilder.js     → copies bot-template, injects user's .env, zips it
lib/orderStore.js      → JSON-file storage for Multi-Session orders
lib/adminAuth.js       → simple password-based admin login
public/                → the website itself (index.html + app.js)
bot-template/           → the DarkX Mini bot source that gets zipped up
data/orders.json         → order records
uploads/                → payment proof screenshots
downloads/                → generated zips waiting to be downloaded
```

## Deploying

Works on Render (see `render.yaml`), Railway, or any Node host. Make sure
`ADMIN_PASSWORD` is set to something private, and that persistent disk is
available if you want `data/orders.json`, `uploads/`, and `downloads/` to
survive restarts (on Render, add a Disk under the service's Settings).

---
Powered by DarkX — built with the DarkX Bot Builder.
