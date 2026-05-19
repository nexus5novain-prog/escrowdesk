import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MediatorBot } from "@/components/MediatorBot";
import { CryptoCalculator } from "@/components/CryptoCalculator";
import { ShieldCheck, Send, Lock, Sparkles, Handshake, Bot, Globe, ArrowRight, Zap, Users, CheckCircle2, Wallet, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Escrow Desk — Enterprise-grade P2P Crypto Escrow" },
      { name: "description", content: "Escrow Desk is a mediated peer-to-peer escrow platform for crypto traders. Trade BTC, ETH, USDT and USDC safely with on-platform escrow, dispute mediation, and a fully integrated Telegram bot." },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="space-y-16">
      <Hero />
      <Stats />
      <HowItWorks />
      <Features />
      <SecuritySection />
      <CTASection />
    </div>
  );
}

function Hero() {
  return (
    <section className="surface relative overflow-hidden p-6 md:p-12">
      <BackgroundOrbs />
      <FloatingBots />
      <div className="relative grid items-center gap-10 md:grid-cols-2">
        <div className="space-y-5">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Badge variant="outline" className="font-mono text-[11px]">
              <ShieldCheck className="mr-1 h-3 w-3" /> Mediated · Telegram-native · Non-custodial-first
            </Badge>
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="text-4xl font-semibold leading-tight md:text-5xl"
          >
            Crypto trades, <span className="text-primary">settled by a mediator</span> — not by trust.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="text-sm text-muted-foreground md:text-base"
          >
            Escrow Desk is a peer-to-peer escrow platform built for serious crypto traders.
            Every deal sits behind a verified escrow group, a human-grade mediator bot, and a full
            Telegram control surface — so buyers fund safely, sellers release on agreement, and
            disputes get resolved on-platform, on the record.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="flex flex-wrap gap-2"
          >
            <Link to="/marketplace"><Button className="gap-2">Browse marketplace <ArrowRight className="h-4 w-4" /></Button></Link>
            <Link to="/escrow/new"><Button variant="outline" className="gap-2"><Lock className="h-4 w-4" /> Start an escrow</Button></Link>
            <a href="https://t.me/" target="_blank" rel="noreferrer">
              <Button variant="secondary" className="gap-2"><Send className="h-4 w-4" /> Open Telegram bot</Button>
            </a>
          </motion.div>
          <div className="flex flex-wrap gap-3 pt-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-primary" /> Non-custodial deposits</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-primary" /> Tiered reputation</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-primary" /> 24/7 mediation</span>
          </div>
        </div>
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
          <MediatorBot />
          <div className="mt-6"><CryptoCalculator /></div>
        </motion.div>
      </div>
    </section>
  );
}

