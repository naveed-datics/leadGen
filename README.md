# LeadGen

Find local businesses on Google Maps that have **no website** — useful for lead generation and outreach.

## How it works

1. Enter an **industry** (e.g. `plumbers`, `coffee shops`) and **location** (e.g. `Austin, TX`).
2. The app queries [SerpApi Google Maps](https://serpapi.com/maps-local-results) for up to 6 pages (~120 businesses).
3. Results are filtered to businesses missing a `website` field and saved to **Neon Postgres**.
4. Open **History** to view past searches, manage leads, and send proposals via WhatsApp (WAHA).

## Pages

| Route | Description |
|-------|-------------|
| `/` | Search (landing page) |
| `/searches` | List of past search queries |
| `/searches/[id]` | Leads for one search + per-lead proposals |
| `/agent/chat` | WhatsApp inbox (inbound/outbound messages) |

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

Copy `.env.local.example` to `.env.local` and set:

```
SERPAPI_API_KEY=your_serpapi_key
DATABASE_URL=postgresql://user:password@host/neondb?sslmode=require
WAHA_BASE_URL=https://your-waha-host.example.com
WAHA_SESSION=default
CRON_SECRET=generate-a-random-secret
```

- **SerpApi**: [serpapi.com](https://serpapi.com/)
- **Neon**: [neon.tech](https://neon.tech) — paste your connection string as `DATABASE_URL`
- **WAHA**: [waha.devlike.pro](https://waha.devlike.pro/) — self-hosted WhatsApp HTTP API

### 3. WAHA webhook (inbound replies)

Point your WAHA instance at LeadGen so agent chat receives replies:

```bash
WHATSAPP_HOOK_URL=https://YOUR_LEADGEN_DOMAIN/api/whatsapp/waha/webhook
WHATSAPP_HOOK_EVENTS=message
```

Or configure a session webhook in WAHA (`POST /api/sessions/`) with the same URL and `events: ["message"]`.

Optional: set `WAHA_WEBHOOK_SECRET` in LeadGen and send it from WAHA via a custom header `X-Webhook-Secret`.

### 4. Create database tables

```bash
npm run db:push
```

### 5. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Proposals & WhatsApp

- **Create proposal** on a lead — pre-filled template, editable body
- **Save draft** — stored in Neon
- **Send via WhatsApp** — sends through WAHA (`POST /api/leads/[leadId]/whatsapp/send`)
- After sent, only **View** is shown (read-only popup)
- **Auto follow-ups** — if the lead does not reply, Day 3 and Day 7 WhatsApp follow-ups send automatically (cancelled on reply)
- **Agent chat** — inbox at `/agent/chat` for conversation threads

### Follow-up sequence cron

Set `CRON_SECRET` in your environment. On Vercel Hobby, `vercel.json` runs `/api/cron/proposal-follow-ups` **once daily** at 09:00 UTC (Pro plan required for hourly cron).

For other hosts or local dev:

```bash
npm run cron:follow-ups
```

Or call `GET /api/cron/proposal-follow-ups` with header `Authorization: Bearer $CRON_SECRET`.

For more frequent processing on Hobby, use an external scheduler (e.g. cron-job.org) to hit that endpoint hourly.

Set `PROPOSAL_FOLLOW_UPS_ENABLED=false` to disable scheduling and processing.

## API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/search` | Run SerpApi search, save to DB, return `searchId` |
| GET | `/api/searches` | List search history |
| GET | `/api/searches/[id]` | Search + leads + proposal status |
| POST | `/api/leads/[leadId]/proposal` | Create/update draft |
| POST | `/api/leads/[leadId]/whatsapp/send` | Send proposal via WAHA |
| GET | `/api/cron/proposal-follow-ups` | Process due follow-ups (requires `CRON_SECRET`) |
| POST | `/api/whatsapp/check` | Batch-check lead numbers on WhatsApp |
| GET | `/api/whatsapp/status` | WAHA configuration status |
| POST | `/api/whatsapp/waha/webhook` | WAHA inbound message webhook |

## Cost note

Each search uses up to **6 SerpApi credits** (one per results page).

## Tech stack

- [Next.js](https://nextjs.org/) (App Router)
- [Tailwind CSS](https://tailwindcss.com/)
- [SerpApi](https://serpapi.com/) Google Maps
- [WAHA](https://waha.devlike.pro/) WhatsApp HTTP API
- [Neon](https://neon.tech) Postgres + [Drizzle ORM](https://orm.drizzle.team/)
