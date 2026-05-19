import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtFiat } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowDownUp, BookOpen, TrendingDown, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/order-book")({
  head: () => ({
    meta: [
      { title: "Order Book — EscrowDesk" },
      { name: "description", content: "Live P2P order book of buy and sell offers across BTC, USDT, USDC and ETH." },
      { property: "og:title", content: "Live Order Book — EscrowDesk" },
      { property: "og:description", content: "Real-time bid and ask ladder for P2P crypto trading." },
    ],
  }),
  component: OrderBookPage,
});

type Offer = {
  id: string;
  side: "buy" | "sell";
  asset: "BTC" | "USDT" | "USDC" | "ETH";
  fiat_currency: string;
  price: number;
  min_amount: number;
  max_amount: number;
  available_crypto: number;
  status: string;
  maker_id: string;
  created_at: string;
};

const ASSETS = ["BTC", "USDT", "USDC", "ETH"] as const;

function OrderBookPage() {
  const nav = useNavigate();
  const [asset, setAsset] = useState<typeof ASSETS[number]>("BTC");
  const [offers, setOffers] = useState<Offer[]>([]);
  const [makers, setMakers] = useState<Record<string, { display_name: string; is_trusted: boolean; is_premium: boolean; trades_completed: number }>>({});
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data } = await supabase
      .from("offers")
      .select("id, side, asset, fiat_currency, price, min_amount, max_amount, available_crypto, status, maker_id, created_at")
      .eq("status", "active")
      .eq("asset", asset)
      .order("price", { ascending: true })
      .limit(200);
    const rows = (data ?? []) as Offer[];
    setOffers(rows);
    const ids = Array.from(new Set(rows.map((r) => r.maker_id)));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, display_name, is_trusted, is_premium, trades_completed")
        .in("user_id", ids);
      const map: typeof makers = {};
      (profs ?? []).forEach((p) => { map[p.user_id] = p as never; });
      setMakers(map);
    }
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    load();
    const ch = supabase
      .channel(`order-book-${asset}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "offers" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset]);

  const { bids, asks, spread, mid } = useMemo(() => {
    // Sellers maker side='sell' → asks. side='buy' → bids.
    const asks = offers.filter((o) => o.side === "sell").sort((a, b) => a.price - b.price);
    const bids = offers.filter((o) => o.side === "buy").sort((a, b) => b.price - a.price);
    const bestAsk = asks[0]?.price ?? 0;
    const bestBid = bids[0]?.price ?? 0;
    const spread = bestAsk && bestBid ? bestAsk - bestBid : 0;
    const mid = bestAsk && bestBid ? (bestAsk + bestBid) / 2 : bestAsk || bestBid || 0;
    return { bids, asks, spread, mid };
  }, [offers]);

  const fiat = offers[0]?.fiat_currency || "USD";

  const openTrade = (o: Offer) => {
    nav({ to: "/offer/$id", params: { id: o.id } });
  };

  return (
    <div className="space-y-6">
      <section className="surface rounded-3xl p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Live trading</div>
            <h1 className="flex items-center gap-2 text-3xl font-semibold"><BookOpen className="h-7 w-7 text-primary" /> Order Book</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Real-time P2P bid/ask ladder. Click any offer to start a trade — the entire flow is protected by escrow.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {ASSETS.map((a) => (
              <Button key={a} size="sm" variant={asset === a ? "default" : "outline"} onClick={() => setAsset(a)}>{a}</Button>
            ))}
            <Link to="/post-offer"><Badge variant="outline" className="cursor-pointer gap-1"><ArrowDownUp className="h-3 w-3" /> Post offer</Badge></Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="surface p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Best bid</div>
          <div className="mt-1 font-mono text-2xl text-emerald-500">{bids[0] ? fmtFiat(bids[0].price, fiat) : "—"}</div>
        </div>
        <div className="surface p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Mid · spread</div>
          <div className="mt-1 font-mono text-2xl">{mid ? fmtFiat(mid, fiat) : "—"}</div>
          <div className="text-xs text-muted-foreground">spread {spread ? fmtFiat(spread, fiat) : "—"}</div>
        </div>
        <div className="surface p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Best ask</div>
          <div className="mt-1 font-mono text-2xl text-destructive">{asks[0] ? fmtFiat(asks[0].price, fiat) : "—"}</div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Ladder title="Buy (bids)" tone="emerald" icon={<TrendingUp className="h-4 w-4 text-emerald-500" />} rows={bids} makers={makers} onPick={openTrade} fiat={fiat} />
        <Ladder title="Sell (asks)" tone="destructive" icon={<TrendingDown className="h-4 w-4 text-destructive" />} rows={asks} makers={makers} onPick={openTrade} fiat={fiat} />
      </section>

      {loading && <div className="text-center text-xs text-muted-foreground">Loading live offers…</div>}
    </div>
  );
}

function Ladder({ title, tone, icon, rows, makers, onPick, fiat }: {
  title: string;
  tone: "emerald" | "destructive";
  icon: React.ReactNode;
  rows: Offer[];
  makers: Record<string, { display_name: string; is_trusted: boolean; is_premium: boolean; trades_completed: number }>;
  onPick: (o: Offer) => void;
  fiat: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.available_crypto));
  return (
    <div className="surface">
      <header className="flex items-center justify-between border-b border-border/40 px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider">{icon} {title}</h2>
        <span className="font-mono text-xs text-muted-foreground">{rows.length}</span>
      </header>
      <div className="divide-y divide-border/40">
        {rows.map((o) => {
          const pct = (o.available_crypto / max) * 100;
          const maker = makers[o.maker_id];
          return (
            <button
              key={o.id}
              onClick={() => onPick(o)}
              className="relative grid w-full grid-cols-4 items-center gap-2 px-5 py-2.5 text-left text-xs transition-colors hover:bg-secondary/30"
            >
              <span aria-hidden className={`absolute inset-y-0 right-0 ${tone === "emerald" ? "bg-emerald-500/10" : "bg-destructive/10"}`} style={{ width: `${pct}%` }} />
              <span className={`relative font-mono ${tone === "emerald" ? "text-emerald-500" : "text-destructive"}`}>{fmtFiat(o.price, fiat)}</span>
              <span className="relative font-mono text-muted-foreground">{o.available_crypto.toFixed(4)} {o.asset}</span>
              <span className="relative font-mono text-muted-foreground">{fmtFiat(o.min_amount, fiat)}–{fmtFiat(o.max_amount, fiat)}</span>
              <span className="relative truncate text-right">
                {maker?.display_name ?? "—"}
                {maker?.is_premium && <span className="ml-1 text-amber-500">★</span>}
                {maker?.is_trusted && <span className="ml-1 text-emerald-500">✓</span>}
              </span>
            </button>
          );
        })}
        {rows.length === 0 && (
          <div className="p-8 text-center text-xs text-muted-foreground">No offers yet.</div>
        )}
      </div>
    </div>
  );
}
