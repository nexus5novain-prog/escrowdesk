import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthGate } from "@/components/AuthGate";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  adminListDisputes, adminResolveDispute, adminSetFee, adminMakeMeAdmin, getMe,
  adminListOffers, adminUpdateOfferStatus,
  adminListTrades, adminForceCancelTrade, adminForceReleaseTrade,
  tgGetStatus, tgSetWebhook, tgDeleteWebhook, tgSendTest,
  adminListUsers, adminBanUser, adminUnbanUser, adminWarnUser,
  adminAssignRole, adminRevokeRole, adminUnlinkTelegram, adminListWarnings,
} from "@/lib/escrow.functions";
import {
  adminListShopProducts, adminCreateShopProduct, adminUpdateShopProduct,
  adminDeleteShopProduct, adminGetShopStats, type ShopProduct, type ShopSection,
} from "@/lib/shop.functions";
import { adminSeedMarketplace, adminSeedUsers } from "@/lib/seed.functions";
import { lookupBin, type BinRecord } from "@/lib/bins.functions";
import { adminActivatePremium, adminGrantTrusted } from "@/lib/trades.functions";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Package, PlusCircle, Pencil, Trash2, Eye, EyeOff, ShoppingBag,
  CheckCircle2, XCircle, Search, ImageIcon, DollarSign,
  CreditCard, BookOpen, ScanLine, Store, Bitcoin,
  Database, Users, Crown, BadgeCheck, Loader2, Zap,
} from "lucide-react";

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
      <section className="surface rounded-3xl p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Admin dashboard</div>
            <h1 className="text-3xl font-semibold">Manage disputes, trades, and Telegram bot routing</h1>
            <p className="mt-2 text-sm text-muted-foreground">Keep the platform safe, resolve escalations, and configure Telegram connectivity for real-time trade routing.</p>
          </div>
        </div>
      </section>
      <div className="text-lg font-semibold">Admin tools and platform controls</div>
      <Tabs defaultValue="shop">
        <TabsList className="flex-wrap">
          <TabsTrigger value="shop" className="gap-1.5"><ShoppingBag className="h-3.5 w-3.5" />Shop</TabsTrigger>
          <TabsTrigger value="disputes">Disputes</TabsTrigger>
          <TabsTrigger value="offers">Offers</TabsTrigger>
          <TabsTrigger value="trades">Trades</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="warnings">Warnings</TabsTrigger>
          <TabsTrigger value="telegram">Telegram</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="seed" className="gap-1.5 text-emerald-400"><Database className="h-3.5 w-3.5" />Seed Data</TabsTrigger>
        </TabsList>
        <TabsContent value="shop" className="mt-4"><ShopPanel /></TabsContent>
        <TabsContent value="disputes" className="mt-4"><DisputesPanel /></TabsContent>
        <TabsContent value="offers" className="mt-4"><OffersPanel /></TabsContent>
        <TabsContent value="trades" className="mt-4"><TradesPanel /></TabsContent>
        <TabsContent value="users" className="mt-4"><UsersPanel /></TabsContent>
        <TabsContent value="warnings" className="mt-4"><WarningsPanel /></TabsContent>
        <TabsContent value="telegram" className="mt-4"><TelegramPanel /></TabsContent>
        <TabsContent value="settings" className="mt-4"><SettingsPanel /></TabsContent>
        <TabsContent value="seed" className="mt-4"><SeedPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

