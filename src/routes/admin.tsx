import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthGate } from "@/components/AuthGate";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  adminListDisputes, adminResolveDispute, adminSetFee, adminMakeMeAdmin, getMe,
  adminListOffers, adminUpdateOfferStatus,
  adminListTrades, adminForceCancelTrade, adminForceReleaseTrade,
  tgGetStatus, tgSetWebhook, tgDeleteWebhook, tgSendTest,
} from "@/lib/escrow.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({ component: () => (<AuthGate><Admin /></AuthGate>) });

function Admin() {
  const fetchMe = useServerFn(getMe);
  const { data: me, refetch: refetchMe } = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const isStaff = me?.roles.some((r) => r === "admin" || r === "moderator") ?? false;
  const promote = useServerFn(adminMakeMeAdmin);

  if (!isStaff) {
    return (
      <div className="surface mx-auto max-w-md p-6 text-center">
        <h1 className="text-xl font-semibold">Admin</h1>
        <p className="mt-2 text-sm text-muted-foreground">You're not a staff member. If no admin exists, you can claim the first admin role.</p>
        <Button className="mt-4" onClick={async () => { try { await promote(); toast.success("You're admin"); refetchMe(); } catch (e) { toast.error((e as Error).message); } }}>Claim admin</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <Tabs defaultValue="disputes">
        <TabsList>
          <TabsTrigger value="disputes">Disputes</TabsTrigger>
          <TabsTrigger value="offers">Offers</TabsTrigger>
          <TabsTrigger value="trades">Trades</TabsTrigger>
          <TabsTrigger value="telegram">Telegram</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="disputes" className="mt-4"><DisputesPanel /></TabsContent>
        <TabsContent value="offers" className="mt-4"><OffersPanel /></TabsContent>
        <TabsContent value="trades" className="mt-4"><TradesPanel /></TabsContent>
        <TabsContent value="telegram" className="mt-4"><TelegramPanel /></TabsContent>
        <TabsContent value="settings" className="mt-4"><SettingsPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

function DisputesPanel() {
  const listD = useServerFn(adminListDisputes);
  const resolve = useServerFn(adminResolveDispute);
  const { data: raw, refetch } = useQuery({ queryKey: ["disputes"], queryFn: () => listD() });
  const data = raw as { disputes: Array<{ id: string; trade_id: string; reason: string; status: string; created_at: string }> } | undefined;
  const [filter, setFilter] = useState<string>("open");
  const rows = (data?.disputes ?? []).filter((d) => filter === "all" || d.status === filter);
  return (
    <div className="surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Disputes</h2>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="resolved_buyer">Resolved → buyer</SelectItem>
            <SelectItem value="resolved_seller">Resolved → seller</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="mt-3 space-y-2">
        {rows.map((d) => (
          <div key={d.id} className="rounded-md border border-border/60 p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Trade <Link to="/trade/$id" params={{ id: d.trade_id }} className="font-mono underline">{d.trade_id.slice(0,8)}</Link> · {new Date(d.created_at).toLocaleString()}</span>
              <Badge variant={d.status === "open" ? "destructive" : "secondary"}>{d.status}</Badge>
            </div>
            <p className="mt-1 text-sm">{d.reason}</p>
            {d.status === "open" && (
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={async () => { try { await resolve({ data: { trade_id: d.trade_id, award_to: "buyer", note: "" } }); toast.success("Resolved → buyer"); refetch(); } catch (e) { toast.error((e as Error).message); } }}>Award buyer</Button>
                <Button size="sm" variant="outline" onClick={async () => { try { await resolve({ data: { trade_id: d.trade_id, award_to: "seller", note: "" } }); toast.success("Resolved → seller"); refetch(); } catch (e) { toast.error((e as Error).message); } }}>Award seller</Button>
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && <div className="text-sm text-muted-foreground">No disputes.</div>}
      </div>
    </div>
  );
}

function OffersPanel() {
  const listO = useServerFn(adminListOffers);
  const updateO = useServerFn(adminUpdateOfferStatus);
  const [status, setStatus] = useState<string>("all");
  const { data, refetch } = useQuery({
    queryKey: ["admin-offers", status],
    queryFn: () => listO({ data: status === "all" ? {} : { status: status as "active"|"paused"|"closed" } }),
  });
  const offers = (data as { offers: Array<{ id: string; side: string; asset: string; fiat_currency: string; price: number; min_amount: number; max_amount: number; available_crypto: number; status: string; maker_name: string | null; created_at: string }> } | undefined)?.offers ?? [];
  return (
    <div className="surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Offers</h2>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-muted-foreground">
            <tr><th className="text-left py-2">ID</th><th className="text-left">Maker</th><th className="text-left">Side</th><th className="text-left">Asset</th><th className="text-right">Price</th><th className="text-right">Min/Max</th><th className="text-right">Avail</th><th className="text-left">Status</th><th></th></tr>
          </thead>
          <tbody>
            {offers.map((o) => (
              <tr key={o.id} className="border-t border-border/40">
                <td className="py-2 font-mono">{o.id.slice(0,8)}</td>
                <td>{o.maker_name ?? "—"}</td>
                <td className="uppercase">{o.side}</td>
                <td>{o.asset}/{o.fiat_currency}</td>
                <td className="text-right font-mono">{Number(o.price).toFixed(2)}</td>
                <td className="text-right font-mono">{Number(o.min_amount).toFixed(0)}–{Number(o.max_amount).toFixed(0)}</td>
                <td className="text-right font-mono">{Number(o.available_crypto).toFixed(4)}</td>
                <td><Badge variant={o.status === "active" ? "default" : "secondary"}>{o.status}</Badge></td>
                <td className="text-right">
                  <Select value={o.status} onValueChange={async (v) => { try { await updateO({ data: { id: o.id, status: v as "active"|"paused"|"closed" } }); toast.success("Updated"); refetch(); } catch (e) { toast.error((e as Error).message); } }}>
                    <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
              </tr>
            ))}
            {offers.length === 0 && <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">No offers.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TradesPanel() {
  const listT = useServerFn(adminListTrades);
  const cancel = useServerFn(adminForceCancelTrade);
  const release = useServerFn(adminForceReleaseTrade);
  const [status, setStatus] = useState<string>("all");
  const { data, refetch } = useQuery({
    queryKey: ["admin-trades", status],
    queryFn: () => listT({ data: status === "all" ? {} : { status: status as "awaiting_agreement"|"awaiting_seller_confirm"|"pending_payment"|"paid"|"released"|"cancelled"|"disputed" } }),
  });
  const trades = (data as { trades: Array<{ id: string; status: string; asset: string; crypto_amount: number; fiat_amount: number; fiat_currency: string; created_at: string; buyer_name: string | null; seller_name: string | null }> } | undefined)?.trades ?? [];
  return (
    <div className="surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Escrow trades</h2>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending_payment">Pending payment</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="disputed">Disputed</SelectItem>
            <SelectItem value="released">Released</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-muted-foreground">
            <tr><th className="text-left py-2">ID</th><th className="text-left">Buyer</th><th className="text-left">Seller</th><th className="text-left">Asset</th><th className="text-right">Crypto</th><th className="text-right">Fiat</th><th className="text-left">Status</th><th></th></tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr key={t.id} className="border-t border-border/40">
                <td className="py-2 font-mono"><Link to="/trade/$id" params={{ id: t.id }} className="underline">{t.id.slice(0,8)}</Link></td>
                <td>{t.buyer_name ?? "—"}</td>
                <td>{t.seller_name ?? "—"}</td>
                <td>{t.asset}</td>
                <td className="text-right font-mono">{Number(t.crypto_amount).toFixed(4)}</td>
                <td className="text-right font-mono">{Number(t.fiat_amount).toFixed(2)} {t.fiat_currency}</td>
                <td><Badge variant={t.status === "disputed" ? "destructive" : t.status === "released" ? "default" : "secondary"}>{t.status}</Badge></td>
                <td className="text-right space-x-1">
                  {["pending_payment","paid","disputed"].includes(t.status) && (
                    <>
                      <Button size="sm" variant="outline" onClick={async () => { try { await release({ data: { trade_id: t.id } }); toast.success("Released"); refetch(); } catch (e) { toast.error((e as Error).message); } }}>Release</Button>
                      <Button size="sm" variant="ghost" onClick={async () => { try { await cancel({ data: { trade_id: t.id } }); toast.success("Cancelled"); refetch(); } catch (e) { toast.error((e as Error).message); } }}>Cancel</Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {trades.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">No trades.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TelegramPanel() {
  const status = useServerFn(tgGetStatus);
  const setHook = useServerFn(tgSetWebhook);
  const delHook = useServerFn(tgDeleteWebhook);
  const sendTest = useServerFn(tgSendTest);
  const { data, refetch, isLoading } = useQuery({ queryKey: ["tg-status"], queryFn: () => status() });
  const s = data as { hasKey: boolean; me: { username?: string; first_name?: string; id?: number } | null; webhook: { url?: string; pending_update_count?: number; last_error_message?: string; last_error_date?: number } | null } | undefined;
  const [url, setUrl] = useState("");
  const [chatId, setChatId] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined" && !url) {
      // Telegram cannot follow the id-preview auth redirect (302). Use the stable
      // project--<id>(-dev).lovable.app host instead.
      const host = window.location.host;
      const m = host.match(/^id-preview--([0-9a-f-]+)\.(.+)$/i);
      const base = m
        ? `${window.location.protocol}//project--${m[1]}-dev.${m[2]}`
        : window.location.origin;
      setUrl(`${base}/api/public/telegram/webhook`);
    }
  }, [url]);

  if (isLoading) return <div className="surface p-5 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="surface p-5">
        <h2 className="font-semibold">Step 1 · Bot credentials</h2>
        <p className="mt-1 text-sm text-muted-foreground">The Telegram bot is connected via the Lovable Telegram connector. The bot token is stored as <code className="font-mono text-xs">TELEGRAM_API_KEY</code> and never exposed to the browser.</p>
        <div className="mt-3 grid gap-2 text-sm">
          <div>Status: {s?.hasKey ? <Badge>Connected</Badge> : <Badge variant="destructive">Missing API key</Badge>}</div>
          {s?.me && (
            <>
              <div>Bot: <span className="font-mono">@{s.me.username}</span> · {s.me.first_name}</div>
              <div>Bot ID: <span className="font-mono">{s.me.id}</span></div>
            </>
          )}
        </div>
        {!s?.hasKey && (
          <p className="mt-3 text-xs text-muted-foreground">Open Connectors → Telegram in the Lovable sidebar to (re)connect.</p>
        )}
      </div>

      <div className="surface p-5">
        <h2 className="font-semibold">Step 2 · Webhook</h2>
        <p className="mt-1 text-sm text-muted-foreground">Telegram will POST incoming messages to this URL. The shared secret is derived from your connector key.</p>
        <div className="mt-3 grid gap-2 text-sm">
          <label className="text-xs uppercase text-muted-foreground">Webhook URL</label>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} className="font-mono" />
          <div className="text-xs text-muted-foreground">Tip: for production use your stable URL (<code className="font-mono">https://project--&lt;id&gt;.lovable.app/api/public/telegram/webhook</code>).</div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={async () => { try { await setHook({ data: { url } }); toast.success("Webhook set"); refetch(); } catch (e) { toast.error((e as Error).message); } }}>Set webhook</Button>
            <Button size="sm" variant="outline" onClick={async () => { try { await delHook(); toast.success("Webhook deleted"); refetch(); } catch (e) { toast.error((e as Error).message); } }}>Delete webhook</Button>
            <Button size="sm" variant="ghost" onClick={() => refetch()}>Refresh</Button>
          </div>
        </div>
        {s?.webhook && (
          <div className="mt-4 rounded-md border border-border/60 bg-secondary/30 p-3 text-xs">
            <div>Current URL: <span className="font-mono">{s.webhook.url || "(none)"}</span></div>
            <div>Pending updates: {s.webhook.pending_update_count ?? 0}</div>
            {s.webhook.last_error_message && (
              <div className="text-destructive">Last error: {s.webhook.last_error_message} ({s.webhook.last_error_date ? new Date(s.webhook.last_error_date * 1000).toLocaleString() : ""})</div>
            )}
          </div>
        )}
      </div>

      <div className="surface p-5">
        <h2 className="font-semibold">Step 3 · Send test message</h2>
        <p className="mt-1 text-sm text-muted-foreground">Open Telegram, message your bot (tap <strong>Start</strong>) at least once, then paste your numeric chat ID here. If you don't know it, message <code className="font-mono">@userinfobot</code> to get your ID — or after messaging your bot, click <em>Webhook</em> → check pending updates, or use <code className="font-mono">/link</code> from your bot. Group/channel IDs start with <code className="font-mono">-100</code>.</p>
        <div className="mt-3 flex gap-2">
          <Input className="w-48 font-mono" placeholder="123456789" value={chatId} onChange={(e) => setChatId(e.target.value)} />
          <Button size="sm" onClick={async () => { try { await sendTest({ data: { chat_id: /^\d+$/.test(chatId) ? Number(chatId) : chatId } }); toast.success("Sent"); } catch (e) { toast.error((e as Error).message); } }} disabled={!chatId}>Send test</Button>
        </div>
      </div>
    </div>
  );
}

function SettingsPanel() {
  const setFee = useServerFn(adminSetFee);
  const [fee, setFeeVal] = useState("100");
  return (
    <div className="surface p-5">
      <h2 className="font-semibold">Platform fee (bps · 100 = 1%)</h2>
      <div className="mt-2 flex gap-2">
        <Input className="w-32 font-mono" value={fee} onChange={(e) => setFeeVal(e.target.value)} />
        <Button onClick={async () => { try { await setFee({ data: { fee_bps: Number(fee) } }); toast.success("Saved"); } catch (e) { toast.error((e as Error).message); } }}>Save</Button>
      </div>
    </div>
  );
}
