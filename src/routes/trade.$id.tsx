import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AuthGate } from "@/components/AuthGate";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  getTrade, markPaid, releaseTrade, cancelTrade, openDispute, sendMessage,
  signTerms, confirmBuyerDeposit, submitRating, getTradeRatings,
} from "@/lib/escrow.functions";
import { Star } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { fmtCrypto, fmtFiat } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/trade/$id")({ component: () => (<AuthGate><TradePage /></AuthGate>) });

const PHRASE_BUYER_SIGNS = "I AGREE TO TERMS AND CONDITIONS OF THE SELLER";
const PHRASE_SELLER_SIGNS = "I AGREE TO TERMS AND CONDITIONS OF THE BUYER";

function TradePage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const fn = useServerFn(getTrade);
  const _markPaid = useServerFn(markPaid);
  const _release = useServerFn(releaseTrade);
  const _cancel = useServerFn(cancelTrade);
  const _dispute = useServerFn(openDispute);
  const _send = useServerFn(sendMessage);
  const _sign = useServerFn(signTerms);
  const _confirmDep = useServerFn(confirmBuyerDeposit);
  const { data, refetch } = useQuery({ queryKey: ["trade", id], queryFn: () => fn({ data: { id } }) });
  const [msg, setMsg] = useState("");
  const [myTerms, setMyTerms] = useState("");
  const [mySignature, setMySignature] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ch = supabase.channel(`trade:${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "trade_messages", filter: `trade_id=eq.${id}` }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "trades", filter: `id=eq.${id}` }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, refetch]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [data?.messages.length]);

  if (!data?.trade) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const t = data.trade as Record<string, unknown> & {
    id: string; status: string; buyer_id: string; seller_id: string;
    asset: string; crypto_amount: number; fiat_amount: number; fiat_currency: string;
    price: number; fee_amount: number;
    terms_buyer?: string | null; terms_seller?: string | null;
    signature_buyer?: string | null; signature_seller?: string | null;
    signed_by_buyer_at?: string | null; signed_by_seller_at?: string | null;
    deposit_confirmed_at?: string | null;
  };
  const isBuyer = user?.id === t.buyer_id;
  const isSeller = user?.id === t.seller_id;
  const requiredPhrase = isBuyer ? PHRASE_BUYER_SIGNS : isSeller ? PHRASE_SELLER_SIGNS : "";
  const mySigned = isBuyer ? !!t.signed_by_buyer_at : isSeller ? !!t.signed_by_seller_at : false;
  const otherSigned = isBuyer ? !!t.signed_by_seller_at : isSeller ? !!t.signed_by_buyer_at : false;

  const act = async (callable: () => Promise<unknown>, ok: string) => {
    try { await callable(); toast.success(ok); refetch(); } catch (e) { toast.error((e as Error).message); }
  };

  const stepLabel = (() => {
    switch (t.status) {
      case "awaiting_agreement": return "1 of 4 · Sign terms";
      case "awaiting_seller_confirm": return "2 of 4 · Seller confirms deposit";
      case "paid": return "3 of 4 · Buyer releases";
      case "released": return "Complete";
      case "cancelled": return "Cancelled";
      case "disputed": return "In dispute";
      default: return t.status;
    }
  })();

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-4">
        <div className="surface p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase text-muted-foreground">Trade #{t.id.slice(0,8)} · {stepLabel}</div>
              <div className="mt-1 font-mono text-xl">{fmtCrypto(Number(t.crypto_amount), t.asset)} ↔ {fmtFiat(Number(t.fiat_amount), t.fiat_currency)}</div>
            </div>
            <Badge variant="outline" className="uppercase">{t.status.replace(/_/g," ")}</Badge>
          </div>
          <div className="mt-4 grid gap-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Price</span><span className="font-mono">{fmtFiat(Number(t.price), t.fiat_currency)}/{t.asset}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Platform fee</span><span className="font-mono">{fmtCrypto(Number(t.fee_amount), t.asset)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Buyer (escrows crypto)</span><span>{data.buyer?.display_name ?? "—"} {t.signed_by_buyer_at && "✍️"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Seller (confirms & receives)</span><span>{data.seller?.display_name ?? "—"} {t.signed_by_seller_at && "✍️"}</span></div>
            {data.payment_method && (
              <div className="mt-2 rounded-md border border-border/60 bg-secondary/30 p-3">
                <div className="text-xs uppercase text-muted-foreground">{data.payment_method.method_type} · {data.payment_method.label}</div>
                <pre className="mt-1 whitespace-pre-wrap text-xs">{data.payment_method.details}</pre>
              </div>
            )}
          </div>
        </div>

        {/* Terms & signature panel — only during agreement step */}
        {(isBuyer || isSeller) && t.status === "awaiting_agreement" && (
          <div className="surface p-5 space-y-3">
            <h2 className="font-semibold">Terms & Signature</h2>
            <p className="text-sm text-muted-foreground">
              Both parties must propose their terms and sign the exact phrase below before escrow proceeds.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase text-muted-foreground mb-1">Buyer's terms</div>
                <div className="rounded-md border border-border/60 bg-secondary/20 p-2 text-xs min-h-[60px] whitespace-pre-wrap">{t.terms_buyer || <span className="text-muted-foreground">— not yet posted —</span>}</div>
                {t.signed_by_buyer_at && <div className="mt-1 text-[10px] text-muted-foreground">✍️ Signed {new Date(t.signed_by_buyer_at).toLocaleString()}</div>}
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground mb-1">Seller's terms</div>
                <div className="rounded-md border border-border/60 bg-secondary/20 p-2 text-xs min-h-[60px] whitespace-pre-wrap">{t.terms_seller || <span className="text-muted-foreground">— not yet posted —</span>}</div>
                {t.signed_by_seller_at && <div className="mt-1 text-[10px] text-muted-foreground">✍️ Signed {new Date(t.signed_by_seller_at).toLocaleString()}</div>}
              </div>
            </div>

            {!mySigned && (
              <div className="space-y-2 rounded-md border border-dashed border-border/60 p-3">
                <div className="text-xs uppercase text-muted-foreground">Your terms ({isBuyer ? "buyer" : "seller"})</div>
                <Textarea value={myTerms} onChange={(e) => setMyTerms(e.target.value)} placeholder="State the conditions you require for this trade…" rows={3} />
                <div className="text-xs uppercase text-muted-foreground mt-2">Type the exact phrase to sign</div>
                <Input
                  value={mySignature}
                  onChange={(e) => setMySignature(e.target.value)}
                  placeholder={requiredPhrase}
                  className="font-mono text-xs"
                />
                <div className="text-[10px] text-muted-foreground">Required: <code className="text-foreground">{requiredPhrase}</code></div>
                <Button
                  disabled={mySignature.trim().toUpperCase() !== requiredPhrase}
                  onClick={() => act(() => _sign({ data: { trade_id: t.id, signature: mySignature.trim(), terms: myTerms || undefined } }), "Signed")}
                >
                  Sign & lock in
                </Button>
              </div>
            )}
            {mySigned && !otherSigned && (
              <div className="text-sm text-muted-foreground">✅ You've signed. Waiting for the other party to sign.</div>
            )}
          </div>
        )}

        {/* Action panel */}
        <div className="surface p-5 space-y-3">
          <h2 className="font-semibold">Actions</h2>
          <div className="flex flex-wrap gap-2">
            {isSeller && t.status === "awaiting_seller_confirm" && (
              <Button onClick={() => act(() => _confirmDep({ data: { trade_id: t.id } }), "Deposit confirmed")}>
                ✅ Confirm buyer's escrow deposit
              </Button>
            )}
            {isBuyer && t.status === "paid" && (
              <Button onClick={() => act(() => _release({ data: { trade_id: t.id } }), "Released")}>
                🎉 Release crypto to seller
              </Button>
            )}
            {isBuyer && t.status === "awaiting_seller_confirm" && (
              <Button variant="ghost" onClick={() => act(() => _markPaid({ data: { trade_id: t.id } }), "Marked")}>I've sent fiat</Button>
            )}
            {["awaiting_agreement","awaiting_seller_confirm","pending_payment"].includes(t.status) && (
              <Button variant="outline" onClick={() => act(() => _cancel({ data: { trade_id: t.id } }), "Cancelled")}>Cancel</Button>
            )}
            {["awaiting_agreement","awaiting_seller_confirm","pending_payment","paid"].includes(t.status) && (
              <Button variant="destructive" onClick={() => { const r = prompt("Reason for dispute?"); if (r && r.length > 4) act(() => _dispute({ data: { trade_id: t.id, reason: r } }), "Dispute opened"); }}>Open dispute</Button>
            )}
            <Button variant="ghost" onClick={() => nav({ to: "/trades" })}>Back</Button>
          </div>
        </div>
      </div>
      <div className="surface flex h-[600px] flex-col">
        <div className="border-b border-border/60 p-3 text-sm font-semibold">Chat</div>
        <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
          {data.messages.map((m) => (
            <div key={m.id} className={`rounded-md p-2 ${m.is_system ? "border border-dashed border-border/60 text-xs text-muted-foreground" : m.sender_id === user?.id ? "ml-8 bg-primary/15" : "mr-8 bg-secondary/40"}`}>
              {m.body}
              <div className="mt-1 text-[10px] text-muted-foreground">{new Date(m.created_at).toLocaleTimeString()}</div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <form className="flex gap-2 border-t border-border/60 p-3" onSubmit={async (e) => { e.preventDefault(); if (!msg.trim()) return; try { await _send({ data: { trade_id: id, body: msg } }); setMsg(""); refetch(); } catch (e) { toast.error((e as Error).message); } }}>
          <Input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Type a message…" />
          <Button type="submit">Send</Button>
        </form>
      </div>
    </div>
  );
}
