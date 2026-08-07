import Link from "next/link";
import {
  Bot,
  CheckCircle2,
  Clock,
  Lock,
  Megaphone,
  MessageCircle,
  Plug,
  Sparkles,
  Target,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HeroGlow } from "@/components/hero-glow";
import { ChatMockup } from "@/components/marketing/chat-mockup";
import { SiteNav } from "@/components/marketing/site-nav";
import { Reveal } from "@/components/motion/reveal";
import { TiltCard } from "@/components/motion/tilt-card";
import { TemplateCard } from "@/components/templates/template-card";
import { getSessionFromCookies } from "@/lib/auth/session";
import { WA_TEMPLATES } from "@/lib/wa-templates";

const FEATURES = [
  {
    icon: Bot,
    title: "AI concierge, always on",
    body: "Anushka is trained on your hotel — rooms, pricing, policies, FAQs — and answers guests instantly in natural conversation. The moment she's unsure, she escalates to your team with full context.",
  },
  {
    icon: Clock,
    title: "Follow-ups that don't forget",
    body: "When a lead goes quiet, a sequenced follow-up plan nudges them automatically — reminder, offer, last call — cancelled the instant they reply.",
  },
  {
    icon: Megaphone,
    title: "Broadcast campaigns",
    body: "Segment guests by stage and send offers or updates in bulk, respecting WhatsApp's messaging rules. Replies flow straight back into the same conversation.",
  },
  {
    icon: Target,
    title: "Every lead, tagged and reachable",
    body: "Guests who message in from a Meta ad are tagged automatically. Upload your old contact list from Excel or paste it in, and re-engage them with one approved-template message — no manual campaign-building required.",
  },
] as const;

const STEPS = [
  { title: "Connect your WhatsApp number", body: "Link your Meta WhatsApp Business number — we'll walk you through it." },
  { title: "Teach Anushka about your hotel", body: "Add rooms, pricing, offers, and FAQs — Anushka uses them to answer guests accurately." },
  { title: "Go live", body: "Anushka handles the conversation. You get notified only when she genuinely needs you." },
] as const;

const TRUST_POINTS = [
  { icon: Plug, label: "Official WhatsApp Business API" },
  { icon: Clock, label: "24/7 AI availability" },
  { icon: Lock, label: "Multi-tenant — your data stays yours" },
  { icon: Sparkles, label: "Live at Hotel Ivory Towers, Hyderabad" },
] as const;

const FAQS = [
  {
    q: "Do I need my own WhatsApp Business API account?",
    a: "You'll need a Meta WhatsApp Business number — we'll help you connect it once you're onboarded. Anushka runs on top of the official API, not a workaround.",
  },
  {
    q: "What happens when Anushka doesn't know the answer?",
    a: "She escalates instantly to your team's dashboard with the full conversation context — nothing gets silently dropped.",
  },
  {
    q: "Can I try it before paying?",
    a: "Yes — sign up and your workspace starts on a free trial immediately, no card required.",
  },
  {
    q: "Is my hotel's data separate from other hotels on the platform?",
    a: "Completely. HotelOS Ultra is multi-tenant by design — every hotel's contacts, conversations, and knowledge base are fully isolated.",
  },
  {
    q: "Can I write my own messages instead of using templates?",
    a: "Always — the template library is just a starting point. Edit anything before you send it, or write from scratch.",
  },
] as const;

const PRICING_FEATURES = [
  "Unlimited AI conversations with Anushka",
  "Automated follow-up sequences",
  "Broadcast campaigns to segmented guests",
  "Knowledge base with document upload",
  "Multi-staff access & escalation inbox",
  "Admin dashboard with analytics",
] as const;