function SeedPanel() {
  const seedMarket = useServerFn(adminSeedMarketplace);
  const seedUsers = useServerFn(adminSeedUsers);
  const activatePrem = useServerFn(adminActivatePremium);
  const grantTrusted = useServerFn(adminGrantTrusted);
  const fetchUsers = useServerFn(adminListUsers);

  const [marketBusy, setMarketBusy] = useState(false);
  const [usersBusy, setUsersBusy] = useState(false);
  const [premUserId, setPremUserId] = useState("");
  const [premMonths, setPremMonths] = useState("3");
  const [premBusy, setPremBusy] = useState(false);
  const [trustUserId, setTrustUserId] = useState("");
  const [trustBusy, setTrustBusy] = useState(false);

  const { data: usersData } = useQuery({ queryKey: ["admin-users-seed"], queryFn: () => fetchUsers({ data: {} }) });
  const users = (usersData as { users: Array<{ user_id: string; display_name: string }> } | undefined)?.users ?? [];

  return (
    <div className="space-y-5">
      <div className="surface rounded-2xl p-5 border border-emerald-500/20">
        <div className="flex items-center gap-2 mb-3">
          <Database className="h-5 w-5 text-emerald-400" />
          <h2 className="font-semibold">Seed Data</h2>
          <Badge className="text-[10px] bg-amber-500/15 text-amber-400 border-0">Admin only</Badge>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          Populate the platform with demo marketplace products and sample users. Safe to run multiple times — existing records are skipped.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Seed Marketplace */}
          <div className="rounded-xl border border-border/40 bg-secondary/20 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Marketplace Products</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Seeds 10 CARD, 5 ENROLL, 5 SCANNER, and 5 GENERAL products owned by your admin account.
            </p>
            <Button
              disabled={marketBusy}
              onClick={async () => {
                setMarketBusy(true);
                try {
                  const r = await seedMarket();
                  toast.success(`Seeded ${r.created} marketplace products`);
                } catch (e) { toast.error((e as Error).message); }
                finally { setMarketBusy(false); }
              }}
              className="w-full gap-1.5"
              variant="outline"
            >
              {marketBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              {marketBusy ? "Seeding products…" : "Seed 25 Products"}
            </Button>
          </div>

          {/* Seed Users */}
          <div className="rounded-xl border border-border/40 bg-secondary/20 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-400" />
              <h3 className="font-semibold text-sm">Demo Users (80)</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Creates 10 premium, 20 trusted, and 50 regular demo users with realistic stats and avatars.
            </p>
            <Button
              disabled={usersBusy}
              onClick={async () => {
                setUsersBusy(true);
                try {
                  const r = await seedUsers();
                  toast.success(`Created ${r.created} users, skipped ${r.skipped}`);
                } catch (e) { toast.error((e as Error).message); }
                finally { setUsersBusy(false); }
              }}
              className="w-full gap-1.5"
              variant="outline"
            >
              {usersBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
              {usersBusy ? "Seeding users… (may take 2–3 min)" : "Seed 80 Demo Users"}
            </Button>
            {usersBusy && (
              <p className="text-[11px] text-amber-400/80">Creating auth accounts — this takes a few minutes.</p>
            )}
          </div>
        </div>
      </div>

      {/* Badge Management */}
      <div className="surface rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <BadgeCheck className="h-4 w-4 text-emerald-400" />
          Badge Management
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Grant Premium */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-amber-400" />
              <h3 className="font-semibold text-sm text-amber-400">Activate Premium</h3>
            </div>
            <select
              className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm"
              value={premUserId}
              onChange={(e) => setPremUserId(e.target.value)}
            >
              <option value="">Select user…</option>
              {users.map((u) => (
                <option key={u.user_id} value={u.user_id}>{u.display_name || u.user_id.slice(0, 8)}</option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="1"
                max="36"
                value={premMonths}
                onChange={(e) => setPremMonths(e.target.value)}
                className="w-24 h-8 text-sm"
                placeholder="Months"
              />
              <span className="text-xs text-muted-foreground">months</span>
            </div>
            <Button
              size="sm"
              disabled={premBusy || !premUserId}
              className="w-full gap-1.5 bg-amber-500 hover:bg-amber-400 text-black"
              onClick={async () => {
                if (!premUserId) return;
                setPremBusy(true);
                try {
                  const r = await activatePrem({ data: { user_id: premUserId, months: Number(premMonths) || 3 } });
                  toast.success(`Premium activated until ${new Date(r.expires_at).toLocaleDateString()}`);
                  setPremUserId("");
                } catch (e) { toast.error((e as Error).message); }
                finally { setPremBusy(false); }
              }}
            >
              {premBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crown className="h-3.5 w-3.5" />}
              Activate Premium
            </Button>
          </div>

          {/* Grant Trusted */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-emerald-400" />
              <h3 className="font-semibold text-sm text-emerald-400">Grant Trusted Badge</h3>
            </div>
            <select
              className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm"
              value={trustUserId}
              onChange={(e) => setTrustUserId(e.target.value)}
            >
              <option value="">Select user…</option>
              {users.map((u) => (
                <option key={u.user_id} value={u.user_id}>{u.display_name || u.user_id.slice(0, 8)}</option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={trustBusy || !trustUserId}
              className="w-full gap-1.5 border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-400"
              variant="outline"
              onClick={async () => {
                if (!trustUserId) return;
                setTrustBusy(true);
                try {
                  await grantTrusted({ data: { user_id: trustUserId, grant: true } });
                  toast.success("Trusted badge granted");
                  setTrustUserId("");
                } catch (e) { toast.error((e as Error).message); }
                finally { setTrustBusy(false); }
              }}
            >
              {trustBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BadgeCheck className="h-3.5 w-3.5" />}
              Grant Trusted Badge
            </Button>
          </div>
        </div>
      </div>
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
              <span>Trade <Link to="/escrow/trade/$id" params={{ id: d.trade_id }} className="font-mono underline">{d.trade_id.slice(0,8)}</Link> · {new Date(d.created_at).toLocaleString()}</span>
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
            <SelectItem value="awaiting_agreement">Awaiting agreement</SelectItem>
            <SelectItem value="awaiting_seller_confirm">Awaiting seller confirm</SelectItem>
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
                <td className="py-2 font-mono"><Link to="/escrow/trade/$id" params={{ id: t.id }} className="underline">{t.id.slice(0,8)}</Link></td>
                <td>{t.buyer_name ?? "—"}</td>
                <td>{t.seller_name ?? "—"}</td>
                <td>{t.asset}</td>
                <td className="text-right font-mono">{Number(t.crypto_amount).toFixed(4)}</td>
                <td className="text-right font-mono">{Number(t.fiat_amount).toFixed(2)} {t.fiat_currency}</td>
                <td><Badge variant={t.status === "disputed" ? "destructive" : t.status === "released" ? "default" : "secondary"}>{t.status}</Badge></td>
                <td className="text-right space-x-1">
                  {["awaiting_agreement","awaiting_seller_confirm","pending_payment","paid","disputed"].includes(t.status) && (
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
      <h2 className="font-semibold">Platform fee (bps · 100 = 1%) — legacy override</h2>
      <p className="mt-1 text-xs text-muted-foreground">Tiered fees (set in <code className="font-mono">platform_settings.fee_tiers</code>) take precedence. This is a fallback if no tiers exist.</p>
      <div className="mt-2 flex gap-2">
        <Input className="w-32 font-mono" value={fee} onChange={(e) => setFeeVal(e.target.value)} />
        <Button onClick={async () => { try { await setFee({ data: { fee_bps: Number(fee) } }); toast.success("Saved"); } catch (e) { toast.error((e as Error).message); } }}>Save</Button>
      </div>
    </div>
  );
}

type AdminUser = {
  user_id: string;
  display_name: string;
  telegram_username: string | null;
  telegram_user_id: number | null;
  is_banned: boolean;
  ban_reason: string | null;
  trades_completed: number;
  roles: string[];
};

const ALL_ROLES = ["admin","moderator","judge","finance","support"] as const;

function UsersPanel() {
  const listUsers = useServerFn(adminListUsers);
  const ban = useServerFn(adminBanUser);
  const unban = useServerFn(adminUnbanUser);
  const warn = useServerFn(adminWarnUser);
  const assign = useServerFn(adminAssignRole);
  const revoke = useServerFn(adminRevokeRole);
  const unlink = useServerFn(adminUnlinkTelegram);
  const [search, setSearch] = useState("");
  const { data, refetch } = useQuery({
    queryKey: ["admin-users", search],
    queryFn: () => listUsers({ data: search ? { search } : {} }),
  });
  const users = (data as { users: AdminUser[] } | undefined)?.users ?? [];

  // Live updates: refetch whenever a profile or role changes anywhere
  useEffect(() => {
    const channel = supabase
      .channel("admin-users-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetch]);


  return (
    <div className="surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Users</h2>
        <div className="flex gap-2">
          <Input placeholder="Search display name…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
          <Button variant="outline" size="sm" onClick={() => refetch()}>Refresh</Button>
        </div>
      </div>
      <div className="mt-3 space-y-3">
        {users.map((u) => (
          <div key={u.user_id} className="rounded-md border border-border/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-medium">{u.display_name} {u.is_banned && <Badge variant="destructive" className="ml-1">Banned</Badge>}</div>
                <div className="text-xs text-muted-foreground font-mono">{u.user_id.slice(0,8)} · trades: {u.trades_completed} · TG: {u.telegram_username ? `@${u.telegram_username}` : "—"}</div>
                {u.ban_reason && <div className="text-xs text-destructive mt-1">Ban reason: {u.ban_reason}</div>}
                <div className="mt-1 flex flex-wrap gap-1">
                  {u.roles.length === 0 && <span className="text-xs text-muted-foreground">no roles</span>}
                  {u.roles.map((r) => (
                    <Badge key={r} variant="secondary" className="text-xs">
                      {r}
                      <button className="ml-1 opacity-60 hover:opacity-100" onClick={async () => { try { await revoke({ data: { user_id: u.user_id, role: r as typeof ALL_ROLES[number] } }); toast.success("Revoked"); refetch(); } catch (e) { toast.error((e as Error).message); } }}>×</button>
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select onValueChange={async (v) => { try { await assign({ data: { user_id: u.user_id, role: v as typeof ALL_ROLES[number] } }); toast.success(`Assigned ${v}`); refetch(); } catch (e) { toast.error((e as Error).message); } }}>
                  <SelectTrigger className="w-32 h-8"><SelectValue placeholder="+ Role" /></SelectTrigger>
                  <SelectContent>
                    {ALL_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
                {u.is_banned
                  ? <Button size="sm" variant="outline" onClick={async () => { try { await unban({ data: { user_id: u.user_id } }); toast.success("Unbanned"); refetch(); } catch (e) { toast.error((e as Error).message); } }}>Unban</Button>
                  : <Button size="sm" variant="destructive" onClick={async () => { const reason = window.prompt("Ban reason?"); if (!reason) return; try { await ban({ data: { user_id: u.user_id, reason } }); toast.success("Banned"); refetch(); } catch (e) { toast.error((e as Error).message); } }}>Ban</Button>}
                <Button size="sm" variant="outline" onClick={async () => { const reason = window.prompt("Warning reason?"); if (!reason) return; const sev = window.prompt("Severity (minor|major|final)", "minor") as "minor"|"major"|"final"; try { await warn({ data: { user_id: u.user_id, reason, severity: sev || "minor" } }); toast.success("Warned"); } catch (e) { toast.error((e as Error).message); } }}>Warn</Button>
                {u.telegram_user_id && (
                  <Button size="sm" variant="ghost" onClick={async () => { if (!window.confirm("Unlink Telegram? User must re-run /link.")) return; try { await unlink({ data: { user_id: u.user_id } }); toast.success("Unlinked"); refetch(); } catch (e) { toast.error((e as Error).message); } }}>Unlink TG</Button>
                )}
              </div>
            </div>
          </div>
        ))}
        {users.length === 0 && <div className="text-sm text-muted-foreground">No users.</div>}
      </div>
    </div>
  );
}

function WarningsPanel() {
  const listW = useServerFn(adminListWarnings);
  const { data } = useQuery({ queryKey: ["admin-warnings"], queryFn: () => listW() });
  const warnings = (data as { warnings: Array<{ id: string; user_name: string | null; issued_by_name: string | null; reason: string; severity: string; created_at: string }> } | undefined)?.warnings ?? [];
  return (
    <div className="surface p-5">
      <h2 className="font-semibold">Warnings log</h2>
      <div className="mt-3 space-y-2">
        {warnings.map((w) => (
          <div key={w.id} className="rounded-md border border-border/60 p-3 text-sm">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{w.user_name ?? "—"} · issued by {w.issued_by_name ?? "—"} · {new Date(w.created_at).toLocaleString()}</span>
              <Badge variant={w.severity === "final" ? "destructive" : w.severity === "major" ? "default" : "secondary"}>{w.severity}</Badge>
            </div>
            <p className="mt-1">{w.reason}</p>
          </div>
        ))}
        {warnings.length === 0 && <div className="text-sm text-muted-foreground">No warnings issued.</div>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SHOP PANEL
// ─────────────────────────────────────────────────────────────────────────────

// ─── Section tab config ───────────────────────────────────────────────────────
const SHOP_SECTIONS: { id: ShopSection; label: string; icon: React.ElementType; color: string }[] = [
  { id: "CARD",    label: "Card",    icon: CreditCard, color: "text-amber-500" },
  { id: "ENROLL",  label: "Enroll",  icon: BookOpen,   color: "text-blue-500" },
  { id: "SCANNER", label: "Scanner", icon: ScanLine,   color: "text-emerald-500" },
  { id: "GENERAL", label: "General", icon: Store,      color: "text-primary" },
];

// ─── Product form types ───────────────────────────────────────────────────────
type ProductForm = {
  section: ShopSection;
  name: string;
  amount: string;
  currency: string;
  image_url: string;
  contact_telegram: string;
  // Non-CARD description
  description: string;
  // CARD-specific
  card_number: string;
  card_name: string;
  card_address: string;
  card_status: "active" | "dead";
  btc_rate: string;
  card_notes: string;
};

const BLANK_FORM: ProductForm = {
  section: "CARD",
  name: "", amount: "", currency: "USD",
  image_url: "", contact_telegram: "",
  description: "",
  card_number: "", card_name: "", card_address: "",
  card_status: "active", btc_rate: "", card_notes: "",
};

function formFromProduct(p: ShopProduct): ProductForm {
  const section = (p.category?.toUpperCase() as ShopSection) ?? "GENERAL";
  if (section === "CARD" && p.card) {
    return {
      section,
      name: p.name,
      amount: String(p.amount ?? ""),
      currency: p.currency ?? "USD",
      image_url: p.image_url ?? "",
      contact_telegram: p.contact_telegram ?? "",
      description: "",
      card_number: p.card.card_number ?? "",
      card_name: p.card.card_name ?? "",
      card_address: p.card.card_address ?? "",
      card_status: p.card.card_status ?? "active",
      btc_rate: p.card.btc_rate ?? "",
      card_notes: p.card.notes ?? "",
    };
  }
  return {
    section,
    name: p.name,
    amount: String(p.amount ?? ""),
    currency: p.currency ?? "USD",
    image_url: p.image_url ?? "",
    contact_telegram: p.contact_telegram ?? "",
    description: p.description ?? "",
    card_number: "", card_name: "", card_address: "",
    card_status: "active", btc_rate: "", card_notes: "",
  };
}

function buildDescription(form: ProductForm): string {
  if (form.section === "CARD") {
    return JSON.stringify({
      type: "card",
      card_number: form.card_number.replace(/\D/g, ""),
      card_name: form.card_name.toUpperCase(),
      card_address: form.card_address,
      card_status: form.card_status,
      btc_rate: form.btc_rate,
      notes: form.card_notes,
    });
  }
  return form.description;
}

// ─── Product form dialog ──────────────────────────────────────────────────────
function ProductFormDialog({
  open, onClose, initial, onSave, title,
}: {
  open: boolean;
  onClose: () => void;
  initial: ProductForm;
  onSave: (form: ProductForm) => Promise<void>;
  title: string;
}) {
  const [form, setForm] = useState<ProductForm>(initial);
  const [saving, setSaving] = useState(false);
  const [bin, setBin] = useState<BinRecord | null>(null);
  const [binLoading, setBinLoading] = useState(false);
  const fetchBin = useServerFn(lookupBin);

  useEffect(() => { if (open) { setForm(initial); setBin(null); } }, [open, initial]);

  // Debounced BIN lookup whenever card_number changes
  useEffect(() => {
    if (form.section !== "CARD") { setBin(null); return; }
    const digits = form.card_number.replace(/\D/g, "");
    if (digits.length < 6) { setBin(null); return; }
    let cancelled = false;
    setBinLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetchBin({ data: { cardNumber: digits } });
        if (!cancelled) setBin(res.bin);
      } catch { /* ignore */ }
      finally { if (!cancelled) setBinLoading(false); }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); setBinLoading(false); };
  }, [form.card_number, form.section, fetchBin]);

  const set = (k: keyof ProductForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const isCard = form.section === "CARD";

  const validate = (): string | null => {
    if (!form.name.trim()) return "Product name is required";
    const amt = parseFloat(form.amount);
    if (isNaN(amt) || amt < 0) return "Enter a valid price";
    if (isCard) {
      if (!form.card_number.replace(/\D/g, "") || form.card_number.replace(/\D/g, "").length !== 16) return "Enter a valid 16-digit card number";
      if (!form.card_name.trim()) return "Card holder name is required";
      if (!form.card_address.trim()) return "Card address is required";
    } else {
      if (!form.description.trim()) return "Description is required";
    }
    return null;
  };

  const submit = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    setSaving(true);
    try { await onSave(form); onClose(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  const sectionIcon = SHOP_SECTIONS.find((s) => s.id === form.section)?.icon ?? Package;
  const SectionIcon = sectionIcon;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SectionIcon className="h-4 w-4 text-primary" /> {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Section selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Section *</label>
            <div className="grid grid-cols-4 gap-1.5">
              {SHOP_SECTIONS.map(({ id, label, icon: Icon, color }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, section: id }))}
                  className={`flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs font-medium transition-all ${form.section === id ? "border-primary bg-primary/10 text-primary" : "border-border/50 hover:border-primary/40 text-muted-foreground"}`}
                >
                  <Icon className={`h-4 w-4 ${form.section === id ? "text-primary" : color}`} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Product name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {isCard ? "Card Product Title *" : "Product Name *"}
            </label>
            <Input
              placeholder={isCard ? "e.g. Chase Visa Gold — Classic" : "e.g. Premium Account Access"}
              value={form.name}
              onChange={set("name")}
            />
          </div>

          {/* CARD-specific fields */}
          {isCard && (
            <>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-500 uppercase tracking-wider">
                  <CreditCard className="h-3.5 w-3.5" /> Card Details
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">16-Digit Card Number *</label>
                  <Input
                    placeholder="1234 5678 9012 3456"
                    value={form.card_number}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 16);
                      const fmt = v.match(/.{1,4}/g)?.join(" ") ?? v;
                      setForm((f) => ({ ...f, card_number: fmt }));
                    }}
                    className="font-mono tracking-widest"
                    maxLength={19}
                  />
                  {form.card_number.replace(/\D/g, "").length >= 6 && (
                    <div className="rounded-lg border border-border/50 bg-background/60 px-3 py-2 text-[11px]">
                      {binLoading ? (
                        <span className="flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Looking up BIN…</span>
                      ) : bin ? (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline" className="font-mono text-[10px]">{bin.bin}</Badge>
                            <span className="font-semibold text-foreground">{bin.bank}</span>
                            <span className="text-muted-foreground">· {bin.brand}{bin.card_level ? ` ${bin.card_level}` : ""}{bin.card_type ? ` · ${bin.card_type}` : ""}</span>
                            {bin.country && <span className="text-muted-foreground">· {bin.country}{bin.country_code ? ` (${bin.country_code})` : ""}</span>}
                          </div>
                          <button
                            type="button"
                            className="rounded-md border border-primary/40 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10"
                            onClick={() => {
                              const summary = `${bin.bank} · ${bin.brand}${bin.card_level ? ` ${bin.card_level}` : ""}${bin.card_type ? ` (${bin.card_type})` : ""}${bin.country ? ` · ${bin.country}` : ""}`;
                              setForm((f) => ({
                                ...f,
                                card_notes: f.card_notes ? `${summary}\n${f.card_notes}` : summary,
                              }));
                              toast.success("BIN info applied to notes");
                            }}
                          >Apply to notes</button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">No BIN match — add it under Admin → BINs.</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Card Holder Name *</label>
                    <Input
                      placeholder="JOHN DOE"
                      value={form.card_name}
                      onChange={(e) => setForm((f) => ({ ...f, card_name: e.target.value.toUpperCase() }))}
                      className="uppercase"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Card Status *</label>
                    <div className="flex gap-2">
                      {(["active", "dead"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, card_status: s }))}
                          className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-all capitalize ${form.card_status === s
                            ? s === "active" ? "border-emerald-500 bg-emerald-500/15 text-emerald-400" : "border-red-500 bg-red-500/15 text-red-400"
                            : "border-border/50 text-muted-foreground hover:border-primary/40"}`}
                        >
                          {s === "active" ? "✓ Active" : "✗ Dead"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Billing Address *</label>
                  <Input placeholder="123 Main St, New York, NY 10001, USA" value={form.card_address} onChange={set("card_address")} />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Bitcoin className="h-3 w-3 text-amber-400" /> BTC Rate (optional)
                  </label>
                  <Input
                    placeholder="e.g. 0.00001524"
                    value={form.btc_rate}
                    onChange={set("btc_rate")}
                    className="font-mono"
                  />
                  <p className="text-[11px] text-muted-foreground">Manual BTC equivalent — leave blank to auto-calculate from USD price</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Notes (optional)</label>
                  <Textarea placeholder="Additional card info…" value={form.card_notes} onChange={set("card_notes")} rows={2} className="resize-none" />
                </div>
              </div>
            </>
          )}

          {/* Non-CARD description */}
          {!isCard && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Description *</label>
              <Textarea
                placeholder="Describe the product or service in detail…"
                value={form.description}
                onChange={set("description")}
                rows={4}
                className="resize-none"
              />
            </div>
          )}

          {/* Price row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <DollarSign className="h-3 w-3" /> Price (USD) *
              </label>
              <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={set("amount")} className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Currency</label>
              <Select value={form.currency} onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["USD", "EUR", "GBP", "USDT", "BTC"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Image URL */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <ImageIcon className="h-3 w-3" /> Image URL (optional)
            </label>
            <Input placeholder="https://example.com/image.jpg" value={form.image_url} onChange={set("image_url")} />
            {form.image_url && form.image_url.startsWith("http") && (
              <img src={form.image_url} alt="preview" className="mt-2 h-20 w-full rounded-md object-cover border border-border/40" />
            )}
          </div>

          {/* Telegram */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Support Telegram (optional)</label>
            <Input placeholder="username (without @)" value={form.contact_telegram} onChange={set("contact_telegram")} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save Product"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Shop Panel ───────────────────────────────────────────────────────────────
function ShopPanel() {
  const qc = useQueryClient();
  const listProducts = useServerFn(adminListShopProducts);
  const getStats = useServerFn(adminGetShopStats);
  const doCreate = useServerFn(adminCreateShopProduct);
  const doUpdate = useServerFn(adminUpdateShopProduct);
  const doDelete = useServerFn(adminDeleteShopProduct);

  const [sectionFilter, setSectionFilter] = useState<ShopSection | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "sold">("all");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState<ShopSection | null>(null);
  const [editing, setEditing] = useState<ShopProduct | null>(null);

  const { data: statsRaw, refetch: refetchStats } = useQuery({
    queryKey: ["shop-stats"],
    queryFn: () => getStats(),
  });
  const stats = statsRaw as { total: number; active: number; inactive: number; sold: number; bySection: Record<string, number> } | undefined;

  const { data, refetch } = useQuery({
    queryKey: ["admin-shop-products", sectionFilter, statusFilter],
    queryFn: () => listProducts({ data: { status: statusFilter, section: sectionFilter } }),
  });
  const products = ((data as { products: ShopProduct[] } | undefined)?.products ?? []).filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()),
  );

  const refresh = () => { refetch(); refetchStats(); qc.invalidateQueries({ queryKey: ["shop-products"] }); };

  const handleCreate = async (form: ProductForm) => {
    const description = buildDescription(form);
    await doCreate({
      data: {
        name: form.name,
        section: form.section,
        amount: parseFloat(form.amount),
        currency: form.currency,
        description,
        image_url: form.image_url || undefined,
        contact_telegram: form.contact_telegram || undefined,
      },
    });
    toast.success("Product published to marketplace");
    refresh();
  };

  const handleUpdate = async (form: ProductForm) => {
    if (!editing) return;
    const description = buildDescription(form);
    await doUpdate({
      data: {
        id: editing.id,
        name: form.name,
        section: form.section,
        amount: parseFloat(form.amount),
        currency: form.currency,
        description,
        image_url: form.image_url,
        contact_telegram: form.contact_telegram,
      },
    });
    toast.success("Product updated");
    refresh();
  };

  const toggleStatus = async (p: ShopProduct) => {
    const next = p.status === "active" ? "inactive" : "active";
    try {
      await doUpdate({ data: { id: p.id, status: next } });
      toast.success(`Product ${next === "active" ? "published" : "hidden"}`);
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  const markSold = async (p: ShopProduct) => {
    if (!window.confirm(`Mark "${p.name}" as sold out?`)) return;
    try {
      await doUpdate({ data: { id: p.id, status: "sold" } });
      toast.success("Marked as sold out");
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  const handleDelete = async (p: ShopProduct) => {
    if (!window.confirm(`Permanently delete "${p.name}"?`)) return;
    try {
      await doDelete({ data: { id: p.id } });
      toast.success("Product deleted");
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  const sectionIcon = (s: string) => {
    const found = SHOP_SECTIONS.find((x) => x.id === s);
    if (!found) return <Package className="h-3.5 w-3.5" />;
    const Icon = found.icon;
    return <Icon className={`h-3.5 w-3.5 ${found.color}`} />;
  };

  const createInitial: ProductForm = { ...BLANK_FORM, section: creating ?? "CARD" };
  const editInitial = editing ? formFromProduct(editing) : BLANK_FORM;

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
        {[
          { label: "Total", value: stats?.total ?? 0, icon: Package, color: "text-primary" },
          { label: "Active", value: stats?.active ?? 0, icon: CheckCircle2, color: "text-emerald-500" },
          { label: "Hidden", value: stats?.inactive ?? 0, icon: EyeOff, color: "text-amber-500" },
          { label: "Sold Out", value: stats?.sold ?? 0, icon: XCircle, color: "text-muted-foreground" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="surface rounded-xl p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <Icon className={`h-3.5 w-3.5 ${color}`} /> {label}
            </div>
            <div className="mt-1 text-2xl font-bold">{value}</div>
          </div>
        ))}
      </div>

      {/* Section breakdown */}
      {stats && (
        <div className="grid grid-cols-4 gap-2">
          {SHOP_SECTIONS.map(({ id, label, icon: Icon, color }) => (
            <div
              key={id}
              onClick={() => setSectionFilter(sectionFilter === id ? "all" : id)}
              className={`surface cursor-pointer rounded-xl p-3 border transition-all ${sectionFilter === id ? "border-primary" : "border-transparent hover:border-border/60"}`}
            >
              <Icon className={`h-4 w-4 ${color}`} />
              <div className="mt-1 text-lg font-bold">{stats.bySection?.[id] ?? 0}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="surface rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-48 h-8 text-sm" />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="h-8 w-32 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Hidden</SelectItem>
                <SelectItem value="sold">Sold out</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={refresh}>Refresh</Button>
          </div>
          <div className="flex items-center gap-2">
            {SHOP_SECTIONS.map(({ id, label, icon: Icon }) => (
              <Button
                key={id}
                size="sm"
                variant="outline"
                onClick={() => setCreating(id)}
                className="gap-1.5 h-8 text-xs"
              >
                <Icon className="h-3.5 w-3.5" />
                Add {label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Products list */}
      <div className="surface rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border/40 flex items-center justify-between">
          <h2 className="font-semibold text-sm">
            Products ({products.length})
            {sectionFilter !== "all" && <span className="ml-2 text-muted-foreground font-normal">— {sectionFilter}</span>}
          </h2>
        </div>
        {products.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center text-muted-foreground">
            <Package className="h-10 w-10 opacity-30" />
            <div className="text-sm">
              {search ? "No products match your search." : 'No products yet. Use "Add" buttons above to get started.'}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {products.map((p) => {
              const hasImage = p.image_url && p.image_url.startsWith("http");
              const section = p.category?.toUpperCase() as ShopSection;
              const isCardItem = section === "CARD";
              return (
                <div key={p.id} className="flex items-center gap-4 px-5 py-3.5">
                  {/* Thumbnail */}
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border/40 bg-secondary/50 flex items-center justify-center">
                    {hasImage ? (
                      <img src={p.image_url!} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      sectionIcon(section)
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{p.name}</span>
                      <Badge variant="secondary" className="text-[10px] shrink-0">{section}</Badge>
                      <Badge
                        variant={p.status === "active" ? "default" : p.status === "sold" ? "destructive" : "secondary"}
                        className="text-[10px] shrink-0"
                      >
                        {p.status}
                      </Badge>
                      {isCardItem && p.card && (
                        <Badge
                          className={`text-[10px] shrink-0 ${p.card.card_status === "active" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" : "bg-red-500/15 text-red-400 border-red-500/20"}`}
                          variant="outline"
                        >
                          Card: {p.card.card_status}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                      {isCardItem && p.card
                        ? `${p.card.card_number?.replace(/\d(?=\d{4})/g, "•") ?? "••••"} · ${p.card.card_name ?? ""}`
                        : p.description}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono font-medium text-foreground">
                        {p.amount != null ? `$${Number(p.amount).toFixed(2)}` : "Free"}
                      </span>
                      {isCardItem && p.card?.btc_rate && (
                        <span className="font-mono text-amber-400 flex items-center gap-0.5">
                          <Bitcoin className="h-3 w-3" />{p.card.btc_rate}
                        </span>
                      )}
                      <span>·</span>
                      <span>{new Date(p.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0"
                      title={p.status === "active" ? "Hide" : "Publish"}
                      onClick={() => toggleStatus(p)} disabled={p.status === "sold"}>
                      {p.status === "active" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Edit" onClick={() => setEditing(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {p.status !== "sold" && (
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-amber-500 hover:text-amber-600"
                        title="Mark sold out" onClick={() => markSold(p)}>
                        <XCircle className="h-4 w-4" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      title="Delete" onClick={() => handleDelete(p)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <ProductFormDialog
        open={!!creating}
        onClose={() => setCreating(null)}
        initial={createInitial}
        onSave={handleCreate}
        title={`Add ${creating} Product`}
      />

      {/* Edit dialog */}
      <ProductFormDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        initial={editInitial}
        onSave={handleUpdate}
        title="Edit Product"
      />
    </div>
  );
}
