import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listOffers } from "@/lib/escrow.functions";
import { fmtFiat, fmtCrypto } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRightLeft, ShieldCheck, Send, Zap } from "lucide-react";

export const Route = createFileRoute("/order-book")({ component: Home });

function Home() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [asset, setAsset] = useState<"USDT" | "BTC">("USDT");
  const [fiat, setFiat] = useState<string>("USD");
  const fetchOffers = useServerFn(listOffers);

  const { data, refetch, isFetching } = useQuery({
    queryKey: ["offers", side, asset, fiat],
    // From buyer's perspective: if I want to "buy" crypto, I list "sell" offers and vice versa.
    queryFn: () => fetchOffers({ data: { side: side === "buy" ? "sell" : "buy", asset, fiat } }),
  });

  useEffect(() => { const t = setInterval(() => refetch(), 15000); return () => clearInterval(t); }, [refetch]);

  return (
    <div className="space-y-10">
      <Hero authed={!!user} />

      <section className="surface p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">Live order book</h2>
          <Badge variant="secondary" className="font-mono">{data?.offers.length ?? 0} offers</Badge>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border border-border p-0.5">
              <button onClick={() => setSide("buy")} className={`rounded px-3 py-1 text-xs font-medium ${side==="buy"?"bg-primary text-primary-foreground":"text-muted-foreground"}`}>Buy</button>
              <button onClick={() => setSide("sell")} className={`rounded px-3 py-1 text-xs font-medium ${side==="sell"?"bg-primary text-primary-foreground":"text-muted-foreground"}`}>Sell</button>
            </div>
            <Select value={asset} onValueChange={(v) => setAsset(v as "USDT" | "BTC")}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="USDT">USDT</SelectItem><SelectItem value="BTC">BTC</SelectItem></SelectContent>
            </Select>
            <Select value={fiat} onValueChange={setFiat}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["USD","EUR","NGN","GBP"].map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="px-3 py-2">Trader</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Available</th>
                <th className="px-3 py-2">Limits</th>
                <th className="px-3 py-2">Payment</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {(data?.offers ?? []).map((o: Record<string, unknown> & { profiles?: { display_name: string; trades_completed: number } }) => (
                <tr key={String(o.id)} className="border-b border-border/30 hover:bg-secondary/30">
                  <td className="px-3 py-3">
                    <div className="font-display font-medium">{o.profiles?.display_name ?? "—"}</div>
                    <div className="text-[11px] text-muted-foreground">{o.profiles?.trades_completed ?? 0} trades</div>
                  </td>
                  <td className="px-3 py-3 text-primary">{fmtFiat(Number(o.price), String(o.fiat_currency))}<span className="ml-1 text-muted-foreground">/{String(o.asset)}</span></td>
                  <td className="px-3 py-3">{fmtCrypto(Number(o.available_crypto), String(o.asset))}</td>
                  <td className="px-3 py-3 text-xs">{fmtFiat(Number(o.min_amount), String(o.fiat_currency))} – {fmtFiat(Number(o.max_amount), String(o.fiat_currency))}</td>
                  <td className="px-3 py-3"><div className="flex flex-wrap gap-1">{(o.payment_method_types as string[] ?? []).slice(0,3).map((p) => <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>)}</div></td>
                  <td className="px-3 py-3 text-right">
                    <Button size="sm" onClick={() => user ? nav({ to: "/offer/$id", params: { id: String(o.id) } }) : nav({ to: "/auth" })}>
                      {side === "buy" ? "Buy" : "Sell"}
                    </Button>
                  </td>
                </tr>
              ))}
              {!isFetching && (data?.offers.length ?? 0) === 0 && (
                <tr><td colSpan={6} className="px-3 py-12 text-center text-sm text-muted-foreground">No offers in this market yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Hero({ authed }: { authed: boolean }) {
  return (
    <section className="surface relative overflow-hidden p-8 md:p-12">
      <div className="absolute inset-0 -z-10 opacity-30" style={{ background: "radial-gradient(circle at 20% 20%, color-mix(in oklab, var(--primary) 35%, transparent), transparent 60%)" }} />
      <div className="max-w-3xl space-y-5">
        <Badge variant="outline" className="font-mono text-[11px]">v1 · Ledger escrow · Telegram-native</Badge>
        <h1 className="text-4xl font-semibold leading-tight md:text-5xl">
          Peer-to-peer crypto trading,<br /><span className="text-primary">held in secure escrow.</span>
        </h1>
        <p className="text-muted-foreground md:text-lg">
          Post offers, match buyers and sellers, and let our atomic escrow protect both sides — fully operable from Telegram.
        </p>
        <div className="flex flex-wrap gap-3">
          {authed ? (
            <>
              <Link to="/post-offer"><Button size="lg" className="gap-2"><ArrowRightLeft className="h-4 w-4" /> Post an offer</Button></Link>
              <Link to="/settings"><Button size="lg" variant="outline" className="gap-2"><Send className="h-4 w-4" /> Link Telegram</Button></Link>
            </>
          ) : (
            <Link to="/auth"><Button size="lg" className="gap-2"><Zap className="h-4 w-4" /> Get started</Button></Link>
          )}
        </div>
        <div className="grid gap-4 pt-4 md:grid-cols-3">
          <Feature icon={<ShieldCheck className="h-4 w-4 text-primary" />} title="Atomic escrow" desc="Server-side SQL functions lock and release funds with no race conditions." />
          <Feature icon={<Send className="h-4 w-4 text-primary" />} title="Telegram-first" desc="Get trade alerts, release funds, open disputes — straight from the bot." />
          <Feature icon={<Zap className="h-4 w-4 text-primary" />} title="Real-time" desc="Live chat and order updates over websockets." />
        </div>
      </div>
    </section>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-secondary/20 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">{icon}{title}</div>
      <p className="text-xs text-muted-foreground">{desc}</p>
    </div>
  );
}
