# HotelOS Ultra

**The AI WhatsApp booking assistant for independent hotels.**

When a guest messages the hotel's WhatsApp number, Aria (the AI) replies instantly, answers questions from the hotel's own knowledge base, recommends rooms, nurtures the lead with automated follow-ups, and hands off to staff the moment it can't answer confidently or a human needs to close the booking. Staff manage everything — knowledge base, CRM, follow-up cadence, broadcast campaigns, settings — from one dashboard.

First tenant: **Hotel Ivory Towers**, Uppal, Hyderabad (see `prisma/seed.ts` — room/FAQ/offer content sourced from the hotel's real site, hotelivorytower.com).

Built as a real, deployable MVP — no mock data. Every module talks to a real Postgres database and a real WhatsApp Business Cloud API webhook.

---

## Architecture

```
Next.js App Router  ──┬── REST API routes (src/app/api/**)  ← webhook, CRM, campaigns, settings
                       └── Pages (src/app/(app)/**, (auth)/**) ← Server Components read Postgres
                                                                    directly; client components call
                                                                    the REST API for mutations

Worker (src/worker)  ──── separate long-running Node process:
                           - message-processing queue (AI reply pipeline)
                           - campaign-send queue (rate-limited broadcast sends)
                           - follow-up sweep (60s interval, not a queue — see below)

Postgres + pgvector   ──── one schema, every business table carries tenantId
Redis                 ──── BullMQ job queues
```

**Multi-tenancy.** Every tenant-owned table has `tenantId`. `src/lib/tenant.ts` wraps Prisma in a query extension that auto-injects `tenantId` into every read/write for tenant-scoped models — even if a route handler forgets to filter by tenant, it can't leak or mutate another hotel's data. One Meta App/webhook fronts every tenant's WhatsApp number; inbound payloads are routed to a tenant by `phone_number_id` (see `src/lib/whatsapp/tenant-credentials.ts`).

**AI / RAG.** `src/lib/ai/pipeline.ts` builds a system prompt from the hotel's profile, rooms, FAQs, and offers, retrieves the most relevant knowledge-base chunks for the guest's message (`src/lib/ai/rag.ts`, pgvector cosine similarity), and asks Claude to reply. If Claude can't answer confidently, it's instructed to emit an `ESCALATE:` marker instead of guessing — the pipeline catches that, sends a graceful "a team member will follow up" message, and creates a `StaffNotification` instead of hallucinating.

**Reliability ("no lead is ever missed").** The webhook route (`src/app/api/webhook/whatsapp/route.ts`) does only fast, durable work synchronously — verify signature, upsert the contact, save the message, enqueue a job — before responding 200. The slow part (RAG retrieval + LLM call + send) runs in the worker process, with retries, so a slow or failing AI call can never cause Meta to see a timeout or a message to get silently dropped.

---

## Local setup

```bash
cp .env.example .env          # fill in JWT_SECRET / ENCRYPTION_KEY (openssl rand -hex 32) at minimum
docker-compose up -d          # local Postgres (with pgvector) + Redis
npm install
npx prisma migrate dev --name init
npm run db:seed               # seeds the Hotel Ivory Towers tenant + owner login
npm run dev                   # http://localhost:3000
npm run worker                # separate terminal — required for AI replies/follow-ups/campaigns to actually send
```

The seed script prints both logins (uses this repo owner's real email for each, per `prisma/seed.ts`) — change both passwords immediately after first login:
- Hotel owner (Hotel Ivory Towers): `http://localhost:3000/login`
- Platform admin (manages every hotel): `http://localhost:3000/admin/login`

Without `ANTHROPIC_API_KEY` / `VOYAGE_API_KEY` / WhatsApp credentials set, the app still runs and every page works — Aria just won't be able to reply until those are configured (see below).

---

## Connecting real WhatsApp + AI (per tenant)

1. **Meta App** — create one at developers.facebook.com with the WhatsApp Business Platform product enabled. This is platform-wide (one app for all your hotel tenants), so its App Secret and a verify token you choose go in `.env` as `WHATSAPP_APP_SECRET` / `WHATSAPP_VERIFY_TOKEN` — not per tenant.
2. **Webhook** — in the App's WhatsApp → Configuration screen, set the callback URL to `https://<your-domain>/api/webhook/whatsapp` and the verify token to the same value as `WHATSAPP_VERIFY_TOKEN`. Subscribe to the `messages` field.
3. **Per hotel** — in the app, go to **Settings → WhatsApp** (owner only) and enter that hotel's `phone_number_id`, `WABA ID`, and a permanent access token from the Meta App's API Setup screen. This is what's actually per-tenant — each hotel's own number and token, stored encrypted (`src/lib/crypto.ts`).
4. **AI** — set `ANTHROPIC_API_KEY` (chat) and `VOYAGE_API_KEY` (embeddings — see "Assumptions" below for why it's not also Anthropic).
5. **Knowledge base** — go to **Knowledge Base**, add the hotel's info as text or PDF uploads. Also fill in **Settings → Hotel** (address, policies, etc.) and **Settings → Rooms** — Aria answers strictly from these, so an empty knowledge base means Aria escalates almost everything.

Message templates (for the 24h-window follow-ups/campaigns) are created and approved in Meta Business Manager directly — reference their exact name in a Follow-up rule or Campaign's "template name" field.

---

## Platform admin panel

`/admin` — a completely separate login/session from the hotel-facing app (`PlatformAdmin` model, its own JWT shape, its own `hotelos_admin_session` cookie; see `src/lib/auth/admin-jwt.ts` and `src/proxy.ts`), for **you** — the person running HotelOS Ultra as a business — not for any individual hotel's staff.

From there you can:
- See every hotel on the platform with its subscription status, WhatsApp connection status, and headline stats (contacts, bookings, staff).
- **Onboard a new hotel** — creates the tenant + its first owner login in one step, without that hotel owner having to self-register.
- Open a hotel for a closer look (staff roster, message/booking counts) and change its subscription status (trial → active, or suspend by marking past-due/cancelled).

This is the piece that makes the "one hotel now, hundreds later" architecture concrete — the tenant-isolation guard (`src/lib/tenant.ts`) already made every hotel's data independent; this panel is the operator's view across all of them.

---

## Deployment

- **Web app**: any Node host (Vercel, Railway, DigitalOcean App Platform) — `npm run build && npm start`, or the provided `Dockerfile` (default `CMD` runs the web server).
- **Worker**: a second, separate long-running process from the *same* image/repo with `CMD` overridden to `npm run worker:start` — it needs to stay alive continuously (follow-up sweep, queue consumers), so it can't run on request-based serverless.
- **Postgres**: needs the `pgvector` extension available (Supabase, Neon, Railway Postgres, or self-hosted `pgvector/pgvector` image all work) — `npx prisma migrate deploy` applies the schema including `CREATE EXTENSION vector`.
- **Redis**: any managed Redis (Railway, Upstash, etc.) for BullMQ.
- **Object storage**: any S3-compatible bucket (Cloudflare R2, Supabase Storage, AWS S3) for knowledge-base files and inbound media.

Run `npx prisma migrate deploy` (not `migrate dev`) against production, then `npx prisma db seed` once if you want the demo tenant.

---

## Testing

```bash
npm test
```

Covers the three areas the spec calls out: webhook signature verification + payload parsing, tenant isolation (the `tenantDb()` extension can't leak/write across tenants), and the follow-up sweep's window/skip logic.

---

## Assumptions made (spec was ambiguous or silent)

- **Backend = Next.js Route Handlers**, not a separate Express service — one codebase, one deploy, still a real REST API (used by the webhook, all mutations, and available to any future external client).
- **Embeddings via Voyage AI**, not Anthropic — Claude has no embeddings endpoint; Voyage is Anthropic's own recommended pairing, kept behind the same swappable `EmbeddingProvider` interface as `AIProvider` (`src/lib/ai/provider.ts`).
- **WhatsApp app secret / verify token are platform-level env vars**, not per-tenant DB columns — they belong to the one shared Meta App/webhook URL; only `phone_number_id`/access token are genuinely per-tenant (per hotel's own WABA).
- **Follow-ups fire via a 60-second polling sweep** (`src/lib/follow-ups/sweep.ts`), not one BullMQ delayed job per rule — simpler to keep in sync with "cancel the moment the guest replies," and the spec explicitly allows "a queue... or a cron worker."
- **Login resolves by email alone** (not a workspace-picker step) even though email is unique *per tenant* in the schema — reasonable until the same person genuinely staffs two hotels with one email.
- **Outbound media (campaigns, knowledge base) is sent by hosted URL**, not WhatsApp's upload-by-media-id endpoint — the spec explicitly allowed either, and this is simpler given object storage already returns public URLs.
- **No OCR on uploaded images** in the knowledge base (spec marked this optional) — image docs are stored and listed but don't contribute to RAG retrieval.
- **Revenue dashboard card omitted** — marked optional in the spec, and there's no payment/invoice model in scope.
- **"Broadcast Templates" has no dedicated settings CRUD** — actual WhatsApp template creation/approval happens in Meta Business Manager; a template is just referenced by its approved name in a Follow-up rule or Campaign.
- **`docker-compose.yml` added** (not explicitly requested) purely for local dev convenience — Postgres with `pgvector` preinstalled + Redis.

---

## Project structure

```
prisma/
  schema.prisma        Multi-tenant schema (see comments throughout for the "why")
  seed.ts               Seeds Hotel Ivory Towers
src/
  app/
    (auth)/             login, register — public, hotel staff
    (app)/               dashboard, crm, follow-ups, campaigns, knowledge, settings — protected by src/proxy.ts
    admin/               login (public) + (dashboard)/ tenants list + detail — separate admin session, see src/proxy.ts
    api/                 REST API — auth, admin, webhook, contacts, campaigns, follow-up-rules, settings, knowledge, dashboard
  lib/
    ai/                  AIProvider (Anthropic) + EmbeddingProvider (Voyage) + RAG + the reply pipeline
    whatsapp/             Cloud API client (send/media), webhook parsing + signature verification, 24h window
    inbound/              webhook → contact/message persistence → queue → AI reply
    follow-ups/           the 60s sweep
    campaigns/             per-recipient send logic
    queue/                 BullMQ queue definitions + shared Redis connection
    auth/                  tenant session (jwt.ts, session.ts) + platform-admin session (admin-jwt.ts, admin-session.ts) — separate JWT shapes, separate cookies
    tenant.ts, tenant-scope.ts, crypto.ts, storage/, knowledge/, dashboard/, validation/
  worker/index.ts        Standalone process: message-processing + campaign-send workers, follow-up sweep interval
  components/             ui/ (shadcn, Base UI) + one folder per feature area (including admin/)
  store/                  Zustand — auth (hydrated from the server layout) + UI state only
  types/                  Plain client-side types mirroring API JSON shapes
```
