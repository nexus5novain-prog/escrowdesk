import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyTrades } from "@/lib/escrow.functions";
import { fmtCrypto, fmtFiat, shortId } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/trades")({ component: Trades });

function Trades() {
  const fn = useServerFn(getMyTrades);
  const { data } = useQuery({ queryKey: ["my-trades"], queryFn: () => fn() });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">My trades</h1>
      <div className="surface divide-y divide-border/40">
        {(data?.trades ?? []).map((t) => (
          <Link key={t.id} to="/trade/$id" params={{ id: t.id }} className="flex items-center justify-between p-4 hover:bg-secondary/30">
            <div>
              <div className="font-mono text-sm">{shortId(t.id)}</div>
              <div className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</div>
            </div>
            <div className="font-mono text-sm">{fmtCrypto(Number(t.crypto_amount), t.asset)}</div>
            <div className="font-mono text-sm">{fmtFiat(Number(t.fiat_amount), t.fiat_currency)}</div>
            <Badge variant="outline" className="uppercase">{t.status.replace("_"," ")}</Badge>
          </Link>
        ))}
        {(data?.trades.length ?? 0) === 0 && <div className="p-8 text-center text-sm text-muted-foreground">No trades yet.</div>}
      </div>
    </div>
  );
}
