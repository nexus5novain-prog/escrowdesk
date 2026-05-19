import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthGate } from "@/components/AuthGate";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { listMyEscrowGroups } from "@/lib/escrow-groups.functions";
import { fmtCrypto, fmtFiat, shortId } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Activity, CheckCircle2, XCircle, Clock, Handshake } from "lucide-react";
import { motion } from "framer-motion";

export const Route = createFileRoute("/escrow")({
  head: () => ({
    meta: [
      { title: "Escrow — EscrowDesk" },
      { name: "description", content: "View all escrow groups, bought products, services, and transaction history in one dashboard." },
    ],
  }),
  component: () => (<AuthGate><Escrow /></AuthGate>),
});

type StatusBucket = "open" | "pending" | "successful" | "failed";

function bucketOf(status: string): StatusBucket {
  if (status === "released") return "successful";
  if (status === "cancelled" || status === "disputed") return "failed";
  if (status === "awaiting_counterparty") return "pending";
  return "open";
}

function Escrow() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fn = useServerFn(listMyEscrowGroups);
  const { data } = useQuery({
    queryKey: ["my-escrow-groups"],
    queryFn: () => fn(),
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`escrow-main-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "escrow_groups" }, () => {
        qc.invalidateQueries({ queryKey: ["my-escrow-groups"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "escrow_group_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["my-escrow-groups"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, qc]);

  const stats = data?.stats ?? { open: 0, pending: 0, successful: 0, failed: 0 };
  const groups = data?.groups ?? [];
  const purchases = groups.filter((g) => g.creator_id === user?.id);
  const historyGroups = groups.filter((g) => ["released", "cancelled", "disputed"].includes(String(g.status)));
  const active = groups.filter((g) => !["released", "cancelled"].includes(String(g.status)));

  const cards: { key: StatusBucket; label: string; value: number; icon: React.ReactNode; tone: string }[] = [
    { key: "open", label: "Open escrows", value: stats.open, icon: <Activity className="h-4 w-4" />, tone: "text-primary" },
    { key: "successful", label: "Successful", value: stats.successful, icon: <CheckCircle2 className="h-4 w-4" />, tone: "text-emerald-500" },
    { key: "failed", label: "Failed", value: stats.failed, icon: <XCircle className="h-4 w-4" />, tone: "text-destructive" },
    { key: "pending", label: "Pending", value: stats.pending, icon: <Clock className="h-4 w-4" />, tone: "text-amber-500" },
  ];

  return (
    <div className="space-y-6">
      <section className="surface rounded-3xl p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Escrow Management</div>
            <h1 className="text-3xl font-semibold">Escrow Dashboard</h1>
            <p className="mt-2 text-sm text-muted-foreground">Review all escrow groups, purchases, and transaction history. Manage your active escrows and monitor transaction statuses.</p>
          </div>
          <Link to="/escrow/new"><Badge className="cursor-pointer gap-1"><Handshake className="h-3 w-3" /> New escrow</Badge></Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <motion.div
            key={c.key}
            layout
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="surface p-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">{c.label}</span>
              <span className={c.tone}>{c.icon}</span>
            </div>
            <motion.div
              key={c.value}
              initial={{ scale: 0.9, opacity: 0.5 }} animate={{ scale: 1, opacity: 1 }}
              className="mt-2 font-mono text-3xl font-semibold"
            >{c.value}</motion.div>
            <div className="mt-1 h-1 w-full rounded-full bg-secondary/40 overflow-hidden">
              <div className={`h-full ${c.tone.replace("text-", "bg-")} opacity-60`} style={{ width: `${Math.min(100, c.value * 8)}%` }} />
            </div>
          </motion.div>
        ))}
      </section>

      <section className="surface">
        <header className="flex flex-col gap-2 border-b border-border/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider">Purchased Items</h2>
            <p className="text-xs text-muted-foreground">All products and services that you purchased through escrow.</p>
          </div>
          <span className="font-mono text-xs text-muted-foreground">{purchases.length} purchased</span>
        </header>
        <div className="divide-y divide-border/40">
          {purchases.map((g) => {
            const title = g.listing?.name ?? `Escrow ${shortId(g.id)}`;
            const subtitle = g.listing?.category ?? "Escrow purchase";
            const downloadLink = g.listing?.contact_website ?? null;
            return (
              <div
                key={g.id}
                className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-secondary/30 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <Link to="/escrow/$id" params={{ id: g.id }} className="font-semibold hover:underline">
                    {title}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{subtitle}</span>
                    <span>· {g.counterparty?.display_name ?? "Seller unknown"}</span>
                    <span>· {new Date(g.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="font-mono text-sm">{fmtCrypto(Number(g.amount), g.asset)}</div>
                  {g.fiat_amount != null && <div className="font-mono text-xs text-muted-foreground">{fmtFiat(Number(g.fiat_amount), g.fiat_currency || "USD")}</div>}
                  {downloadLink && (
                    <a href={downloadLink} target="_blank" rel="noreferrer" className="rounded-full border border-border/60 bg-background px-3 py-1 text-xs font-medium text-primary hover:bg-primary/5">
                      Download
                    </a>
                  )}
                </div>
              </div>
            );
          })}
          {purchases.length === 0 && (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No purchased items yet. <Link to="/marketplace" className="text-primary underline">Browse the marketplace</Link> or <Link to="/escrow/new" className="text-primary underline">create an escrow</Link>.
            </div>
          )}
        </div>
      </section>

      <section className="surface">
        <header className="flex items-center justify-between border-b border-border/40 px-5 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider">Active Escrows</h2>
          <span className="font-mono text-xs text-muted-foreground">{active.length} active</span>
        </header>
        <div className="divide-y divide-border/40">
          {active.map((g) => {
            const b = bucketOf(String(g.status));
            const tone = b === "successful" ? "text-emerald-500" : b === "failed" ? "text-destructive" : b === "pending" ? "text-amber-500" : "text-primary";
            return (
              <Link
                key={g.id}
                to="/escrow/$id"
                params={{ id: g.id }}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-secondary/30"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">{shortId(g.id)}</span>
                    <Badge variant="outline" className={`uppercase text-[10px] ${tone}`}>{String(g.status).replace(/_/g, " ")}</Badge>
                    <span className="text-[10px] text-muted-foreground">· {g.my_role}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    with {g.counterparty?.display_name ?? "—"} · {new Date(g.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="font-mono text-sm">{fmtCrypto(Number(g.amount), g.asset)}</div>
                  {g.fiat_amount != null && (
                    <div className="font-mono text-xs text-muted-foreground">{fmtFiat(Number(g.fiat_amount), g.fiat_currency || "USD")}</div>
                  )}
                </div>
              </Link>
            );
          })}
          {active.length === 0 && (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No active escrows. <Link to="/marketplace" className="text-primary underline">Browse the marketplace</Link> or <Link to="/escrow/new" className="text-primary underline">start a new escrow</Link>.
            </div>
          )}
        </div>
      </section>

      {/* All history (released/cancelled) */}
      {historyGroups.length > 0 && (
        <section className="surface">
          <header className="flex items-center justify-between border-b border-border/40 px-5 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider">History</h2>
            <span className="font-mono text-xs text-muted-foreground">{historyGroups.length} records</span>
          </header>
          <div className="divide-y divide-border/40">
            {historyGroups.map((g) => (
              <Link key={g.id} to="/escrow/$id" params={{ id: g.id }} className="flex items-center justify-between px-5 py-2.5 text-sm hover:bg-secondary/20">
                <span className="font-mono text-xs">{shortId(g.id)}</span>
                <span className="text-xs text-muted-foreground">{g.counterparty?.display_name ?? "—"}</span>
                <span className="font-mono text-xs">{fmtCrypto(Number(g.amount), g.asset)}</span>
                <Badge variant="outline" className="text-[10px] uppercase">{String(g.status)}</Badge>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
