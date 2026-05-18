import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { listMarketplace, type ListingRow, type Tier } from "@/lib/marketplace.functions";
import { MediatorBot } from "@/components/MediatorBot";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtFiat } from "@/lib/format";
import { Crown, ShieldCheck, Send, Globe, Plus, Search, Sparkles, ArrowLeftRight, Handshake } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Marketplace — EscrowDesk" },
      { name: "description", content: "Browse active selling and seeking listings from premium, trusted, and regular members." },
    ],
  }),
  component: MarketplacePage,
});

function MarketplacePage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const fetchMarket = useServerFn(listMarketplace);
  const [q, setQ] = useState("");
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["marketplace", q],
    queryFn: () => fetchMarket({ data: { q: q || undefined } }),
    refetchInterval: 20_000,
  });

  const tiers: { key: Tier; label: string; icon: React.ReactNode; subtitle: string; emptyHint?: string }[] = [
    { key: "premium", label: "Premium members", icon: <Crown className="h-4 w-4" />, subtitle: "Top-tier merchants: Trusted + 25 trades, 15 five-star ratings, $5,000 BTC traded.", emptyHint: "No Premium members yet. Reach the milestones from your Wallet page to unlock this tier." },
    { key: "trusted", label: "Trusted & vouched", icon: <ShieldCheck className="h-4 w-4" />, subtitle: "Earn the Trusted badge: 5 successful trades, 5 different 4★+ raters, 3 trades with one partner, $500 BTC traded.", emptyHint: "No Trusted members yet — be the first to complete the journey." },
    { key: "regular", label: "Regular members", icon: <Sparkles className="h-4 w-4" />, subtitle: "New & standard sellers and seekers." },
  ];

  return (
    <div className="space-y-10">
      {/* Hero with mediator bot */}
      <section className="surface relative overflow-hidden p-6 md:p-10">
        <div className="absolute inset-0 -z-10 opacity-30" style={{ background: "radial-gradient(circle at 70% 20%, color-mix(in oklab, var(--primary) 35%, transparent), transparent 60%)" }} />
        <div className="grid items-center gap-8 md:grid-cols-2">
          <div className="space-y-4">
            <Badge variant="outline" className="font-mono text-[11px]"><ArrowLeftRight className="mr-1 h-3 w-3" /> Mediated marketplace</Badge>
            <h1 className="text-3xl font-semibold leading-tight md:text-4xl">
              List what you <span className="text-primary">sell</span>. Find what you <span className="text-primary">seek</span>.
            </h1>
            <p className="text-sm text-muted-foreground md:text-base">
              Our bot sits between buyer and seller — chat, agree, and trade safely.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => nav({ to: user ? "/post-listing" : "/auth" })} className="gap-2">
                <Plus className="h-4 w-4" /> Post a listing
              </Button>
              <Link to="/order-book"><Button variant="outline">Escrow order book</Button></Link>
            </div>
          </div>
          <MediatorBot />
        </div>
      </section>

      {/* Search */}
      <section className="surface p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search listings by name…" className="pl-9" />
          </div>
          <Badge variant="secondary" className="font-mono">{data?.total ?? 0} active</Badge>
          <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>Refresh</Button>
        </div>
      </section>

      {/* Tier sections */}
      {tiers.map((t) => {
        const group = data?.groups?.[t.key];
        return (
          <TierSection
            key={t.key}
            label={t.label}
            subtitle={t.subtitle}
            icon={t.icon}
            emptyHint={t.emptyHint}
            selling={group?.selling ?? []}
            seeking={group?.seeking ?? []}
            loading={isLoading}
          />
        );
      })}
    </div>
  );
}

