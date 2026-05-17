import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getMe, startTrade } from "@/lib/escrow.functions";
import { fmtFiat, fmtCrypto } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/offer/$id")({ component: OfferDetail });

function OfferDetail() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const fetchMe = useServerFn(getMe);
  const _start = useServerFn(startTrade);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const { data: offer } = useQuery({
    queryKey: ["offer", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("offers").select("*").eq("id", id).single();
      if (error) throw error; return data;
    },
  });
  const [amt, setAmt] = useState("");
  const [pm, setPm] = useState<string>("");

  if (!offer) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const submit = async () => {
    try {
      const res = await _start({ data: { offer_id: id, fiat_amount: Number(amt), payment_method_id: pm || null } });
      toast.success("Trade started");
      nav({ to: "/trade/$id", params: { id: res.id } });
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
          {offer.side === "buy" && (
            <div>
              <label className="text-xs uppercase text-muted-foreground">Your payment method (where to receive)</label>
              <select value={pm} onChange={(e) => setPm(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Select…</option>
                {(me?.payment_methods ?? []).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
          )}
          <Button onClick={submit} className="w-full">Start trade</Button>
        </div>
      </div>
    </div>
  );
}
