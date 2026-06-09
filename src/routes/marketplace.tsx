import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { listProducts, buyProduct } from "@/lib/products.functions";
import { AdBanner } from "@/components/AdBanner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtFiat } from "@/lib/format";
import { toast } from "sonner";
import { Search, ShoppingBag, ShieldCheck, Sparkles, Loader2, Star } from "lucide-react";

export const Route = createFileRoute("/marketplace")({
  head: () => ({
    meta: [
      { title: "Marketplace — EscrowDesk E-commerce" },
      { name: "description", content: "Browse curated products from the EscrowDesk e-commerce marketplace. Buy securely with built-in escrow." },
    ],
  }),
  component: MarketplacePage,
});

type Product = {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  currency: string;
  image_url: string | null;
  stock: number;
  status: string;
  is_featured: boolean;
  seller_wallet_asset: string | null;
  created_at: string;
};

function MarketplacePage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const fetchFn = useServerFn(listProducts);
  const buyFn = useServerFn(buyProduct);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["products", q, category],
    queryFn: () => fetchFn({ data: { q: q || undefined, category: category || undefined } }),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const ch = supabase
      .channel("products-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "marketplace_products" },
        () => qc.invalidateQueries({ queryKey: ["products"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const products = (data?.products ?? []) as Product[];
  const featured = products.filter((p) => p.is_featured);
  const regular = products.filter((p) => !p.is_featured);
  const categories = Array.from(new Set(products.map((p) => p.category))).slice(0, 12);

  const buy = async (p: Product) => {
    if (!user) return nav({ to: "/auth" });
    setBusyId(p.id);
    try {
      const r = await buyFn({ data: { id: p.id } });
      toast.success("Escrow group opened");
      nav({ to: "/escrow/$id", params: { id: r.id } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6 md:space-y-8">
      <section className="surface relative overflow-hidden p-5 sm:p-6 md:p-10">
        <div className="absolute inset-0 -z-10 opacity-30" style={{ background: "radial-gradient(circle at 30% 30%, color-mix(in oklab, var(--primary) 35%, transparent), transparent 60%)" }} />
        <div className="relative space-y-4">
          <Badge variant="outline" className="font-mono text-[11px]"><ShoppingBag className="mr-1 h-3 w-3" /> Curated marketplace</Badge>
          <h1 className="text-2xl font-semibold leading-tight sm:text-3xl md:text-4xl">
            Shop verified products, <span className="text-primary">paid through escrow.</span>
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
            Every product in this marketplace is curated by the EscrowDesk team. Every purchase
            opens an escrow group automatically — your funds aren't released until the order is delivered.
          </p>
        </div>
      </section>

      <AdBanner placement="marketplace_grid" variant="banner" className="block" />

      {/* Filters */}
      <section className="surface p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" className="pl-9" />
          </div>
          <Badge variant="secondary" className="font-mono">{products.length} products</Badge>
        </div>
        {categories.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button onClick={() => setCategory(null)} className={`rounded-full border px-3 py-1 text-[11px] transition-colors ${!category ? "border-primary bg-primary/15 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground"}`}>All</button>
            {categories.map((c) => (
              <button key={c} onClick={() => setCategory(c)} className={`rounded-full border px-3 py-1 text-[11px] transition-colors ${category === c ? "border-primary bg-primary/15 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground"}`}>{c}</button>
            ))}
          </div>
        )}
      </section>

      {featured.length > 0 && (
        <section>
          <SectionHeader icon={<Sparkles className="h-4 w-4" />} title="Featured" />
          <Grid products={featured} onBuy={buy} busyId={busyId} />
        </section>
      )}

      <section>
        <SectionHeader icon={<ShieldCheck className="h-4 w-4" />} title="All products" />
        {isLoading ? (
          <p className="surface p-10 text-center text-sm text-muted-foreground">Loading marketplace…</p>
        ) : regular.length === 0 && featured.length === 0 ? (
          <p className="surface p-10 text-center text-sm text-muted-foreground">
            No products yet. Admins can add products from the Admin → Products panel.
          </p>
        ) : (
          <Grid products={regular} onBuy={buy} busyId={busyId} />
        )}
      </section>
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <div className="grid h-7 w-7 place-items-center rounded-md bg-primary/15 text-primary">{icon}</div>
      <h2 className="text-base font-semibold sm:text-lg">{title}</h2>
    </div>
  );
}

function Grid({ products, onBuy, busyId }: { products: Product[]; onBuy: (p: Product) => void; busyId: string | null }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((p) => <Card key={p.id} p={p} onBuy={onBuy} busy={busyId === p.id} />)}
    </div>
  );
}

function Card({ p, onBuy, busy }: { p: Product; onBuy: (p: Product) => void; busy: boolean }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
      className="surface group flex flex-col overflow-hidden"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-secondary/40">
        {p.image_url ? (
          <img src={p.image_url} alt={p.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
        ) : (
          <div className="grid h-full w-full place-items-center text-muted-foreground">
            <ShoppingBag className="h-8 w-8" />
          </div>
        )}
        {p.is_featured && (
          <Badge className="absolute left-2 top-2 gap-1"><Star className="h-3 w-3" /> Featured</Badge>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-sm font-semibold">{p.name}</h3>
          <span className="whitespace-nowrap font-mono text-sm text-primary">{fmtFiat(Number(p.price), p.currency)}</span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="text-[10px]">{p.category}</Badge>
          {p.stock >= 0 && p.stock < 10 && (
            <Badge variant="secondary" className="text-[10px]">{p.stock} left</Badge>
          )}
        </div>
        <Button size="sm" className="mt-3" onClick={() => onBuy(p)} disabled={busy}>
          {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
          Buy via escrow
        </Button>
      </div>
    </motion.article>
  );
}