function TierSection({ label, subtitle, icon, emptyHint, selling, seeking, loading }: {
  label: string; subtitle: string; icon: React.ReactNode; emptyHint?: string;
  selling: ListingRow[]; seeking: ListingRow[]; loading?: boolean;
}) {
  const isEmpty = selling.length === 0 && seeking.length === 0;
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}
      className="surface p-5"
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-primary/15 text-primary">{icon}</div>
          <div>
            <h2 className="text-lg font-semibold leading-tight">{label}</h2>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <ListingTable title="Selling" tone="primary" rows={selling} loading={loading} emptyText="No active selling listings." />
        <ListingTable title="Seeking" tone="accent" rows={seeking} loading={loading} emptyText="No active seeking listings." />
      </div>

      {isEmpty && emptyHint && !loading && (
        <p className="mt-3 rounded-md border border-dashed border-border/60 bg-secondary/20 px-3 py-2 text-center text-[11px] text-muted-foreground">
          {emptyHint}
        </p>
      )}
    </motion.section>
  );
}


function ListingTable({ title, tone, rows, loading, emptyText }: {
  title: string; tone: "primary" | "accent"; rows: ListingRow[]; loading?: boolean; emptyText: string;
}) {
  const accent = tone === "primary" ? "text-primary" : "text-foreground";
  return (
    <div className="rounded-lg border border-border/60 bg-secondary/10">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <h3 className={`text-sm font-semibold uppercase tracking-wider ${accent}`}>{title}</h3>
        <span className="text-[10px] font-mono text-muted-foreground">{rows.length} listing{rows.length === 1 ? "" : "s"}</span>
      </div>
      <div className="max-h-[420px] divide-y divide-border/40 overflow-y-auto">
        <AnimatePresence initial={false}>
          {rows.map((r) => <ListingCard key={r.id} row={r} />)}
        </AnimatePresence>
        {!loading && rows.length === 0 && (
          <p className="p-6 text-center text-xs text-muted-foreground">{emptyText}</p>
        )}
      </div>
    </div>
  );
}

function ListingCard({ row }: { row: ListingRow }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const tg = row.contact_telegram?.replace(/^@/, "");
  const tgLink = tg ? `https://t.me/${tg}` : row.profile?.telegram_username ? `https://t.me/${row.profile.telegram_username.replace(/^@/, "")}` : null;
  const web = row.contact_website
    ? row.contact_website.startsWith("http") ? row.contact_website : `https://${row.contact_website}`
    : null;
  const rating = useMemo(() => {
    if (!row.profile?.rating_count) return null;
    return (row.profile.rating_sum / row.profile.rating_count).toFixed(1);
  }, [row.profile]);
  const startTrade = () => {
    if (!user) return nav({ to: "/auth" });
    nav({ to: "/escrow/new", search: { listing: row.id } });
  };
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      whileHover={{ backgroundColor: "color-mix(in oklab, var(--secondary) 30%, transparent)" }}
      className="p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{row.name}</span>
            {row.profile?.is_premium && <Crown className="h-3.5 w-3.5 text-primary" />}
            {row.profile?.is_trusted && <ShieldCheck className="h-3.5 w-3.5 text-primary" />}
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{row.description}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-[10px]">{row.category}</Badge>
            {row.amount != null && (
              <span className="font-mono text-xs text-primary">{fmtFiat(Number(row.amount), row.currency || "USD")}</span>
            )}
            <span className="text-[10px] text-muted-foreground">· {row.profile?.display_name ?? "—"}</span>
            {rating && <span className="text-[10px] text-muted-foreground">· ★ {rating}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button size="sm" onClick={startTrade} className="h-7 gap-1 px-2 text-[11px]">
            <Handshake className="h-3 w-3" /> {row.kind === "selling" ? "Trade" : "Offer"}
          </Button>
          {tgLink && (
            <a href={tgLink} target="_blank" rel="noreferrer">
              <Button size="sm" variant="secondary" className="h-7 gap-1 px-2 text-[11px]"><Send className="h-3 w-3" /> Telegram</Button>
            </a>
          )}
          {web && (
            <a href={web} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px]"><Globe className="h-3 w-3" /> Website</Button>
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
}
