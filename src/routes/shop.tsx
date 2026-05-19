import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { listMarketplace, type ListingRow } from "@/lib/marketplace.functions";
import { createEscrowGroup } from "@/lib/escrow-groups.functions";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { fmtFiat } from "@/lib/format";
import { ShoppingBag, Search, Sparkles } from "lucide-react";

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Shop — EscrowDesk" },
      { name: "description", content: "Browse curated digital goods and services for sale on EscrowDesk. Every purchase is auto-escrowed for safety." },
      { property: "og:title", content: "EscrowDesk Shop" },
      { property: "og:description", content: "Curated storefront with built-in escrow protection." },
    ],
  }),
  component: ShopPage,
});

function ShopPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const fetchMarket = useServerFn(listMarketplace);
  const createGroup = useServerFn(createEscrowGroup);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data, refetch } = useQuery({
    queryKey: ["shop-listings"],
    queryFn: () => fetchMarket({ data: {} }),
    refetchInterval: 20_000,
  });

  const items = useMemo<ListingRow[]>(() => {
    const g = data?.groups;
    if (!g) return [];
    const all = [...g.premium.selling, ...g.trusted.selling, ...g.regular.selling];
    if (!q.trim()) return all;
    const needle = q.toLowerCase();
    return all.filter((l) =>
      l.name.toLowerCase().includes(needle) ||
      l.category.toLowerCase().includes(needle) ||
      l.description.toLowerCase().includes(needle),
    );
  }, [data, q]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => set.add(i.category));
    return Array.from(set);
  }, [items]);

  const buy = async (row: ListingRow) => {
    if (!user) { nav({ to: "/auth" }); return; }
    if (row.user_id === user.id) { toast.error("This is your own listing"); return; }
    setBusy(row.id);
    try {
      const fiat = row.amount != null ? Number(row.amount) : 0;
      const res = await createGroup({ data: {
        asset: "USDT",
        amount: fiat > 0 ? fiat : 1,
        fiat_amount: fiat > 0 ? fiat : undefined,
        fiat_currency: row.currency || "USD",
        listing_id: row.id,
      } });
      toast.success("Escrow created");
      nav({ to: "/escrow/$id", params: { id: res.id } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
      refetch();
    }
  };

  return (
    <div className="space-y-6">
      <section className="surface rounded-3xl p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Storefront</div>
            <h1 className="flex items-center gap-2 text-3xl font-semibold"><ShoppingBag className="h-7 w-7 text-primary" /> EscrowDesk Shop</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Curated digital goods and services from verified sellers. Every purchase is auto-escrowed — funds release only when you confirm delivery.
            </p>
          </div>
          <Link to="/order-book">
            <Badge variant="outline" className="cursor-pointer gap-1"><Sparkles className="h-3 w-3" /> Live order book</Badge>
          </Link>
        </div>
      </section>

      <section className="surface p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search products & services" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {categories.slice(0, 8).map((c) => (
              <Badge key={c} variant="secondary" className="cursor-pointer" onClick={() => setQ(c)}>{c}</Badge>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((row) => (
          <article key={row.id} className="surface flex flex-col gap-3 p-5">
            <header className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold">{row.name}</h3>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="rounded-full bg-secondary/60 px-2 py-0.5">{row.category}</span>
                  {row.profile?.is_premium && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-500">Premium</span>}
                  {row.profile?.is_trusted && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-500">Trusted</span>}
                </div>
              </div>
              {row.amount != null && (
                <div className="text-right font-mono text-sm">{fmtFiat(Number(row.amount), row.currency || "USD")}</div>
              )}
            </header>
            <p className="line-clamp-3 text-xs text-muted-foreground">{row.description}</p>
            <footer className="mt-auto flex items-center justify-between pt-2 text-xs text-muted-foreground">
              <span className="truncate">by {row.profile?.display_name ?? "—"}</span>
              <Button size="sm" onClick={() => buy(row)} disabled={busy === row.id}>
                {busy === row.id ? "Creating…" : "Buy with escrow"}
              </Button>
            </footer>
          </article>
        ))}
        {items.length === 0 && (
          <div className="surface col-span-full p-10 text-center text-sm text-muted-foreground">
            No products match. Try the <Link to="/marketplace" className="text-primary underline">marketplace</Link> or the <Link to="/order-book" className="text-primary underline">order book</Link>.
          </div>
        )}
      </section>
    </div>
  );
}
