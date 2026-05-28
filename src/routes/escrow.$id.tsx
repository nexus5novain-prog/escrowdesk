import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthGate } from "@/components/AuthGate";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  getEscrowGroup, sendGroupMessage, inviteModerator,
  submitGroupTxHash, releaseEscrowGroup, cancelEscrowGroup,
  acceptEscrowInvite, declineEscrowInvite, verifyGroupDeposit,
} from "@/lib/escrow-groups.functions";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ShieldAlert, Send, ExternalLink, Hash, CheckCircle2, CircleDot, Clock, XCircle } from "lucide-react";

const TIMELINE: { key: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "awaiting_counterparty", label: "Created", icon: CircleDot },
  { key: "active", label: "Awaiting deposit", icon: Clock },
  { key: "funded", label: "Deposit submitted", icon: Hash },
  { key: "released", label: "Released", icon: CheckCircle2 },
];

function StatusTimeline({ status }: { status: string }) {
  if (status === "cancelled") {
    return (
      <div className="surface flex items-center gap-3 p-4 text-sm">
        <XCircle className="h-5 w-5 text-destructive" />
        <span className="font-medium">Group cancelled</span>
      </div>
    );
  }
  const order = TIMELINE.map((s) => s.key);
  const activeIdx = Math.max(0, order.indexOf(status));
  return (
    <div className="surface p-4">
      <div className="flex items-center justify-between gap-2">
        {TIMELINE.map((s, i) => {
          const done = i < activeIdx;
          const current = i === activeIdx;
          const Icon = s.icon;
          return (
            <div key={s.key} className="flex flex-1 items-center gap-2">
              <div className={`flex items-center gap-2 ${current ? "text-primary" : done ? "text-emerald-400" : "text-muted-foreground"}`}>
                <div className={`grid h-7 w-7 place-items-center rounded-full border ${current ? "border-primary bg-primary/15 animate-pulse" : done ? "border-emerald-500/50 bg-emerald-500/10" : "border-border/60 bg-secondary/30"}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <span className="text-[11px] font-medium uppercase tracking-wide">{s.label}</span>
              </div>
              {i < TIMELINE.length - 1 && (
                <div className={`h-px flex-1 ${done ? "bg-emerald-500/50" : "bg-border/60"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/escrow/$id")({
  component: () => (<AuthGate><EscrowGroupPage /></AuthGate>),
});

function EscrowGroupPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const fetchGroup = useServerFn(getEscrowGroup);
  const sendMsg = useServerFn(sendGroupMessage);
  const invMod = useServerFn(inviteModerator);
  const submitHash = useServerFn(submitGroupTxHash);
  const release = useServerFn(releaseEscrowGroup);
  const cancel = useServerFn(cancelEscrowGroup);
  const accept = useServerFn(acceptEscrowInvite);
  const decline = useServerFn(declineEscrowInvite);
  const verify = useServerFn(verifyGroupDeposit);

  const { data, refetch } = useQuery({
    queryKey: ["escrow-group", id],
    queryFn: () => fetchGroup({ data: { id } }),
  });

  const [msg, setMsg] = useState("");
  const [hash, setHash] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ch = supabase.channel(`eg:${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "escrow_group_messages", filter: `group_id=eq.${id}` }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "escrow_groups", filter: `id=eq.${id}` }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, refetch]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [data?.messages.length]);

  if (!data) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const g = data.group as {
    id: string; creator_id: string; counterparty_id: string | null; asset: string; amount: number;
    fiat_amount: number | null; fiat_currency: string; status: string;
    escrow_address: string | null; escrow_address_chain: string | null;
    deposit_tx_hash: string | null; deposit_verified_at: string | null;
    telegram_chat_id: number | null;
    telegram_link_token: string | null; invited_telegram: string | null;
    invited_username: string | null;
  };
  const isBuyer = user?.id === g.creator_id;
  const isSeller = user?.id === g.counterparty_id;
  const myMember = data.members.find((m) => m.user_id === user?.id) as
    { accepted_at: string | null; declined_at: string | null; role: string } | undefined;
  const sellerMember = data.members.find((m) => m.role === "seller") as
    { accepted_at: string | null; declined_at: string | null } | undefined;
  const sellerPending = !!sellerMember && !sellerMember.accepted_at && !sellerMember.declined_at;
  const iAmPendingInvitee = !!myMember && !myMember.accepted_at && !myMember.declined_at && myMember.role !== "buyer";

  const buyerProfile = data.members.find((m) => m.role === "buyer")?.profile as
    Record<string, string | null> | undefined;
  const sellerProfile = data.members.find((m) => m.role === "seller")?.profile as
    Record<string, string | null> | undefined;
  const depositPanelVisible = g.status === "active" || g.status === "funded";
  const blurAddress = (addr: string | null | undefined) => {
    if (!addr) return "";
    return addr.length <= 16 ? addr : `${addr.slice(0, 8)}…${addr.slice(-8)}`;
  };
  const walletFieldByAsset: Record<string, string> = {
    BTC: "wallet_address_btc", USDT: "wallet_address_usdt",
    USDC: "wallet_address_usdc", ETH: "wallet_address_eth",
  };
  const walletField = walletFieldByAsset[g.asset] ?? "wallet_address_btc";
  const buyerWallet = buyerProfile?.[walletField] ?? null;
  const sellerWallet = sellerProfile?.[walletField] ?? null;
  const funded = g.status === "funded" || g.status === "released";
  const heldAmount = funded ? g.amount : 0;
  const heldFiat = funded ? (g.fiat_amount ?? 0) : 0;


  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); refetch(); } catch (e) { toast.error((e as Error).message); }
  };

  const tgDeepLink = g.telegram_link_token
    ? `https://t.me/share/url?url=${encodeURIComponent("/start " + g.telegram_link_token)}`
    : null;

  const inviteUrl = typeof window !== "undefined" ? `${window.location.origin}/escrow/${g.id}` : `/escrow/${g.id}`;
  const showInvitePanel = isBuyer && sellerPending;

  return (
    <div className="space-y-6">
      <section className="surface rounded-3xl p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Escrow group</div>
            <h1 className="text-3xl font-semibold">Trade room · {g.amount} {g.asset}</h1>
            <p className="mt-2 text-sm text-muted-foreground">This is your escrow group for the trade. Chat, track deposits, accept invites, and sync with Telegram in one place.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="uppercase">{g.status.replace(/_/g," ")}</Badge>
            {tgDeepLink && (
              <a href={tgDeepLink} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm">Open in Telegram</Button>
              </a>
            )}
            <Link to="/escrow"><Button variant="ghost" size="sm">My escrow</Button></Link>
          </div>
        </div>

        {showInvitePanel && (
          <div className="mt-5 rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-primary">Invite the counterparty</div>
            <p className="mt-1 text-sm text-muted-foreground">Share this link with the seller. They'll be added to the group as soon as they sign in and accept.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Input readOnly value={inviteUrl} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button
                size="sm"
                onClick={() => { navigator.clipboard.writeText(inviteUrl); toast.success("Invite link copied"); }}
              >Copy link</Button>
              <a
                href={`https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent("Join my escrow group on EscrowDesk")}`}
                target="_blank" rel="noreferrer"
              >
                <Button size="sm" variant="outline" className="w-full sm:w-auto">Share via Telegram</Button>
              </a>
            </div>
          </div>
        )}
      </section>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          {/* Header */}
          <div className="surface p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase text-muted-foreground">Escrow group · {g.id.slice(0,8)}</div>
                <div className="mt-1 font-mono text-xl">
                  {g.amount} {g.asset}
                  {g.fiat_amount ? <span className="text-sm text-muted-foreground"> · ≈ {g.fiat_amount} {g.fiat_currency}</span> : null}
                </div>
              </div>
              <Badge variant="outline" className="uppercase">{g.status.replace(/_/g," ")}</Badge>
            </div>
            <div className="mt-4 grid gap-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Buyer (group creator)</span><span>{data.members.find((m) => m.role === "buyer")?.profile?.display_name ?? "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Seller</span>
              <span>{data.members.find((m) => m.role === "seller")?.profile?.display_name ?? (g.invited_username ?? g.invited_telegram ?? "(awaiting acceptance)")}</span>
            </div>
            {data.members.find((m) => m.role === "moderator") && (
              <div className="flex justify-between"><span className="text-muted-foreground">Moderator</span>
                <span>{data.members.find((m) => m.role === "moderator")?.profile?.display_name}</span>
              </div>
            )}
            <div className="flex justify-between"><span className="text-muted-foreground">Escrow address ({g.escrow_address_chain ?? g.asset})</span>
              <span className="font-mono text-xs">{g.escrow_address ?? <em className="text-muted-foreground">seller has no payout address yet</em>}</span>
            </div>
            {g.deposit_tx_hash && (
              <div className="flex justify-between"><span className="text-muted-foreground">Deposit tx</span><span className="font-mono text-xs">{g.deposit_tx_hash}</span></div>
            )}
          </div>
        </div>

        <StatusTimeline status={g.status} />

        {iAmPendingInvitee && (
          <div className="surface p-5 border-emerald-200/60">
            <div className="flex flex-col gap-3">
              <div className="text-sm font-semibold">Pending invite</div>
              <p className="text-sm text-muted-foreground">You were invited into this escrow group as a {myMember?.role}. Accept the invite to join the group and continue the transaction.</p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => act(() => accept({ data: { group_id: g.id } }), "Invite accepted")}>Accept invite</Button>
                <Button variant="outline" onClick={() => act(() => decline({ data: { group_id: g.id } }), "Invite declined")}>Decline invite</Button>
              </div>
            </div>
          </div>
        )}

        {depositPanelVisible && (
          <div className="surface p-5 space-y-4">
            <div className="grid gap-4 xl:grid-cols-3">
              <div className="rounded-3xl border border-border/60 p-5">
                <div className="flex items-center gap-3">
                  <Avatar>
                    {buyerProfile?.display_name ? (
                      <AvatarFallback>{buyerProfile.display_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    ) : (
                      <AvatarFallback>BY</AvatarFallback>
                    )}
                  </Avatar>
                  <div>
                    <div className="text-sm font-semibold">{buyerProfile?.display_name ?? "Buyer"}</div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Buyer profile</div>
                  </div>
                </div>
                <div className="mt-4 rounded-2xl bg-secondary/50 p-4">
                  <div className="text-[10px] uppercase text-muted-foreground">Deposit address</div>
                  <div className="mt-2 font-mono text-sm break-words">{buyerProfile?.wallet_address_btc ? blurAddress(buyerProfile.wallet_address_btc) : <span className="text-muted-foreground">Buyer has not added a BTC address.</span>}</div>
                </div>
              </div>

              <div className="rounded-3xl border border-border/60 p-5 bg-primary/5">
                <div className="flex flex-col items-center justify-center gap-3 text-center">
                  <div className="text-6xl animate-[bounce_1.2s_infinite]">🤖</div>
                  <div className="text-sm font-semibold">Escrow bot</div>
                  <div className="text-[11px] text-muted-foreground">Live monitoring of BTC deposit and chain balance.</div>
                </div>
                <div className="mt-4 space-y-4">
                  <div className="rounded-2xl bg-background p-4">
                    <div className="text-[10px] uppercase text-muted-foreground">Real deposited balance</div>
                    <div className="mt-2 text-2xl font-semibold">{g.status === "funded" ? `${g.amount} BTC` : "Awaiting deposit"}</div>
                    <div className="text-[11px] text-muted-foreground">{g.status === "funded" ? "Updated from the BTC transaction hash." : "Buyer must fund the escrow address below."}</div>
                  </div>
                  <div className="rounded-2xl bg-background p-4">
                    <div className="text-[10px] uppercase text-muted-foreground">Escrow address</div>
                    <div className="mt-2 font-mono text-sm break-all">{g.escrow_address ?? "Waiting for seller BTC payout address."}</div>
                  </div>
                  <div className="rounded-2xl bg-background p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] uppercase text-muted-foreground">Transaction hash</div>
                      {g.deposit_tx_hash ? <Badge variant="outline" className="text-[10px]">submitted</Badge> : null}
                    </div>
                    {g.deposit_tx_hash ? (
                      <div className="mt-2 font-mono text-sm break-all">{g.deposit_tx_hash}</div>
                    ) : (
                      <div className="mt-2 flex flex-col gap-2">
                        <Input value={hash} onChange={(e) => setHash(e.target.value)} placeholder="Paste BTC tx hash" className="font-mono" />
                        <Button onClick={() => act(() => submitHash({ data: { group_id: g.id, hash } }), "Hash submitted")} disabled={!hash.trim()}>Submit</Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-border/60 p-5">
                <div className="flex items-center gap-3">
                  <Avatar>
                    {sellerProfile?.display_name ? (
                      <AvatarFallback>{sellerProfile.display_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    ) : (
                      <AvatarFallback>SL</AvatarFallback>
                    )}
                  </Avatar>
                  <div>
                    <div className="text-sm font-semibold">{sellerProfile?.display_name ?? "Seller"}</div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Seller details</div>
                  </div>
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">Trading amount</div>
                    <div>{g.amount} BTC{g.fiat_amount ? ` · ≈ ${g.fiat_amount} ${g.fiat_currency}` : ""}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">Release address</div>
                    <div className="mt-2 font-mono text-sm break-all">{g.escrow_address ?? "No BTC payout address configured."}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pending invite — for the invited counterparty (seller or moderator) */}

        {/* Seller: verify deposit then release */}
        {isSeller && !iAmPendingInvitee && g.status === "funded" && (
          <div className="surface p-5 space-y-3">
            <div className="flex items-center gap-2 font-semibold text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Verify deposit & release</div>
            <p className="text-xs text-muted-foreground">
              Buyer submitted tx <code className="font-mono">{g.deposit_tx_hash}</code>. Check the {g.escrow_address_chain ?? g.asset} chain to confirm{" "}
              {g.amount} {g.asset} arrived at <code className="font-mono">{g.escrow_address}</code>.
            </p>
            <div className="flex flex-wrap gap-2">
              {!g.deposit_verified_at ? (
                <Button variant="outline" onClick={() => act(() => verify({ data: { group_id: g.id } }), "Deposit marked verified")}>
                  Mark deposit verified
                </Button>
              ) : (
                <Badge className="bg-emerald-500/15 text-emerald-300">Deposit verified on-chain</Badge>
              )}
              <Button disabled={!g.deposit_verified_at} onClick={() => act(() => release({ data: { group_id: g.id } }), "Released")}>
                Release escrow to buyer
              </Button>
            </div>
          </div>
        )}


        {/* Actions */}
        <div className="surface p-5">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => act(() => invMod({ data: { group_id: g.id } }), "Moderator invited")}>
              <ShieldAlert className="mr-2 h-4 w-4" /> Invite moderator
            </Button>
            {tgDeepLink && (
              <a href={tgDeepLink} target="_blank" rel="noreferrer">
                <Button variant="outline"><ExternalLink className="mr-2 h-4 w-4" /> Open in Telegram</Button>
              </a>
            )}
            {!["released","cancelled"].includes(g.status) && (
              <Button variant="ghost" onClick={() => act(() => cancel({ data: { group_id: g.id } }), "Cancelled")}>Cancel group</Button>
            )}
            <Link to="/escrow/new"><Button variant="ghost">+ New group</Button></Link>
          </div>
          {tgDeepLink && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              Telegram tip: create a group in Telegram, add the bot, then send <code>/start {g.telegram_link_token}</code> to bind it.
              Once bound, every message in this chat mirrors to Telegram and vice-versa.
            </p>
          )}
        </div>
      </div>

      {/* Chat */}
      <div className="surface flex h-[640px] flex-col">
        <div className="border-b border-border/60 p-3 text-sm font-semibold">Group chat</div>
        <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
          {data.messages.map((m) => (
            <div key={m.id} className={`rounded-md p-2 ${m.is_system ? "border border-dashed border-border/60 text-xs text-muted-foreground" : m.sender_id === user?.id ? "ml-8 bg-primary/15" : "mr-8 bg-secondary/40"}`}>
              {!m.is_system && m.sender?.display_name && (
                <div className="mb-0.5 text-[10px] font-semibold text-muted-foreground">
                  {m.sender.display_name}{m.from_telegram ? " · via TG" : ""}
                </div>
              )}
              {m.body}
              <div className="mt-1 text-[10px] text-muted-foreground">{new Date(m.created_at).toLocaleTimeString()}</div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <form className="flex gap-2 border-t border-border/60 p-3" onSubmit={async (e) => {
          e.preventDefault();
          if (!msg.trim()) return;
          try { await sendMsg({ data: { group_id: g.id, body: msg } }); setMsg(""); refetch(); }
          catch (e) { toast.error((e as Error).message); }
        }}>
          <Input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Type a message…" />
          <Button type="submit"><Send className="h-4 w-4" /></Button>
        </form>
      </div>
    </div>
    </div>
  );
}
