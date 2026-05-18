import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthGate } from "@/components/AuthGate";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getMe, updateWalletAddresses, getBadgeProgress } from "@/lib/escrow.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ShieldCheck, Crown, Wallet as WalletIcon, Bitcoin, CircleDollarSign } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/wallet")({ component: () => (<AuthGate><Wallet /></AuthGate>) });

function Wallet() {
  const fetchMe = useServerFn(getMe);
  const saveAddrs = useServerFn(updateWalletAddresses);
  const fetchBadges = useServerFn(getBadgeProgress);
  const { data, refetch } = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const { data: badges } = useQuery({ queryKey: ["badges"], queryFn: () => fetchBadges() });

  const [btc, setBtc] = useState("");
  const [usdt, setUsdt] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const p = data?.profile as { wallet_address_btc?: string | null; wallet_address_usdt?: string | null } | undefined;
    if (p) {
      setBtc(p.wallet_address_btc ?? "");
      setUsdt(p.wallet_address_usdt ?? "");
    }
  }, [data?.profile]);

  const save = async () => {
    setSaving(true);
    try {
      await saveAddrs({ data: { wallet_address_btc: btc, wallet_address_usdt: usdt } });
      toast.success("Payout addresses saved");
      refetch();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Wallet & Payouts</h1>
        <Link to="/post-offer"><Button variant="outline" size="sm">Post offer</Button></Link>
      </div>

      <div className="surface p-6">
        <div className="flex items-center gap-2">
          <WalletIcon className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Your on-chain payout addresses</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Paste the wallet addresses where you'd like to receive crypto after a successful trade,
          and where you'll deposit from when escrowing. These addresses are visible to your trade counterparty
          inside the trade chat.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
              <Bitcoin className="h-3.5 w-3.5" /> BTC address
            </Label>
            <Input value={btc} onChange={(e) => setBtc(e.target.value)} placeholder="Paste your BTC address (bc1… / 3… / 1…)" className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
              <CircleDollarSign className="h-3.5 w-3.5" /> USDT address
            </Label>
            <Input value={usdt} onChange={(e) => setUsdt(e.target.value)} placeholder="Paste your USDT address (TRC20 / ERC20)" className="font-mono" />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save addresses"}</Button>
        </div>
      </div>

      <BadgeJourney badges={badges} />
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
      <BadgeCard
        title="Trusted badge"
        icon={<ShieldCheck className="h-4 w-4" />}
        unlocked={b.is_trusted}
        accentClass="text-emerald-400"
        intro="Earn your Trusted badge by completing this journey:"
        steps={trustedSteps}
      />
      <BadgeCard
        title="Premium tier"
        icon={<Crown className="h-4 w-4" />}
        unlocked={b.is_premium}
        accentClass="text-amber-400"
        intro="Top-tier verified merchant. Unlock by maintaining excellence:"
        steps={premiumSteps}
      />
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
