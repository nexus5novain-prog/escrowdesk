import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { listShopProducts, type ShopProduct } from "@/lib/shop.functions";
import { createEscrowGroup } from "@/lib/escrow-groups.functions";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { fmtFiat } from "@/lib/format";
import {
  ShoppingBag, Search, SlidersHorizontal, Tag, ArrowUpDown,
  ShieldCheck, Star, Package, ChevronRight, Sparkles,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Marketplace — EscrowDesk" },
      { name: "description", content: "Shop verified products and services from admin-curated listings. Every purchase is escrow-protected." },
      { property: "og:title", content: "EscrowDesk Marketplace" },
      { property: "og:description", content: "Admin-curated storefront with built-in escrow protection." },
    ],
  }),
  component: ShopPage,
});

const CATEGORY_COLORS: Record<string, string> = {
  Software: "from-violet-500/20 to-violet-600/10",
  Services: "from-emerald-500/20 to-emerald-600/10",
  Digital: "from-blue-500/20 to-blue-600/10",
  Accounts: "from-amber-500/20 to-amber-600/10",
  Templates: "from-pink-500/20 to-pink-600/10",
  Courses: "from-cyan-500/20 to-cyan-600/10",
  Tools: "from-orange-500/20 to-orange-600/10",
  Other: "from-slate-500/20 to-slate-600/10",
};

function categoryGradient(category: string): string {
  return CATEGORY_COLORS[category] ?? "from-primary/20 to-primary/5";
}

function ProductCard({ product, onBuy, busy }: {
  product: ShopProduct;
  onBuy: (p: ShopProduct) => void;
  busy: boolean;
}) {
  const hasImage = product.image_url && product.image_url.startsWith("http");
  const isSold = product.status === "sold";

  return (
    <article className="surface flex flex-col overflow-hidden rounded-2xl transition-all hover:ring-1 hover:ring-primary/30">
      <div className={`relative h-44 w-full bg-gradient-to-br ${categoryGradient(product.category)} flex items-center justify-center overflow-hidden`}>
        {hasImage ? (
          <img
            src={product.image_url!}
            alt={product.name}
            className="h-full w-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 opacity-40">
            <Package className="h-12 w-12" />
            <span className="text-xs font-medium uppercase tracking-widest">{product.category}</span>
          </div>
        )}
        {isSold && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <Badge variant="secondary" className="text-sm font-semibold">Out of Stock</Badge>
          </div>
        )}
        <div className="absolute left-3 top-3">
          <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">{product.category}</Badge>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <h3 className="line-clamp-1 text-base font-semibold leading-snug">{product.name}</h3>
          <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{product.description}</p>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-3 border-t border-border/40">
          <div>
            {product.amount != null ? (
              <div className="text-lg font-bold text-primary">
                {fmtFiat(Number(product.amount), product.currency || "USD")}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Price on request</div>
            )}
            {product.seller_name && (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                <ShieldCheck className="h-3 w-3 text-primary" />
                <span>by {product.seller_name}</span>
              </div>
            )}
          </div>
          <Button
            size="sm"
            onClick={() => onBuy(product)}
            disabled={busy || isSold}
            className="gap-1.5 shrink-0"
          >
            {busy ? "Creating…" : isSold ? "Sold Out" : (
              <>Buy <ChevronRight className="h-3 w-3" /></>
            )}
          </Button>
        </div>
      </div>
    </article>
  );
}

function ShopPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const fetchShop = useServerFn(listShopProducts);
  const createGroup = useServerFn(createEscrowGroup);

  const [q, setQ] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [sort, setSort] = useState<"newest" | "price_asc" | "price_desc">("newest");
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["shop-products"],
    queryFn: () => fetchShop({ data: {} }),
    refetchInterval: 30_000,
  });

  const allProducts = data?.products ?? [];

  const categories = useMemo(() => {
    const set = new Set<string>();
    allProducts.forEach((p) => set.add(p.category));
    return Array.from(set).sort();
  }, [allProducts]);

  const filtered = useMemo(() => {
    let items = [...allProducts];
    if (activeCategory !== "all") items = items.filter((p) => p.category === activeCategory);
    if (q.trim()) {
      const needle = q.toLowerCase();
      items = items.filter(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          p.description.toLowerCase().includes(needle) ||
          p.category.toLowerCase().includes(needle),
      );
    }
    if (sort === "price_asc") items.sort((a, b) => (a.amount ?? 0) - (b.amount ?? 0));
    else if (sort === "price_desc") items.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
    return items;
  }, [allProducts, activeCategory, q, sort]);

  const buy = async (product: ShopProduct) => {
    if (!user) { nav({ to: "/auth" }); return; }
    if (product.user_id === user.id) { toast.error("You own this listing"); return; }
    setBusy(product.id);
    try {
      const res = await createGroup({
        data: {
          asset: "USDT",
          amount: product.amount ?? 1,
          fiat_amount: product.amount ?? undefined,
          fiat_currency: product.currency || "USD",
          listing_id: product.id,
        },
      });
      toast.success("Escrow created — proceed to pay securely");
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
      <section className="surface overflow-hidden rounded-3xl">
        <div className="relative px-6 py-10 md:py-14">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent" />
          <div className="relative mx-auto max-w-3xl text-center">
            <div className="mb-3 flex items-center justify-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Admin-Curated Products
            </div>
            <h1 className="flex items-center justify-center gap-3 text-4xl font-bold">
              <ShoppingBag className="h-9 w-9 text-primary" />
              Marketplace
            </h1>
            <p className="mt-3 text-sm text-muted-foreground max-w-xl mx-auto">
              Browse verified products and services — every purchase is automatically escrowed. Funds release only when you confirm delivery.
            </p>
            <div className="mx-auto mt-6 flex max-w-md items-center gap-2 rounded-xl border border-border/60 bg-background/80 px-3 backdrop-blur-sm">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Input
                placeholder="Search products, services…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="border-0 bg-transparent shadow-none focus-visible:ring-0 px-0"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-border/40 px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setActiveCategory("all")}
              className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                activeCategory === "all"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border/60 hover:border-primary/50"
              }`}
            >
              <Tag className="h-3 w-3" /> All
              <span className="ml-0.5 opacity-70">({allProducts.length})</span>
            </button>
            {categories.map((c) => {
              const count = allProducts.filter((p) => p.category === c).length;
              return (
                <button
                  key={c}
                  onClick={() => setActiveCategory(c)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    activeCategory === c
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border/60 hover:border-primary/50"
                  }`}
                >
                  {c} <span className="opacity-70">({count})</span>
                </button>
              );
            })}
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <ArrowUpDown className="h-3 w-3 mr-1.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="price_asc">Price: Low → High</SelectItem>
              <SelectItem value="price_desc">Price: High → Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {isLoading ? "Loading…" : `${filtered.length} product${filtered.length !== 1 ? "s" : ""}`}
          {activeCategory !== "all" && ` in ${activeCategory}`}
        </span>
        {q && (
          <button onClick={() => setQ("")} className="text-xs text-primary hover:underline">
            Clear search
          </button>
        )}
      </div>

      {isLoading ? (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="surface h-80 animate-pulse rounded-2xl" />
          ))}
        </section>
      ) : filtered.length > 0 ? (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onBuy={buy}
              busy={busy === product.id}
            />
          ))}
        </section>
      ) : (
        <div className="surface flex flex-col items-center gap-4 rounded-2xl p-16 text-center">
          <Package className="h-12 w-12 text-muted-foreground/40" />
          <div>
            <div className="font-medium">No products found</div>
            <p className="mt-1 text-sm text-muted-foreground">
              {q ? "Try a different search term or clear the filter." : "No products have been published yet. Check back soon."}
            </p>
          </div>
          {q && (
            <Button variant="outline" size="sm" onClick={() => { setQ(""); setActiveCategory("all"); }}>
              Show all products
            </Button>
          )}
        </div>
      )}

      <section className="surface rounded-2xl p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-8">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/15">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="text-sm font-semibold">Escrow Protected</div>
              <div className="text-xs text-muted-foreground">Funds held safely until you confirm</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/15">
              <Star className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="text-sm font-semibold">Curated by Admin</div>
              <div className="text-xs text-muted-foreground">Every listing is verified and approved</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/15">
              <SlidersHorizontal className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="text-sm font-semibold">Dispute Resolution</div>
              <div className="text-xs text-muted-foreground">24/7 mediator support for all orders</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
