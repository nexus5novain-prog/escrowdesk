import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthGate } from "@/components/AuthGate";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getMe, depositSimulated } from "@/lib/escrow.functions";
import { fmtCrypto } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/wallet")({ component: () => (<AuthGate><Wallet /></AuthGate>) });

function Wallet() {
  const fetchMe = useServerFn(getMe);
  const deposit = useServerFn(depositSimulated);
  const { data, refetch } = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const [amt, setAmt] = useState("100");
  const [asset, setAsset] = useState<"USDT"|"BTC">("USDT");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Wallet</h1>
        <Link to="/post-offer"><Button variant="outline" size="sm">Post offer</Button></Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {(data?.wallets ?? []).map((w) => (
          <div key={w.id} className="surface p-5">
            <div className="text-xs uppercase text-muted-foreground">{w.asset}</div>
            <div className="mt-1 font-mono text-2xl">{fmtCrypto(Number(w.available), w.asset)}</div>
            <div className="mt-1 text-xs text-muted-foreground font-mono">Escrow: {fmtCrypto(Number(w.escrow), w.asset)}</div>
          </div>
        ))}
      </div>
      <div className="surface p-5">
        <h2 className="font-semibold">Simulated deposit (v1 demo)</h2>
        <p className="text-xs text-muted-foreground">v1 uses ledger balances. Top up to test trading.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <select value={asset} onChange={(e) => setAsset(e.target.value as "USDT"|"BTC")} className="rounded-md border border-input bg-background px-3 py-2 text-sm"><option>USDT</option><option>BTC</option></select>
          <Input value={amt} onChange={(e) => setAmt(e.target.value)} className="w-32 font-mono" />
          <Button onClick={async () => { try { await deposit({ data: { asset, amount: Number(amt) } }); toast.success("Deposited"); refetch(); } catch (e) { toast.error((e as Error).message); } }}>Deposit</Button>
        </div>
      </div>
    </div>
  );
}