export default async function MarketingPage() {
  const session = await getSessionFromCookies();

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteNav loggedIn={!!session} />

      {/* Hero */}
      <section className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-10 overflow-hidden px-4 py-16 md:flex-row md:py-24">
        <HeroGlow />
        <Reveal className="flex flex-1 flex-col gap-5 text-center md:text-left">
          <div>
            <h1 className="font-heading text-4xl leading-[1.1] font-semibold tracking-tight text-balance md:text-5xl">
              Turn WhatsApp into your hotel&apos;s 24/7 front desk
            </h1>
            <p className="mt-4 text-base text-muted-foreground md:text-lg">
              Anushka answers guest questions, takes bookings, and follows up automatically — so nothing falls through the
              cracks, and your staff only steps in when it truly matters.
            </p>
          </div>
          <div className="flex flex-col items-center gap-3 sm:flex-row md:justify-start">
            <Button size="lg" className="h-11 w-full px-6 text-base sm:w-auto" nativeButton={false} render={<Link href="/register" />}>
              Start free trial
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-11 w-full px-6 text-base sm:w-auto"
              nativeButton={false}
              render={<a href="#features" />}
            >
              See how it works
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">No card required · Built only for hotels</p>
        </Reveal>

        <Reveal delay={150} className="flex flex-1 justify-center">
          <TiltCard>
            <ChatMockup />
          </TiltCard>
        </Reveal>
      </section>

      {/* Trust bar */}
      <Reveal>
        <section className="mx-auto w-full max-w-6xl px-4 pb-16">
          <div className="flex flex-wrap items-center justify-center gap-3 md:justify-between">
            {TRUST_POINTS.map((t) => (
              <div key={t.label} className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <t.icon className="size-3.5" />
                </span>
                {t.label}
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* Features */}
      <section id="features" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16">
        <Reveal>
          <div className="mx-auto max-w-xl text-center">
            <h2 className="font-heading text-3xl font-semibold tracking-tight">Everything a hotel actually needs</h2>
            <p className="mt-3 text-muted-foreground">No bloated multi-industry feature list — just what turns WhatsApp into bookings.</p>
          </div>
        </Reveal>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 80}>
              <Card className="h-full">
                <CardContent className="flex h-full flex-col gap-3">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <f.icon className="size-5" />
                  </span>
                  <p className="font-heading text-base font-semibold">{f.title}</p>
                  <p className="text-sm text-muted-foreground">{f.body}</p>
                </CardContent>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <Reveal>
          <div className="mx-auto max-w-xl text-center">
            <h2 className="font-heading text-3xl font-semibold tracking-tight">Live in three steps</h2>
          </div>
        </Reveal>
        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 80}>
              <Card className="h-full">
                <CardContent className="flex h-full flex-col gap-2">
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-[0_2px_10px_-2px_var(--primary)]">
                    {i + 1}
                  </span>
                  <p className="font-heading text-base font-semibold">{s.title}</p>
                  <p className="text-sm text-muted-foreground">{s.body}</p>
                </CardContent>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Escalation highlight */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <Reveal>
          <Card className="overflow-hidden">
            <CardContent className="grid grid-cols-1 items-center gap-8 md:grid-cols-2">
              <div className="flex flex-col gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <TriangleAlert className="size-5" />
                </span>
                <h2 className="font-heading text-2xl font-semibold tracking-tight">Never miss what actually needs you</h2>
                <p className="text-sm text-muted-foreground">
                  Anushka handles the routine. The moment a conversation needs a human — a tricky question, an angry guest,
                  a request she can&apos;t fulfil — it lands straight in your team&apos;s escalation inbox, with the full
                  conversation attached.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                  <div className="min-w-0 flex-1 text-xs">
                    <p className="font-medium">Priya Menon</p>
                    <p className="mt-0.5 text-muted-foreground">Asked about a group booking discount for 12 rooms — needs manual pricing.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                  <div className="min-w-0 flex-1 text-xs">
                    <p className="font-medium">Arjun Rao</p>
                    <p className="mt-0.5 text-muted-foreground">Reported an issue with room AC — flagged for immediate follow-up.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Reveal>
      </section>

      {/* Templates */}
      <section id="templates" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16">
        <Reveal>
          <div className="mx-auto max-w-xl text-center">
            <h2 className="font-heading text-3xl font-semibold tracking-tight">Message templates built for hotels</h2>
            <p className="mt-3 text-muted-foreground">
              Skip the blank page. Every template below ships in your account from day one — copy it here, or insert it
              straight into a campaign or follow-up step once you&apos;re in.
            </p>
          </div>
        </Reveal>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {WA_TEMPLATES.slice(0, 6).map((t, i) => (
            <Reveal key={t.id} delay={(i % 3) * 80}>
              <TemplateCard template={t} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto w-full max-w-2xl scroll-mt-20 px-4 py-16">
        <Reveal>
          <div className="mx-auto max-w-xl text-center">
            <h2 className="font-heading text-3xl font-semibold tracking-tight">Simple, single-plan pricing</h2>
            <p className="mt-3 text-muted-foreground">No tiers to compare, no per-message markup — one plan with everything.</p>
          </div>
        </Reveal>
        <Reveal delay={100}>
          <Card variant="glass" className="mt-10">
            <CardContent className="flex flex-col gap-5">
              <div className="text-center">
                <p className="font-heading text-4xl font-semibold">
                  ₹1,000<span className="text-base font-normal text-muted-foreground"> / month</span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">Per hotel. Cancel anytime.</p>
              </div>
              <ul className="flex flex-col gap-2">
                {PRICING_FEATURES.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="size-4 shrink-0 text-primary" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button size="lg" className="h-11 text-base" nativeButton={false} render={<Link href="/register" />}>
                Start free trial
              </Button>
              <p className="text-center text-xs text-muted-foreground">No card required to get started.</p>
            </CardContent>
          </Card>
        </Reveal>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto w-full max-w-2xl scroll-mt-20 px-4 py-16">
        <Reveal>
          <div className="mx-auto max-w-xl text-center">
            <h2 className="font-heading text-3xl font-semibold tracking-tight">Frequently asked questions</h2>
          </div>
        </Reveal>
        <Reveal delay={100}>
          <div className="mt-10 flex flex-col gap-2">
            {FAQS.map((f) => (
              <details key={f.q} className="group glass rounded-xl px-4 py-3 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium">
                  {f.q}
                  <span className="shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="glass mt-8 rounded-none border-r-0 border-b-0 border-l-0">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <MessageCircle className="size-3.5" />
            </span>
            <span className="font-heading text-sm font-semibold">HotelOS Ultra</span>
            <span className="text-xs text-muted-foreground">— WhatsApp AI, built only for hotels</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/login" className="text-muted-foreground hover:text-foreground">
              Log in
            </Link>
            <Link href="/register" className="font-medium text-primary hover:underline">
              Start free trial
            </Link>
          </div>
        </div>
        <p className="pb-6 text-center text-xs text-muted-foreground">© 2026 HotelOS Ultra.</p>
      </footer>
    </div>
  );
}
