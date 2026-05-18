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

export const Route = createFileRoute("/trades")({
  head: () => ({ meta: [{ title: "Trades — EscrowDesk" }] }),
  component: () => (<AuthGate><Trades /></AuthGate>),
});

type StatusBucket = "open" | "pending" | "successful" | "failed";

function bucketOf(status: string): StatusBucket {
  if (status === "released") return "successful";
  if (status === "cancelled" || status === "disputed") return "failed";
  if (status === "awaiting_counterparty") return "pending";
  return "open";
}

function Trades() {
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
      .channel(`trades-live-${user.id}`)
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
  const active = groups.filter((g) => !["released", "cancelled"].includes(String(g.status)));

  const cards: { key: StatusBucket; label: string; value: number; icon: React.ReactNode; tone: string }[] = [
    { key: "open", label: "Open trades", value: stats.open, icon: <Activity className="h-4 w-4" />, tone: "text-primary" },
    { key: "successful", label: "Successful", value: stats.successful, icon: <CheckCircle2 className="h-4 w-4" />, tone: "text-emerald-500" },
    { key: "failed", label: "Failed", value: stats.failed, icon: <XCircle className="h-4 w-4" />, tone: "text-destructive" },
    { key: "pending", label: "Pending", value: stats.pending, icon: <Clock className="h-4 w-4" />, tone: "text-amber-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Trades</h1>
        <Link to="/escrow/new"><Badge className="cursor-pointer gap-1"><Handshake className="h-3 w-3" /> New escrow</Badge></Link>
      </div>

      {/* Live stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
      </div>

      {/* Active escrow groups */}
      <section className="surface">
        <header className="flex items-center justify-between border-b border-border/40 px-5 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider">Active escrow groups</h2>
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
              No active trades. <Link to="/" className="text-primary underline">Browse the marketplace</Link> or <Link to="/escrow/new" className="text-primary underline">start a manual escrow</Link>.
            </div>
          )}
        </div>
      </section>

      {/* All history (released/cancelled) */}
      {groups.length > active.length && (
        <section className="surface">
          <header className="flex items-center justify-between border-b border-border/40 px-5 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider">History</h2>
          </header>
          <div className="divide-y divide-border/40">
            {groups.filter((g) => ["released", "cancelled"].includes(String(g.status))).map((g) => (
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
