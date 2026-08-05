# HotelOS Ultra

**The AI WhatsApp booking assistant for independent hotels.**

When a guest messages the hotel's WhatsApp number, **Anushka** (the AI concierge) replies instantly — in whatever language the guest writes in (English, Hindi, Telugu, Hinglish/Tenglish, or a mix), including from voice notes — answers questions from the hotel's own knowledge base, recommends and photographs rooms, nurtures the lead toward a booking, and hands off to staff the moment it can't answer confidently or a human needs to close the deal. Staff manage everything — knowledge base, CRM, follow-up cadence, broadcast campaigns, settings — from one dashboard.

First tenant: **Hotel Ivory Towers**, Uppal, Hyderabad (see `prisma/seed.ts` — room/FAQ/offer content sourced from the hotel's real site, hotelivorytower.com).

Built as a real, deployable product — no mock data. Every module talks to a real Postgres database and a real WhatsApp Business Cloud API webhook.

**Live at**: https://hotelosultra.online

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

Postgres + pgvector   ──── one schema, every business table carries tenantId (self-hosted container in production)
Redis                 ──── BullMQ job queues (self-hosted container in production)
```

**Multi-tenancy.** Every tenant-owned table has `tenantId`. `src/lib/tenant.ts` wraps Prisma in a query extension that auto-injects `tenantId` into every read/write for tenant-scoped models — even if a route handler forgets to filter by tenant, it can't leak or mutate another hotel's data. One Meta App/webhook fronts every tenant's WhatsApp number; inbound payloads are routed to a tenant by `phone_number_id` (see `src/lib/whatsapp/tenant-credentials.ts`).

**AI / RAG.** `src/lib/ai/pipeline.ts` builds a system prompt from the hotel's profile, rooms (including photo URLs), FAQs, and offers, retrieves the most relevant knowledge-base chunks for the guest's message (`src/lib/ai/rag.ts`, pgvector cosine similarity), and generates a reply through a **fallback chain of providers** (`src/lib/ai/fallback-provider.ts`): Gemini → Groq → Mistral → Anthropic, tried in order — whichever have no API key configured fail instantly and the chain moves on, so there's no single point of failure on a free-tier rate limit. Every provider call is capped to a single attempt and a short timeout (10–15s) — the SDKs' own default retry/backoff behavior (Gemini: up to 5 attempts, Anthropic: 10-minute default timeout) was found to silently add up to a minute of latency per reply when left at defaults, fighting against this app's own fallback design.

If nothing in the knowledge base answers confidently, the model is instructed to emit an `ESCALATE:` marker instead of guessing — the pipeline catches that, sends a graceful "a team member will follow up" message, and creates a `StaffNotification` instead of hallucinating.

**Voice notes.** Inbound WhatsApp voice messages are transcribed via Groq's Whisper API (`src/lib/ai/transcription.ts`, auto-detects language) and fed into the same text pipeline as a normal message (prefixed `🎤` so the CRM shows it came from audio). Transcription is deliberately decoupled from object-storage upload success — a missing/broken S3 bucket only means the CRM can't show the original audio clip, it doesn't block Anushka from understanding and replying to it.

**Sending photos.** Room `imageUrls` are listed in the system prompt; when a guest asks to see a room, the model appends `IMAGE: <url>` lines (only ever URLs actually listed — never invented) which `process-message-job.ts` parses out and sends as real WhatsApp image messages.

**Reliability ("no lead is ever missed").** The webhook route (`src/app/api/webhook/whatsapp/route.ts`) does only fast, durable work synchronously — verify signature, upsert the contact, save the message (transcribing audio if needed), enqueue a job — before responding 200. The slow part (RAG retrieval + LLM call + send) runs in the worker process, so a slow or failing AI call can never cause Meta to see a timeout or a message to get silently dropped.

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

The seed script prints both logins (uses this repo owner's real email for each, per `prisma/seed.ts`) — **change both passwords immediately after first login**, via Settings → Account (owner) or `/admin/account` (platform admin).
- Hotel owner (Hotel Ivory Towers): `http://localhost:3000/login`
- Platform admin (manages every hotel): `http://localhost:3000/admin/login`

Without any AI provider key / WhatsApp credentials set, the app still runs and every page works — Anushka just won't be able to reply until those are configured (see below).

---

## Connecting real WhatsApp + AI (per tenant)

1. **Meta App** — create one at developers.facebook.com with the WhatsApp Business Platform product enabled. This is platform-wide (one app for all your hotel tenants), so its App Secret and a verify token you choose go in env as `WHATSAPP_APP_SECRET` / `WHATSAPP_VERIFY_TOKEN` — not per tenant.
2. **Webhook** — in the App's WhatsApp → Configuration screen, set the callback URL to `https://<your-domain>/api/webhook/whatsapp` and the verify token to the same value as `WHATSAPP_VERIFY_TOKEN`. Subscribe to the `messages` field. This can also be done directly via the Graph API: `POST /{app-id}/subscriptions` with `object=whatsapp_business_account`, `callback_url`, `verify_token`, `fields=messages`, authenticated with an app access token (`{app-id}|{app-secret}`).
3. **⚠️ WABA subscription — easy to miss.** Configuring the webhook callback on the App is **necessary but not sufficient**. The hotel's WhatsApp Business Account must *also* be explicitly subscribed to receive events for **this specific app** — a fresh WABA/test number defaults to being subscribed to Meta's own internal test app instead, so your webhook silently never receives anything even though verification succeeds and everything looks configured correctly. Fix: `POST /{waba-id}/subscribed_apps` using the hotel's own WhatsApp access token. Verify with `GET /{waba-id}/subscribed_apps` — your app should be in the list.
4. **Per hotel** — in the app, go to **Settings → WhatsApp** (owner only) and enter that hotel's `phone_number_id`, `WABA ID`, and an access token from the Meta App's API Setup screen. This is what's actually per-tenant — each hotel's own number and token, stored encrypted (`src/lib/crypto.ts`).
   - **Temporary vs. permanent tokens**: the token copied from the API Setup page's quick-copy button is only valid ~24h and *will* expire mid-use. For production, generate a **System User** access token instead: Meta Business Manager → Users → System Users → create one with Admin role → assign it the WhatsApp Business Account + this App with full control → generate a token scoped to `whatsapp_business_messaging` + `whatsapp_business_management` with expiration set to **Never**.
5. **AI** — set at least one of `GEMINI_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY`, `ANTHROPIC_API_KEY` (chat — tried in that order, see Architecture above) and `VOYAGE_API_KEY` or `GEMINI_API_KEY` (embeddings).
6. **Knowledge base** — go to **Knowledge Base**, add the hotel's info as text or PDF uploads. Also fill in **Settings → Hotel** (address, policies, etc.) and **Settings → Rooms** (including photo URLs) — Anushka answers strictly from these, so an empty knowledge base means she escalates almost everything.

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

## Production deployment (current)

Runs on a **Hostinger KVM 1 VPS** (Ubuntu 24.04, 1 vCPU / 4GB RAM), domain `hotelosultra.online`, using the repo's existing `Dockerfile` for both processes — no separate Node/PM2 setup needed.

```
Nginx (SSL via Certbot/Let's Encrypt, auto-renews)
  └─ reverse-proxies :80/:443 → 127.0.0.1:3000

Docker containers (network: hotelos-net):
  hotelos-web       — built from Dockerfile, default CMD (`npm start`), port 3000 published to localhost only
  hotelos-worker    — same image, CMD overridden to `npm run worker:start`
  hotelos-redis     — redis:7-alpine, persistent volume, internal only (no published port)
  hotelos-postgres  — pgvector/pgvector:pg17, persistent volume (hotelos-pgdata), internal only (no published port)
```

**Database**: self-hosted (`hotelos-postgres` above), not Neon — moved off Neon after its serverless compute's autosuspend/cold-start behavior was causing intermittent `ETIMEDOUT` failures on every query (tenant lookups, AI reply generation, follow-up sweeps), which blocked Anushka from replying to guests entirely. A container on the same VPS, on the same Docker network the app already used for Redis, removes the network hop and the autosuspend behavior — query latency dropped from 2000ms+ to under 200ms, and a 10-query back-to-back stress test went from ~66% success (Neon's pooled endpoint) to 10/10.