function BackgroundOrbs() {
  return (
    <>
      <motion.div
        aria-hidden
        className="absolute -left-32 -top-32 h-80 w-80 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, color-mix(in oklab, var(--primary) 50%, transparent), transparent 70%)" }}
        animate={{ x: [0, 30, 0], y: [0, 20, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="absolute -right-24 bottom-0 h-72 w-72 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, color-mix(in oklab, var(--accent) 40%, transparent), transparent 70%)" }}
        animate={{ x: [0, -20, 0], y: [0, -15, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
    </>
  );
}

function FloatingBots() {
  const items = [
    { Icon: Bot, x: "8%", y: "70%", delay: 0 },
    { Icon: ShieldCheck, x: "85%", y: "12%", delay: 1.5 },
    { Icon: Sparkles, x: "60%", y: "85%", delay: 3 },
  ];
  return (
    <>
      {items.map(({ Icon, x, y, delay }, i) => (
        <motion.div
          key={i}
          aria-hidden
          className="pointer-events-none absolute hidden text-primary/30 md:block"
          style={{ left: x, top: y }}
          animate={{ y: [0, -14, 0], rotate: [0, 8, -8, 0] }}
          transition={{ duration: 6, repeat: Infinity, delay, ease: "easeInOut" }}
        >
          <Icon className="h-6 w-6" />
        </motion.div>
      ))}
    </>
  );
}

function Stats() {
  const stats = [
    { label: "Avg. settlement", value: "< 12 min", icon: Zap },
    { label: "Supported assets", value: "BTC only", icon: Wallet },
    { label: "Mediator coverage", value: "24 / 7", icon: ShieldCheck },
    { label: "Telegram-native", value: "100%", icon: Send },
  ];
  return (
    <section className="grid gap-3 md:grid-cols-4">
      {stats.map((s, i) => (
        <motion.div
          key={s.label}
          initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}
          className="surface p-4"
        >
          <s.icon className="h-4 w-4 text-primary" />
          <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
          <p className="text-base font-semibold">{s.value}</p>
        </motion.div>
      ))}
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: 1, title: "Post or pick a listing", body: "Sellers list services or assets; buyers seek what they need. Tiered by Premium, Trusted, and Regular reputation.", icon: Sparkles },
    { n: 2, title: "Auto-create escrow", body: "Buyer clicks Trade — an escrow group is opened against the seller's payout address with the agreed amount and asset.", icon: Lock },
    { n: 3, title: "Mediator watches the room", body: "Chat, attach evidence, and let the bot enforce the agreement. Telegram alerts every step of the way.", icon: Bot },
    { n: 4, title: "Release on agreement", body: "Both parties sign off — funds release to the seller. Disputes route to a human moderator with full audit trail.", icon: Handshake },
  ];
  return (
    <section>
      <SectionHeader eyebrow="How it works" title="From handshake to settlement in four steps" />
      <div className="grid gap-4 md:grid-cols-4">
        {steps.map((s, i) => (
          <motion.div
            key={s.n}
            initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
            className="surface relative overflow-hidden p-5"
          >
            <div className="absolute right-3 top-3 font-mono text-3xl text-primary/15">{s.n.toString().padStart(2, "0")}</div>
            <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/15 text-primary">
              <s.icon className="h-4 w-4" />
            </div>
            <h3 className="mt-3 text-sm font-semibold">{s.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{s.body}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function Features() {
  const features = [
    { title: "Marketplace with reputation tiers", body: "Premium and Trusted badges are earned, not bought — milestones based on volume, distinct partners, and verified ratings.", icon: Users },
    { title: "Live trades dashboard", body: "Open, pending, successful, and failed trades — all counted live across your portfolio in real time.", icon: Zap },
    { title: "On-platform messaging", body: "Every trade has its own room with the mediator bot, evidence uploads, and timestamped chat.", icon: MessageSquare },
    { title: "Telegram control surface", body: "Link your account and run trades, deposits, releases, and disputes from the bot — wherever you are.", icon: Send },
    { title: "BTC-only payouts", body: "Add a Bitcoin payout address to your profile and receive all escrow settlements in BTC.", icon: Wallet },
    { title: "Global by default", body: "Borderless P2P, currency-agnostic listings, fiat valuations on every quote.", icon: Globe },
  ];
  return (
    <section>
      <SectionHeader eyebrow="Why Escrow Desk" title="Built for traders who can't afford to be wrong" />
      <div className="grid gap-4 md:grid-cols-3">
        {features.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}
            className="surface p-5"
          >
            <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/15 text-primary"><f.icon className="h-4 w-4" /></div>
            <h3 className="mt-3 text-sm font-semibold">{f.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{f.body}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function SecuritySection() {
  return (
    <section className="surface relative overflow-hidden p-6 md:p-10">
      <div className="absolute inset-0 -z-10 opacity-30" style={{ background: "radial-gradient(circle at 30% 20%, color-mix(in oklab, var(--primary) 30%, transparent), transparent 60%)" }} />
      <div className="grid items-center gap-8 md:grid-cols-2">
        <div>
          <Badge variant="outline" className="font-mono text-[11px]"><ShieldCheck className="mr-1 h-3 w-3" /> Security model</Badge>
          <h2 className="mt-3 text-2xl font-semibold md:text-3xl">Funds protected. Reputation earned. Disputes mediated.</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Escrow Desk treats every trade as a sealed room: buyer-funded deposits, seller-locked payouts,
            a mediator with visibility into the entire conversation, and a moderator team to escalate when
            things go sideways. We don't custody your wallets — we orchestrate the deal.
          </p>
          <ul className="mt-4 space-y-2 text-xs text-muted-foreground">
            <li className="flex gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Row-level data isolation for every escrow group.</li>
            <li className="flex gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Verified Telegram identity required for releases.</li>
            <li className="flex gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Tamper-evident chat & evidence log on every dispute.</li>
            <li className="flex gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> 1–5 star ratings aggregated and visible site-wide.</li>
          </ul>
        </div>
        <MediatorBot />
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="surface relative overflow-hidden p-8 text-center md:p-12">
      <div className="absolute inset-0 -z-10" style={{ background: "linear-gradient(135deg, color-mix(in oklab, var(--primary) 18%, transparent), transparent 60%)" }} />
      <h2 className="text-2xl font-semibold md:text-3xl">Trade like a pro — backed by a mediator that never sleeps.</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
        Spin up your first escrow in under a minute. Link Telegram for instant alerts. Build the reputation that unlocks Premium tier.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link to="/auth"><Button className="gap-2">Create an account <ArrowRight className="h-4 w-4" /></Button></Link>
        <Link to="/marketplace"><Button variant="outline">Browse marketplace</Button></Link>
      </div>
    </section>
  );
}

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-6 text-center">
      <p className="text-[11px] font-mono uppercase tracking-wider text-primary">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-semibold md:text-3xl">{title}</h2>
    </div>
  );
}
