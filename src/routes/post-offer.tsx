import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createOffer } from "@/lib/escrow.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/post-offer")({ component: Page });

function Page() {
  const fn = useServerFn(createOffer);
  const nav = useNavigate();
  const [f, setF] = useState({ side: "sell" as "buy"|"sell", asset: "USDT" as "USDT"|"BTC", fiat_currency: "USD", price: "1.00", min_amount: "10", max_amount: "1000", available_crypto: "100", payment_method_types: "bank", terms: "" });
  const submit = async (e: React.FormEvent) => { e.preventDefault();
    try {
      await fn({ data: {
        side: f.side, asset: f.asset, fiat_currency: f.fiat_currency,
        price: Number(f.price), min_amount: Number(f.min_amount), max_amount: Number(f.max_amount),
        available_crypto: Number(f.available_crypto),
        payment_method_types: f.payment_method_types.split(",").map((s) => s.trim()).filter(Boolean),
        terms: f.terms || undefined,
      }});
      toast.success("Offer posted"); nav({ to: "/" });
    } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <form onSubmit={submit} className="mx-auto max-w-xl surface space-y-4 p-6">
      <h1 className="text-xl font-semibold">Post an offer</h1>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Side</Label><select value={f.side} onChange={(e) => setF({...f, side: e.target.value as "buy"|"sell"})} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="sell">I sell crypto</option><option value="buy">I buy crypto</option></select></div>
        <div><Label>Asset</Label><select value={f.asset} onChange={(e) => setF({...f, asset: e.target.value as "USDT"|"BTC"})} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option>USDT</option><option>BTC</option></select></div>
        <div><Label>Fiat</Label><Input value={f.fiat_currency} onChange={(e) => setF({...f, fiat_currency: e.target.value.toUpperCase()})} /></div>
        <div><Label>Price per unit</Label><Input value={f.price} onChange={(e) => setF({...f, price: e.target.value})} /></div>
        <div><Label>Min (fiat)</Label><Input value={f.min_amount} onChange={(e) => setF({...f, min_amount: e.target.value})} /></div>
        <div><Label>Max (fiat)</Label><Input value={f.max_amount} onChange={(e) => setF({...f, max_amount: e.target.value})} /></div>
        <div className="col-span-2"><Label>Available crypto</Label><Input value={f.available_crypto} onChange={(e) => setF({...f, available_crypto: e.target.value})} /></div>
        <div className="col-span-2"><Label>Payment methods (comma-separated)</Label><Input value={f.payment_method_types} onChange={(e) => setF({...f, payment_method_types: e.target.value})} /></div>
        <div className="col-span-2"><Label>Terms</Label><Textarea value={f.terms} onChange={(e) => setF({...f, terms: e.target.value})} /></div>
      </div>
      <Button type="submit" className="w-full">Publish offer</Button>
    </form>
  );
}
