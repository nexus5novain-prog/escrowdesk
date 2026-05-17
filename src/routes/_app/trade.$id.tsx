import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { getTrade, markPaid, releaseTrade, cancelTrade, openDispute, sendMessage } from "@/lib/escrow.functions";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { fmtCrypto, fmtFiat } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/trade/$id")({ component: TradePage });

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
  const { data, refetch } = useQuery({ queryKey: ["trade", id], queryFn: () => fn({ data: { id } }) });
  const [msg, setMsg] = useState("");
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
  const t = data.trade;
  const isBuyer = user?.id === t.buyer_id;
  const isSeller = user?.id === t.seller_id;

  const act = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.success(ok); refetch(); } catch (e) { toast.error((e as Error).message); } };

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-4">
        <div className="surface p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase text-muted-foreground">Trade #{t.id.slice(0,8)}</div>
              <div className="mt-1 font-mono text-xl">{fmtCrypto(Number(t.crypto_amount), t.asset)} ↔ {fmtFiat(Number(t.fiat_amount), t.fiat_currency)}</div>
            </div>
            <Badge variant="outline" className="uppercase">{t.status.replace("_"," ")}</Badge>
          </div>
          <div className="mt-4 grid gap-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Price</span><span className="font-mono">{fmtFiat(Number(t.price), t.fiat_currency)}/{t.asset}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Fee</span><span className="font-mono">{fmtCrypto(Number(t.fee_amount), t.asset)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Buyer</span><span>{data.buyer?.display_name ?? "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Seller</span><span>{data.seller?.display_name ?? "—"}</span></div>
            {data.payment_method && (
              <div className="mt-2 rounded-md border border-border/60 bg-secondary/30 p-3">
                <div className="text-xs uppercase text-muted-foreground">{data.payment_method.method_type} · {data.payment_method.label}</div>
                <pre className="mt-1 whitespace-pre-wrap text-xs">{data.payment_method.details}</pre>
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {isBuyer && t.status === "pending_payment" && <Button onClick={() => act(() => _markPaid({ data: { trade_id: t.id } }), "Marked as paid")}>I've paid</Button>}
            {isSeller && (t.status === "paid" || t.status === "disputed") && <Button onClick={() => act(() => _release({ data: { trade_id: t.id } }), "Released")}>Release crypto</Button>}
            {t.status === "pending_payment" && <Button variant="outline" onClick={() => act(() => _cancel({ data: { trade_id: t.id } }), "Cancelled")}>Cancel</Button>}
            {(t.status === "pending_payment" || t.status === "paid") && (
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