Self-hosting means backups are no longer Neon's problem — a cron at `/opt/hotelos/backup-db.sh` runs nightly (`0 3 * * *`, root's crontab) and writes a gzip'd `pg_dump` to `/opt/hotelos/backups/`, pruning anything older than 14 days. This is VPS-local only — periodically copying a backup file off-box (your own machine, cloud storage) is still recommended, since it doesn't protect against total VPS loss.

**Secrets** live only in `/opt/hotelos/app.env` on the VPS (mode 600, root-only) — never committed to the repo. `JWT_SECRET` and `ENCRYPTION_KEY` were freshly generated for this deployment (`openssl rand -hex 32` each) rather than reused from the prior Render deployment, since a hard cutover meant old sessions/encrypted values didn't need to survive. The `hotelos-postgres` credentials live in the same file.

**To redeploy after a code change:**
```bash
ssh root@<vps-ip>
cd /opt/hotelos/app
git pull
docker build -t hotelos-ultra:latest .
docker stop hotelos-web hotelos-worker && docker rm hotelos-web hotelos-worker
docker run -d --name hotelos-web --restart unless-stopped --network hotelos-net \
  --env-file /opt/hotelos/app.env -p 127.0.0.1:3000:3000 hotelos-ultra:latest
docker run -d --name hotelos-worker --restart unless-stopped --network hotelos-net \
  --env-file /opt/hotelos/app.env hotelos-ultra:latest npm run worker:start
```
(Migrations, if any are pending: `docker run --rm --env-file /opt/hotelos/app.env hotelos-ultra:latest npx prisma migrate deploy` before restarting the containers.)

