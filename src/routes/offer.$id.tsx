import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AuthGate } from "@/components/AuthGate";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getMe } from "@/lib/escrow.functions";
import { createEscrowGroup } from "@/lib/escrow-groups.functions";
import { fmtFiat, fmtCrypto } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/offer/$id")({ component: () => (<AuthGate><OfferDetail /></AuthGate>) });

function OfferDetail() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const fetchMe = useServerFn(getMe);
  const createGroup = useServerFn(createEscrowGroup);
  useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const { data: offer } = useQuery({
    queryKey: ["offer", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("offers").select("*").eq("id", id).single();
      if (error) throw error; return data;
    },
  });
  const [amt, setAmt] = useState("");

  if (!offer) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const submit = async () => {
    try {
      const fiat = Number(amt);
      if (!fiat || fiat <= 0) throw new Error("Enter a valid amount");
      const crypto = Number((fiat / Number(offer.price)).toFixed(8));
      const res = await createGroup({ data: {
        asset: offer.asset as "BTC",
        amount: crypto,
        fiat_amount: fiat,
        fiat_currency: offer.fiat_currency,
      } });
      toast.success("Escrow group created");
      nav({ to: "/escrow/$id", params: { id: res.id } });
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="surface p-6">
        <div className="text-xs uppercase text-muted-foreground">Offer · {offer.side === "sell" ? "Maker sells" : "Maker buys"} {offer.asset}</div>
        <div className="mt-2 text-2xl font-mono">{fmtFiat(Number(offer.price), offer.fiat_currency)} <span className="text-sm text-muted-foreground">/ {offer.asset}</span></div>
        <div className="mt-1 text-sm text-muted-foreground">Available: {fmtCrypto(Number(offer.available_crypto), offer.asset)} · Limits {fmtFiat(Number(offer.min_amount), offer.fiat_currency)}–{fmtFiat(Number(offer.max_amount), offer.fiat_currency)}</div>
        {offer.terms && <p className="mt-3 rounded-md border border-border/60 bg-secondary/30 p-3 text-sm">{offer.terms}</p>}

        <div className="mt-6 space-y-3">
          <div>
            <label className="text-xs uppercase text-muted-foreground">Amount ({offer.fiat_currency})</label>
            <Input value={amt} onChange={(e) => setAmt(e.target.value)} className="font-mono" />
          </div>
          <Button onClick={submit} className="w-full">Start escrow</Button>
        </div>
      </div>
    </div>
  );
}
