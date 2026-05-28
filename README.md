# LeadGen

Find local businesses on Google Maps that have **no website** — useful for lead generation and outreach.

## How it works

1. Enter an **industry** (e.g. `plumbers`, `coffee shops`) and **location** (e.g. `Austin, TX`).
2. The app queries [SerpApi Google Maps](https://serpapi.com/maps-local-results) for up to 6 pages (~120 businesses).
3. Results are filtered to businesses missing a `website` field and saved to **Neon Postgres**.
4. Open **History** to view past searches, manage leads, and create proposals (stub send: mark as sent in-app).

## Pages

| Route | Description |
|-------|-------------|
| `/` | Search (landing page) |
| `/searches` | List of past search queries |
| `/searches/[id]` | Leads for one search + per-lead proposals |

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
```

- **SerpApi**: [serpapi.com](https://serpapi.com/)
- **Neon**: [neon.tech](https://neon.tech) — paste your connection string as `DATABASE_URL`

### 3. Create database tables

```bash
npm run db:push
```

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Proposals (v1)

- **Create proposal** on a lead — pre-filled template, editable body
- **Save draft** — stored in Neon
- **Mark as sent** — stub; no email/WhatsApp yet (ready to plug in Resend / WhatsApp later)
- After sent, only **View** is shown (read-only popup)

## API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/search` | Run SerpApi search, save to DB, return `searchId` |
| GET | `/api/searches` | List search history |
| GET | `/api/searches/[id]` | Search + leads + proposal status |
| POST | `/api/leads/[leadId]/proposal` | Create/update draft |
| PATCH | `/api/leads/[leadId]/proposal` | Mark proposal as sent |

## Cost note

Each search uses up to **6 SerpApi credits** (one per results page).

## Tech stack

- [Next.js](https://nextjs.org/) (App Router)
- [Tailwind CSS](https://tailwindcss.com/)
- [SerpApi](https://serpapi.com/) Google Maps
- [Neon](https://neon.tech) Postgres + [Drizzle ORM](https://orm.drizzle.team/)