**Previously**: deployed on Render (web + worker as two separate free-tier services). That deployment may still exist in parallel but is no longer the primary target — DNS/webhook now point at the VPS.

### Other deployment options (if not using the VPS above)

- **Web app**: any Node host (Vercel, Railway, DigitalOcean App Platform) — `npm run build && npm start`, or the provided `Dockerfile` (default `CMD` runs the web server).
- **Worker**: a second, separate long-running process from the *same* image/repo with `CMD` overridden to `npm run worker:start` — it needs to stay alive continuously (follow-up sweep, queue consumers), so it can't run on request-based serverless. Free tiers that sleep on inactivity (e.g. Render's) will cause real delivery delays for this process specifically — worth an uptime-ping service or a paid tier if going that route.
- **Postgres**: needs the `pgvector` extension available (Neon, Supabase, Railway Postgres, or self-hosted `pgvector/pgvector` image all work) — `npx prisma migrate deploy` applies the schema including `CREATE EXTENSION vector`.
- **Redis**: any managed Redis (Upstash, Railway, etc.), or self-hosted as shown above.
- **Object storage**: any S3-compatible bucket (Cloudflare R2, Supabase Storage, AWS S3) for knowledge-base files and inbound media. Not currently fully configured in production (see "Known gaps") — the app degrades gracefully without it.

Run `npx prisma migrate deploy` (not `migrate dev`) against production, then `npx prisma db seed` once if you want the demo tenant.

---

## Known gaps (worth fixing before wider rollout)

