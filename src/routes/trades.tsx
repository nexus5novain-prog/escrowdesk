import { createFileRoute } from "@tanstack/react-router";
import { AuthGate } from "@/components/AuthGate";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listMyPurchases } from "@/lib/trades.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { fmtFiat } from "@/lib/format";
import {
  ShoppingBag, CreditCard, BookOpen, ScanLine, Store,
  Copy, Download, CheckCircle2, XCircle, ShieldCheck,
  Package, Calendar, Bitcoin, Eye, Lock,
} from "lucide-react";

export const Route = createFileRoute("/trades")({
  head: () => ({ meta: [{ title: "My Trades — EscrowDesk" }] }),
  component: () => (<AuthGate><TradesPage /></AuthGate>),
});

type CardMeta = {
  type: "card";
  card_number: string;
  card_name: string;
  card_address: string;
  card_status: "active" | "dead";
  btc_rate: string;
  notes: string;
};

function parseCard(description: string): CardMeta | null {
  try {
    const p = JSON.parse(description);
    if (p?.type === "card") return p as CardMeta;
  } catch { /* */ }
  return null;
}

function fmtCard(num: string) {
  const c = num.replace(/\D/g, "");
  return c.match(/.{1,4}/g)?.join(" ") ?? num;
}

function copyText(text: string, label: string) {
  navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`)).catch(() => toast.error("Copy failed"));
}

function CopyBtn({ text, label }: { text: string; label: string }) {
  return (
    <button onClick={() => copyText(text, label)}
      className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-secondary/40 px-2 py-0.5 text-[11px] hover:bg-secondary transition-colors">
      <Copy className="h-3 w-3" />
      Copy
    </button>
  );
}

function CardPurchasePanel({ listing }: { listing: { name: string; description: string; amount: number | null; currency: string | null } }) {
  const [revealed, setRevealed] = useState(false);
  const card = parseCard(listing.description);
  if (!card) return <p className="text-sm text-muted-foreground">{listing.description}</p>;
  const num = fmtCard(card.card_number);
  const isActive = card.card_status === "active";
  return (
    <div className="space-y-4">
      <div className="rounded-2xl overflow-hidden border border-white/10"
        style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)" }}>
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-amber-400" />
              <span className="text-xs font-semibold uppercase tracking-widest text-white/60">Full Card Details</span>
            </div>
            <div className={`flex items-center gap-1 text-[10px] font-bold uppercase rounded-full px-2.5 py-0.5 ${isActive ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-red-500/20 text-red-400 border border-red-500/30"}`}>
              {isActive ? <><CheckCircle2 className="h-3 w-3" />Active</> : <><XCircle className="h-3 w-3" />Dead</>}
            </div>
          </div>
          {card.card_name && (
            <div className="text-white/80 text-sm font-semibold uppercase tracking-widest">{card.card_name}</div>
          )}
          <div className="space-y-1">
            <div className="text-[10px] text-white/40 uppercase tracking-wider">Card Number</div>
            <div className="flex items-center gap-2">
              {revealed ? (
                <>
                  <span className="font-mono text-lg tracking-[0.25em] text-white select-all">{num}</span>
                  <CopyBtn text={card.card_number} label="Card number" />
                </>
              ) : (
                <>
                  <span className="font-mono text-lg tracking-[0.25em] text-white">{num.slice(0, 9)}<span className="blur-sm">{num.slice(9)}</span></span>
                  <Button size="sm" variant="ghost" onClick={() => setRevealed(true)} className="h-6 text-[11px] gap-1 text-amber-400 hover:text-amber-300">
                    <Eye className="h-3 w-3" />Reveal
                  </Button>
                </>
              )}
            </div>
          </div>

          {card.card_address && (
            <div className="space-y-1">
              <div className="text-[10px] text-white/40 uppercase tracking-wider">Billing Address</div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-white/80">{revealed ? card.card_address : `${card.card_address.slice(0, 12)}…`}</span>
                {revealed && <CopyBtn text={card.card_address} label="Address" />}
              </div>
            </div>
          )}

          {card.btc_rate && card.btc_rate !== "0" && (
            <div className="flex items-center gap-2 text-[11px] text-amber-400/80">
              <Bitcoin className="h-3 w-3" />
              <span>BTC equiv: {card.btc_rate}</span>
            </div>
          )}
        </div>
      </div>

      {card.notes && (
        <div className="rounded-xl border border-border/40 bg-secondary/20 p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Notes</div>
          <p className="text-sm text-foreground/80">{card.notes}</p>
        </div>
      )}

      {revealed && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => {
            const text = [
              `Card: ${listing.name}`,
              `Number: ${card.card_number}`,
              `Name: ${card.card_name}`,
              `Address: ${card.card_address}`,
              `Status: ${card.card_status}`,
              `Notes: ${card.notes}`,
            ].join("\n");
            const blob = new Blob([text], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${listing.name.replace(/\s+/g, "_")}.txt`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success("Downloaded");
          }}
        >
          <Download className="h-3.5 w-3.5" />
          Download card info
        </Button>
      )}
    </div>
  );
}

function GeneralPurchasePanel({ listing }: { listing: { name: string; description: string } }) {
  return (
    <div className="rounded-xl border border-border/40 bg-secondary/20 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        <span className="text-sm font-medium">Purchase confirmed — full details below</span>
      </div>
      <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{listing.description}</p>
      <CopyBtn text={listing.description} label="Details" />
    </div>
  );
}

const SECTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  CARD: CreditCard,
  ENROLL: BookOpen,
  SCANNER: ScanLine,
  GENERAL: Store,
};

const SECTION_LABELS: Record<string, string> = {
  CARD: "Cards",
  ENROLL: "Enrollments",
  SCANNER: "Scanner Tools",
  GENERAL: "General",
};

const SECTION_ACCENT: Record<string, string> = {
  CARD: "border-amber-500/30 bg-amber-500/5",
  ENROLL: "border-blue-500/30 bg-blue-500/5",
  SCANNER: "border-emerald-500/30 bg-emerald-500/5",
  GENERAL: "border-primary/30 bg-primary/5",
};

type Purchase = {
  id: string;
  listing_id: string | null;
  amount: number | null;
  fiat_amount: number | null;
  fiat_currency: string | null;
  asset: string;
  released_at: string | null;
  created_at: string;
  listing: {
    id: string;
    name: string;
    description: string;
    category: string;
    amount: number | null;
    currency: string | null;
    contact_telegram: string | null;
    image_url: string | null;
    user_id: string;
  } | null;
};

function PurchaseCard({ purchase }: { purchase: Purchase }) {
  const [open, setOpen] = useState(false);
  const listing = purchase.listing;
  if (!listing) return null;
  const category = (listing.category ?? "GENERAL").toUpperCase() as keyof typeof SECTION_ICONS;
  const Icon = SECTION_ICONS[category] ?? Package;
  const accent = SECTION_ACCENT[category] ?? SECTION_ACCENT.GENERAL;
  const isCard = category === "CARD";
  const releasedAt = purchase.released_at ? new Date(purchase.released_at) : null;

  return (
    <article className={`rounded-2xl border transition-all ${open ? "border-primary/40" : "border-border/40 hover:border-primary/20"}`}>
      <button
        className="w-full text-left"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-4 p-4">
          <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl border ${accent}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm leading-snug">{listing.name}</span>
              <Badge className={`text-[10px] border-0 ${isCard ? "bg-amber-500/15 text-amber-400" : "bg-primary/15 text-primary"}`}>
                {SECTION_LABELS[category] ?? category}
              </Badge>
              <Badge className="text-[10px] bg-emerald-500/15 text-emerald-400 border-0">
                <ShieldCheck className="h-2.5 w-2.5 mr-1" />Released
              </Badge>
            </div>
            <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
              {releasedAt && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {releasedAt.toLocaleDateString()}
                </span>
              )}
              {(purchase.fiat_amount ?? listing.amount) && (
                <span>{fmtFiat(purchase.fiat_amount ?? listing.amount ?? 0, purchase.fiat_currency ?? listing.currency ?? "USD")}</span>
              )}
            </div>
          </div>
          <div className="shrink-0 text-muted-foreground">
            <Eye className={`h-4 w-4 transition-transform ${open ? "text-primary rotate-180" : ""}`} />
          </div>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-0 border-t border-border/30">
          <div className="pt-4">
            {isCard
              ? <CardPurchasePanel listing={listing} />
              : <GeneralPurchasePanel listing={listing} />
            }
          </div>
        </div>
      )}
    </article>
  );
}

function TradesPage() {
  const fetchPurchases = useServerFn(listMyPurchases);
  const { data, isLoading } = useQuery({
    queryKey: ["my-purchases"],
    queryFn: () => fetchPurchases(),
    refetchInterval: 30_000,
  });

  const purchases = (data?.purchases ?? []).filter((p) => p.listing != null) as Purchase[];

  const grouped = purchases.reduce<Record<string, Purchase[]>>((acc, p) => {
    const cat = ((p.listing?.category ?? "GENERAL") as string).toUpperCase();
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  const hasAny = purchases.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="surface overflow-hidden rounded-3xl relative">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-primary/5" />
        <div className="relative px-6 py-10 md:py-12">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-2 flex items-center justify-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              <ShoppingBag className="h-3.5 w-3.5 text-primary" />
              Trade Library
            </div>
            <h1 className="text-4xl font-bold tracking-tight">My Purchases</h1>
            <p className="mt-2 text-sm text-muted-foreground max-w-lg mx-auto">
              All your completed marketplace purchases. Full card data and product details unlocked after escrow release.
            </p>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      {hasAny && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Object.entries(grouped).map(([cat, items]) => {
            const Icon = SECTION_ICONS[cat] ?? Package;
            return (
              <div key={cat} className="surface rounded-2xl p-4 flex items-center gap-3">
                <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${SECTION_ACCENT[cat] ?? SECTION_ACCENT.GENERAL}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-lg font-bold">{items.length}</div>
                  <div className="text-[11px] text-muted-foreground">{SECTION_LABELS[cat] ?? cat}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Purchases list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-secondary/40" />
          ))}
        </div>
      ) : !hasAny ? (
        <div className="surface flex flex-col items-center gap-5 rounded-3xl p-16 text-center border border-border/30">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/10">
            <Lock className="h-8 w-8 text-primary/50" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">No purchases yet</h2>
            <p className="mt-1.5 text-sm text-muted-foreground max-w-xs mx-auto">
              Buy products from the Marketplace. Once your escrow is released, full details appear here.
            </p>
          </div>
          <a href="/shop" className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
            <ShoppingBag className="h-4 w-4" />
            Browse Marketplace
          </a>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([cat, items]) => {
            const Icon = SECTION_ICONS[cat] ?? Package;
            return (
              <section key={cat}>
                <div className="flex items-center gap-2 mb-3">
                  <Icon className="h-4 w-4 text-primary" />
                  <h2 className="font-semibold">{SECTION_LABELS[cat] ?? cat}</h2>
                  <span className="text-xs text-muted-foreground">({items.length})</span>
                </div>
                <div className="space-y-3">
                  {items.map((p) => <PurchaseCard key={p.id} purchase={p} />)}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
