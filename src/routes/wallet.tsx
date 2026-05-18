import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthGate } from "@/components/AuthGate";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getMe, updateWalletAddresses, getBadgeProgress, getWalletPnL } from "@/lib/escrow.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, Crown, Wallet as WalletIcon, Bitcoin, CircleDollarSign, ArrowDownRight, ArrowUpRight, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { fmtCrypto, fmtFiat } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/wallet")({ component: () => (<AuthGate><Wallet /></AuthGate>) });

const COINS = [
  { key: "btc",  label: "BTC",          chainLabel: "Bitcoin",     placeholder: "Paste your BTC address (bc1… / 3… / 1…)" },
  { key: "usdt", label: "USDT (TRC20)", chainLabel: "Tron / TRC20", placeholder: "Paste your USDT TRC20 address (T…)" },
  { key: "usdc", label: "USDC",         chainLabel: "Choose chain", placeholder: "Paste your USDC address" },
  { key: "eth",  label: "ETH",          chainLabel: "Ethereum",    placeholder: "Paste your ETH address (0x…)" },
] as const;

function Wallet() {
  const fetchMe = useServerFn(getMe);
  const saveAddrs = useServerFn(updateWalletAddresses);
  const fetchBadges = useServerFn(getBadgeProgress);
  const fetchPnL = useServerFn(getWalletPnL);
  const { data, refetch } = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const { data: badges } = useQuery({ queryKey: ["badges"], queryFn: () => fetchBadges() });
  const { data: pnl } = useQuery({ queryKey: ["pnl"], queryFn: () => fetchPnL() });

  const [btc, setBtc] = useState("");
  const [usdt, setUsdt] = useState("");
  const [usdc, setUsdc] = useState("");
  const [usdcChain, setUsdcChain] = useState<"ERC20"|"TRC20">("ERC20");
  const [eth, setEth] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const p = data?.profile as Record<string, string | null> | undefined;
    if (p) {
      setBtc(p.wallet_address_btc ?? "");
      setUsdt(p.wallet_address_usdt ?? "");
      setUsdc(p.wallet_address_usdc ?? "");
      setUsdcChain(((p.wallet_address_usdc_chain ?? "ERC20") as "ERC20"|"TRC20"));
      setEth(p.wallet_address_eth ?? "");
    }
  }, [data?.profile]);

  const save = async () => {
    setSaving(true);
    try {
      await saveAddrs({ data: {
        wallet_address_btc: btc,
        wallet_address_usdt: usdt,
        wallet_address_usdc: usdc,
        wallet_address_usdc_chain: usdcChain,
        wallet_address_eth: eth,
      } });
      toast.success("Payout addresses saved");
      refetch();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Wallet & Earnings</h1>
        <div className="flex gap-2">
          <Link to="/escrow/new"><Button variant="outline" size="sm">New escrow group</Button></Link>
          <Link to="/post-offer"><Button variant="outline" size="sm">Post offer</Button></Link>
        </div>
      </div>

      {/* Earnings PnL */}
      <div className="surface p-6">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Lifetime activity</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Totals are derived from completed (released) trades only.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <StatCard label="Total earned" value={fmtFiat(pnl?.total_earned_usd ?? 0, "USD")} icon={<ArrowDownRight className="h-4 w-4 text-emerald-400" />} />
          <StatCard label="Total spent"  value={fmtFiat(pnl?.total_spent_usd ?? 0, "USD")} icon={<ArrowUpRight className="h-4 w-4 text-rose-400" />} />
          <StatCard label="Net"           value={fmtFiat(pnl?.net_usd ?? 0, "USD")}          icon={<TrendingUp className="h-4 w-4 text-primary" />} />
        </div>

        <div className="mt-5">
          <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Per-asset PnL</div>
          {(pnl?.per_asset?.length ?? 0) === 0 ? (
            <div className="rounded-md border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
              No completed trades yet. Earnings will appear here after your first released trade.
            </div>
          ) : (
            <div className="grid gap-2">
              {pnl?.per_asset.map((row) => (
                <div key={row.asset} className="flex items-center justify-between rounded-md border border-border/40 bg-secondary/20 p-3">
                  <Badge variant="outline" className="font-mono">{row.asset}</Badge>
                  <div className="flex gap-6 text-xs">
                    <span className="text-emerald-400">+{fmtCrypto(row.earned, row.asset as "BTC"|"USDT")}</span>
                    <span className="text-rose-400">−{fmtCrypto(row.spent, row.asset as "BTC"|"USDT")}</span>
                    <span className="font-mono">net {row.net >= 0 ? "+" : ""}{fmtCrypto(row.net, row.asset as "BTC"|"USDT")}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Payout addresses */}
      <div className="surface p-6">
        <div className="flex items-center gap-2">
          <WalletIcon className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Add wallet addresses</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Paste the on-chain addresses where coin will be released and accepted after successful trades.
          These addresses are visible to your trade counterparty inside the trade chat.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <AddrField label="BTC" icon={<Bitcoin className="h-3.5 w-3.5" />} value={btc} onChange={setBtc} placeholder={COINS[0].placeholder} />
          <AddrField label="USDT (TRC20)" icon={<CircleDollarSign className="h-3.5 w-3.5" />} value={usdt} onChange={setUsdt} placeholder={COINS[1].placeholder} />
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
              <CircleDollarSign className="h-3.5 w-3.5" /> USDC
            </Label>
            <div className="flex gap-2">
              <Select value={usdcChain} onValueChange={(v) => setUsdcChain(v as "ERC20"|"TRC20")}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ERC20">ERC20</SelectItem>
                  <SelectItem value="TRC20">TRC20</SelectItem>
                </SelectContent>
              </Select>
              <Input value={usdc} onChange={(e) => setUsdc(e.target.value)} placeholder={COINS[2].placeholder} className="font-mono" />
            </div>
          </div>
          <AddrField label="ETH" icon={<CircleDollarSign className="h-3.5 w-3.5" />} value={eth} onChange={setEth} placeholder={COINS[3].placeholder} />
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save addresses"}</Button>
        </div>
      </div>

      <BadgeJourney badges={badges} />
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border/40 bg-secondary/20 p-4">
      <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
        {label}{icon}
      </div>
      <div className="mt-1 font-mono text-xl">{value}</div>
    </div>
  );
}

function AddrField({ label, icon, value, onChange, placeholder }: {
  label: string; icon: React.ReactNode; value: string; onChange: (s: string)=>void; placeholder: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="font-mono" />
    </div>
  );
}

function BadgeJourney({ badges }: { badges?: { is_trusted: boolean; is_premium: boolean; trades_completed: number; distinct_4plus_raters: number; max_repeat_partner: number; btc_volume_usd: number; five_star_count: number } }) {
  const b = badges ?? { is_trusted: false, is_premium: false, trades_completed: 0, distinct_4plus_raters: 0, max_repeat_partner: 0, btc_volume_usd: 0, five_star_count: 0 };
  const trustedSteps = [
    { label: "5 successful trades", cur: b.trades_completed, goal: 5 },
    { label: "5 different 4★+ ratings", cur: b.distinct_4plus_raters, goal: 5 },
    { label: "3 trades with one partner", cur: b.max_repeat_partner, goal: 3 },
    { label: "$500 BTC traded", cur: Math.round(b.btc_volume_usd), goal: 500 },
  ];
  const premiumSteps = [
    { label: "Trusted badge unlocked", cur: b.is_trusted ? 1 : 0, goal: 1 },
    { label: "25 successful trades", cur: b.trades_completed, goal: 25 },
    { label: "15 five-star ratings", cur: b.five_star_count, goal: 15 },
    { label: "$5,000 BTC traded", cur: Math.round(b.btc_volume_usd), goal: 5000 },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <BadgeCard title="Trusted badge" icon={<ShieldCheck className="h-4 w-4" />} unlocked={b.is_trusted}
        accentClass="text-emerald-400" intro="Earn your Trusted badge by completing this journey:" steps={trustedSteps} />
      <BadgeCard title="Premium tier" icon={<Crown className="h-4 w-4" />} unlocked={b.is_premium}
        accentClass="text-amber-400" intro="Top-tier verified merchant. Unlock by maintaining excellence:" steps={premiumSteps} />
    </div>
  );
}

function BadgeCard({ title, icon, unlocked, accentClass, intro, steps }: {
  title: string; icon: React.ReactNode; unlocked: boolean; accentClass: string; intro: string;
  steps: { label: string; cur: number; goal: number }[];
}) {
  return (
    <div className="surface p-5">
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-2 font-semibold ${accentClass}`}>{icon} {title}</div>
        {unlocked
          ? <Badge className="bg-primary/15 text-primary">Unlocked</Badge>
          : <Badge variant="outline" className="font-mono text-[10px]">In progress</Badge>}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{intro}</p>
      <ul className="mt-3 space-y-3">
        {steps.map((s) => {
          const pct = Math.min(100, Math.round((s.cur / s.goal) * 100));
          const done = s.cur >= s.goal;
          return (
            <li key={s.label}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className={done ? "text-foreground" : "text-muted-foreground"}>{s.label}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{Math.min(s.cur, s.goal)} / {s.goal}</span>
              </div>
              <Progress value={pct} className="h-1.5" />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