- **No email-based "forgot password" flow.** Self-service password *change* exists (Settings → Account / `/admin/account`), but if a password is lost outright with no active session, recovery still requires a direct database update. Worth building if this goes to real customers.
- **Object storage incomplete in production** — `STORAGE_ENDPOINT` / `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` aren't fully set, so inbound media (images, voice note originals) can't be persisted to a bucket. Voice-note transcription still works regardless (see Architecture), but the CRM can't show the original audio/image file until this is configured.
- **Worker concurrency is fixed at 5** (`concurrency: 5` in `src/worker/index.ts`) — fine for one hotel's traffic (see the throughput estimate this was validated against: comfortably hundreds of messages/minute of headroom), but worth revisiting if onboarding many tenants or running large broadcast campaigns.

---

## Testing

```bash
npm test
```

Covers the three areas the spec calls out: webhook signature verification + payload parsing, tenant isolation (the `tenantDb()` extension can't leak/write across tenants), and the follow-up sweep's window/skip logic.

Always run the full check before shipping: `npx tsc --noEmit && npx eslint . && npm test && npm run build`.

---

## Assumptions made (spec was ambiguous or silent)

- **Backend = Next.js Route Handlers**, not a separate Express service — one codebase, one deploy, still a real REST API (used by the webhook, all mutations, and available to any future external client).
- **Multi-provider AI fallback** (Gemini/Groq/Mistral/Anthropic), not a single hardcoded provider — free tiers first while testing, Anthropic as the paid/quality fallback; swappable behind `AIProvider` (`src/lib/ai/provider.ts`).
- **Embeddings via Voyage AI or Gemini**, not Anthropic — Claude has no embeddings endpoint; both are kept behind the same swappable `EmbeddingProvider` interface.
- **Voice-note transcription via Groq Whisper** — free, fast, auto-detects language; kept as its own module (`src/lib/ai/transcription.ts`) independent of which chat provider actually generates the reply.
- **WhatsApp app secret / verify token are platform-level env vars**, not per-tenant DB columns — they belong to the one shared Meta App/webhook URL; only `phone_number_id`/access token are genuinely per-tenant (per hotel's own WABA).
- **Follow-ups fire via a 60-second polling sweep** (`src/lib/follow-ups/sweep.ts`), not one BullMQ delayed job per rule — simpler to keep in sync with "cancel the moment the guest replies," and the spec explicitly allows "a queue... or a cron worker."
- **Login resolves by email alone** (not a workspace-picker step) even though email is unique *per tenant* in the schema — reasonable until the same person genuinely staffs two hotels with one email.
- **Outbound room photos are sent by hosted URL** (the hotel's own site, or wherever `Room.imageUrls` point), not WhatsApp's upload-by-media-id endpoint — simpler given the URLs already exist and are public.
- **No OCR on uploaded images** in the knowledge base (spec marked this optional) — image docs are stored and listed but don't contribute to RAG retrieval.
- **Revenue dashboard card omitted** — marked optional in the spec, and there's no payment/invoice model in scope.
- **"Broadcast Templates" has no dedicated settings CRUD** — actual WhatsApp template creation/approval happens in Meta Business Manager; a template is just referenced by its approved name in a Follow-up rule or Campaign.
- **`docker-compose.yml` added** (not explicitly requested) purely for local dev convenience — Postgres with `pgvector` preinstalled + Redis.
- **Deployed to a self-managed VPS (Hostinger) rather than a PaaS** — chosen so the worker process can run truly continuously (no free-tier cold starts, which caused real delivery delays during testing) and so infrastructure cost/control sits with the operator directly.

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
    ai/                  AIProvider fallback chain (Gemini/Groq/Mistral/Anthropic) + EmbeddingProvider
                          (Voyage/Gemini) + RAG + transcription (Groq Whisper) + the reply pipeline
    whatsapp/             Cloud API client (send/media), webhook parsing + signature verification, 24h window
    inbound/              webhook → contact/message persistence (incl. voice transcription) → queue → AI reply
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
