import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { listShopProducts, type ShopProduct, type ShopSection } from "@/lib/shop.functions";
import { createEscrowGroup } from "@/lib/escrow-groups.functions";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { fmtFiat } from "@/lib/format";
import {
  CreditCard, BookOpen, ScanLine, Store,
  ShieldCheck, Search, Package, ChevronRight,
  Bitcoin, Zap, Tag, Star, CheckCircle2, XCircle,
  ShoppingCart, ArrowRight, Layers, Lock,
} from "lucide-react";

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Marketplace — EscrowDesk" },
      { name: "description", content: "Admin-curated marketplace with escrow protection across Cards, Enrollment, Scanner tools, and General products." },
    ],
  }),
  component: ShopPage,
});

// ─── BTC rate util ───────────────────────────────────────────────────────────
function fmtBtc(rate: string | undefined, usd: number | null): string | null {
  if (rate && rate !== "0") {
    const r = parseFloat(rate);
    if (!isNaN(r) && r > 0) return `₿ ${r.toFixed(8)}`;
  }
  if (usd != null && usd > 0) {
    const approx = usd / 105000;
    return `≈ ₿ ${approx.toFixed(8)}`;
  }
  return null;
}

// ─── Mask card number ────────────────────────────────────────────────────────
function maskCard(num: string): string {
  const clean = num.replace(/\D/g, "");
  if (clean.length < 4) return num;
  const groups = clean.match(/.{1,4}/g) ?? [];
  return groups
    .map((g, i) => (i < groups.length - 1 ? "••••" : g))
    .join(" ");
}

// ─── Shared buy hook ─────────────────────────────────────────────────────────
function useBuy() {
  const { user } = useAuth();
  const nav = useNavigate();
  const createGroup = useServerFn(createEscrowGroup);
  const [busy, setBusy] = useState<string | null>(null);

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
    }
  };

  return { buy, busy };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: CARD
// ═══════════════════════════════════════════════════════════════════════════════
function CardItem({ product, onBuy, busy }: { product: ShopProduct; onBuy: (p: ShopProduct) => void; busy: boolean }) {
  const isSold = product.status === "sold";
  const card = product.card;
  const isActive = card?.card_status === "active";
  const btc = fmtBtc(card?.btc_rate, product.amount);

  return (
    <article className={`relative overflow-hidden rounded-2xl border transition-all duration-200 hover:scale-[1.01] hover:shadow-xl ${isSold ? "opacity-50 border-border/30" : "border-border/50 hover:border-primary/40"}`}
      style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #0f172a 100%)" }}>
      {/* Sheen */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none" />
      {/* Top bar */}
      <div className="relative flex items-center justify-between px-5 pt-5">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow">
            <CreditCard className="h-4 w-4 text-white" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-widest text-white/60">Credit Card</span>
        </div>
        <div className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${isActive ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-red-500/20 text-red-400 border border-red-500/30"}`}>
          {isActive ? <><CheckCircle2 className="h-3 w-3" />Active</> : <><XCircle className="h-3 w-3" />Dead</>}
        </div>
      </div>

      {/* Card name */}
      <div className="px-5 pt-3">
        <div className="text-base font-bold text-white tracking-wide">{product.name}</div>
        {card?.card_name && (
          <div className="mt-0.5 text-xs text-white/40 uppercase tracking-widest">{card.card_name}</div>
        )}
      </div>

      {/* Card number */}
      <div className="px-5 pt-4">
        <div className="font-mono text-xl tracking-[0.25em] text-white/90 select-none">
          {card?.card_number ? maskCard(card.card_number) : "•••• •••• •••• ••••"}
        </div>
      </div>

      {/* Address */}
      {card?.card_address && (
        <div className="px-5 pt-2">
          <div className="text-[11px] text-white/40 line-clamp-1">{card.card_address}</div>
        </div>
      )}

      {/* Notes */}
      {product.description && (
        <div className="px-5 pt-2">
          <div className="text-[11px] text-white/50 line-clamp-2 leading-relaxed">{product.description}</div>
        </div>
      )}

      {/* Divider */}
      <div className="mx-5 mt-4 border-t border-white/10" />

      {/* Price row */}
      <div className="flex items-center justify-between px-5 py-4">
        <div>
          <div className="text-xl font-bold text-white">
            {product.amount != null ? fmtFiat(product.amount, product.currency || "USD") : "POA"}
          </div>
          {btc && (
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-400/80 font-mono">
              <Bitcoin className="h-3 w-3" />
              {btc}
            </div>
          )}
        </div>
        <Button
          size="sm"
          disabled={busy || isSold || !isActive}
          onClick={() => onBuy(product)}
          className="gap-1.5 bg-gradient-to-r from-primary to-primary/80 hover:opacity-90 shadow-lg shadow-primary/20"
        >
          {busy ? "…" : isSold ? "Sold" : !isActive ? "Dead" : <>Buy <ChevronRight className="h-3 w-3" /></>}
        </Button>
      </div>

      {isSold && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-2xl">
          <Badge className="text-sm font-semibold px-4 py-1.5">Out of Stock</Badge>
        </div>
      )}
    </article>
  );
}

function CardSection({ products, onBuy, busy, loading }: SectionProps) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    if (!q.trim()) return products;
    const n = q.toLowerCase();
    return products.filter((p) =>
      p.name.toLowerCase().includes(n) ||
      p.card?.card_name?.toLowerCase().includes(n) ||
      p.description.toLowerCase().includes(n),
    );
  }, [products, q]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search cards…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9 h-9" />
        </div>
        <div className="text-xs text-muted-foreground">{filtered.length} card{filtered.length !== 1 ? "s" : ""}</div>
      </div>
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-64 animate-pulse rounded-2xl bg-secondary/40" />)}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <CardItem key={p.id} product={p} onBuy={onBuy} busy={busy === p.id} />
          ))}
        </div>
      ) : (
        <EmptyState message={q ? "No cards match your search." : "No cards available right now."} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: ENROLL
// ═══════════════════════════════════════════════════════════════════════════════
function EnrollCard({ product, onBuy, busy }: { product: ShopProduct; onBuy: (p: ShopProduct) => void; busy: boolean }) {
  const isSold = product.status === "sold";
  const hasImage = product.image_url && product.image_url.startsWith("http");

  return (
    <article className="surface flex flex-col overflow-hidden rounded-2xl border border-border/40 hover:border-primary/30 transition-all hover:shadow-lg group">
      {/* Image */}
      <div className="relative h-48 bg-gradient-to-br from-blue-500/15 to-indigo-600/10 overflow-hidden">
        {hasImage ? (
          <img src={product.image_url!} alt={product.name} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <div className="h-full flex items-center justify-center">
            <BookOpen className="h-14 w-14 text-blue-400/30" />
          </div>
        )}
        {isSold && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <Badge variant="secondary" className="text-sm font-semibold">Sold Out</Badge>
          </div>
        )}
        <div className="absolute top-3 left-3">
          <Badge className="text-[10px] bg-blue-500/90 text-white border-0">ENROLL</Badge>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-5 gap-3">
        <div>
          <h3 className="font-semibold text-base leading-snug line-clamp-1">{product.name}</h3>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed line-clamp-3">{product.description}</p>
        </div>

        {product.contact_telegram && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3 w-3 text-primary" />
            <span>Support: @{product.contact_telegram}</span>
          </div>
        )}

        <div className="mt-auto flex items-center justify-between pt-3 border-t border-border/30">
          <div>
            <div className="text-lg font-bold text-primary">
              {product.amount != null ? fmtFiat(product.amount, product.currency || "USD") : "Free"}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
              <Lock className="h-2.5 w-2.5" />Escrow protected
            </div>
          </div>
          <Button size="sm" disabled={busy || isSold} onClick={() => onBuy(product)} className="gap-1.5 shrink-0">
            {busy ? "Creating…" : isSold ? "Unavailable" : <>Enroll <ArrowRight className="h-3.5 w-3.5" /></>}
          </Button>
        </div>
      </div>
    </article>
  );
}

function EnrollSection({ products, onBuy, busy, loading }: SectionProps) {
  const [q, setQ] = useState("");
  const [sub, setSub] = useState("all");
  const subs = useMemo(() => Array.from(new Set(products.map((p) => p.name.split(" ")[0]))).slice(0, 8), [products]);
  const filtered = useMemo(() => {
    let r = [...products];
    if (q.trim()) { const n = q.toLowerCase(); r = r.filter((p) => p.name.toLowerCase().includes(n) || p.description.toLowerCase().includes(n)); }
    return r;
  }, [products, q, sub]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search enrollments…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9 h-9" />
        </div>
        <div className="text-xs text-muted-foreground">{filtered.length} product{filtered.length !== 1 ? "s" : ""}</div>
      </div>
      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-80 animate-pulse rounded-2xl bg-secondary/40" />)}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => <EnrollCard key={p.id} product={p} onBuy={onBuy} busy={busy === p.id} />)}
        </div>
      ) : (
        <EmptyState message={q ? "No enrollments match your search." : "No enrollment products available yet."} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: SCANNER
// ═══════════════════════════════════════════════════════════════════════════════
function ScannerCard({ product, onBuy, busy }: { product: ShopProduct; onBuy: (p: ShopProduct) => void; busy: boolean }) {
  const isSold = product.status === "sold";
  const hasImage = product.image_url && product.image_url.startsWith("http");

  return (
    <article className="surface flex gap-4 rounded-xl border border-border/40 hover:border-emerald-500/30 transition-all p-4 hover:shadow-md group">
      {/* Thumbnail */}
      <div className="h-20 w-20 shrink-0 rounded-lg bg-gradient-to-br from-emerald-500/15 to-teal-600/10 border border-border/30 overflow-hidden flex items-center justify-center">
        {hasImage ? (
          <img src={product.image_url!} alt={product.name} className="h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <ScanLine className="h-8 w-8 text-emerald-400/40" />
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col min-w-0 gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm leading-snug line-clamp-1">{product.name}</h3>
          <Badge className="text-[10px] bg-emerald-500/15 text-emerald-400 border-emerald-500/20 shrink-0">SCANNER</Badge>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{product.description}</p>

        <div className="flex items-center justify-between mt-auto pt-1">
          <div className="font-bold text-base text-foreground">
            {product.amount != null ? fmtFiat(product.amount, product.currency || "USD") : "Free"}
          </div>
          <Button size="sm" variant="outline" disabled={busy || isSold} onClick={() => onBuy(product)}
            className="h-7 text-xs gap-1 border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-400">
            {busy ? "…" : isSold ? "Sold" : <><ShoppingCart className="h-3 w-3" />Buy</>}
          </Button>
        </div>
      </div>
    </article>
  );
}

function ScannerSection({ products, onBuy, busy, loading }: SectionProps) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    if (!q.trim()) return products;
    const n = q.toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(n) || p.description.toLowerCase().includes(n));
  }, [products, q]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search scanners…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9 h-9" />
        </div>
        <div className="text-xs text-muted-foreground">{filtered.length} tool{filtered.length !== 1 ? "s" : ""}</div>
      </div>
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-secondary/40" />)}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((p) => <ScannerCard key={p.id} product={p} onBuy={onBuy} busy={busy === p.id} />)}
        </div>
      ) : (
        <EmptyState message={q ? "No scanner tools match your search." : "No scanner tools available yet."} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: GENERAL
// ═══════════════════════════════════════════════════════════════════════════════
function GeneralCard({ product, onBuy, busy }: { product: ShopProduct; onBuy: (p: ShopProduct) => void; busy: boolean }) {
  const isSold = product.status === "sold";
  const hasImage = product.image_url && product.image_url.startsWith("http");

  return (
    <article className="surface group relative overflow-hidden rounded-2xl border border-border/40 hover:border-primary/30 transition-all hover:shadow-md flex flex-col">
      {/* Image / Banner */}
      <div className="relative h-40 bg-gradient-to-br from-primary/10 to-primary/5 overflow-hidden">
        {hasImage ? (
          <img src={product.image_url!} alt={product.name} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <div className="h-full flex items-center justify-center">
            <Store className="h-12 w-12 text-primary/20" />
          </div>
        )}
        {isSold && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <Badge variant="secondary" className="font-semibold">Out of Stock</Badge>
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background/80 to-transparent" />
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4 gap-2.5">
        <div>
          <h3 className="font-semibold text-sm line-clamp-1">{product.name}</h3>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-2">{product.description}</p>
        </div>

        <div className="flex items-center justify-between mt-auto pt-2 border-t border-border/30">
          <div>
            <div className="font-bold text-primary">
              {product.amount != null ? fmtFiat(product.amount, product.currency || "USD") : "Free"}
            </div>
          </div>
          <Button size="sm" disabled={busy || isSold} onClick={() => onBuy(product)} className="h-7 text-xs gap-1">
            {busy ? "…" : isSold ? "Sold Out" : <><ShoppingCart className="h-3 w-3" />Add to cart</>}
          </Button>
        </div>
      </div>
    </article>
  );
}

function GeneralSection({ products, onBuy, busy, loading }: SectionProps) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"newest" | "price_asc" | "price_desc">("newest");
  const filtered = useMemo(() => {
    let r = [...products];
    if (q.trim()) { const n = q.toLowerCase(); r = r.filter((p) => p.name.toLowerCase().includes(n) || p.description.toLowerCase().includes(n)); }
    if (sort === "price_asc") r.sort((a, b) => (a.amount ?? 0) - (b.amount ?? 0));
    else if (sort === "price_desc") r.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
    return r;
  }, [products, q, sort]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9 h-9" />
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          {(["newest", "price_asc", "price_desc"] as const).map((s) => (
            <button key={s} onClick={() => setSort(s)}
              className={`rounded-full border px-3 py-1 transition-colors ${sort === s ? "border-primary bg-primary text-primary-foreground" : "border-border/60 hover:border-primary/50"}`}>
              {s === "newest" ? "Newest" : s === "price_asc" ? "Price ↑" : "Price ↓"}
            </button>
          ))}
        </div>
        <div className="text-xs text-muted-foreground">{filtered.length} item{filtered.length !== 1 ? "s" : ""}</div>
      </div>
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-64 animate-pulse rounded-2xl bg-secondary/40" />)}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => <GeneralCard key={p.id} product={p} onBuy={onBuy} busy={busy === p.id} />)}
        </div>
      ) : (
        <EmptyState message={q ? "No products match your search." : "No general products available yet."} />
      )}
    </div>
  );
}

// ─── Shared empty state ───────────────────────────────────────────────────────
function EmptyState({ message }: { message: string }) {
  return (
    <div className="surface flex flex-col items-center gap-4 rounded-2xl p-16 text-center border border-border/30">
      <Package className="h-12 w-12 text-muted-foreground/30" />
      <div className="text-sm text-muted-foreground">{message}</div>
    </div>
  );
}

type SectionProps = {
  products: ShopProduct[];
  onBuy: (p: ShopProduct) => void;
  busy: string | null;
  loading: boolean;
};

// ─── Tab config ───────────────────────────────────────────────────────────────
const TABS: { id: ShopSection; label: string; icon: React.ElementType; desc: string; accent: string }[] = [
  { id: "CARD", label: "Card", icon: CreditCard, desc: "Verified payment cards with escrow protection", accent: "from-amber-500/20 to-amber-600/10" },
  { id: "ENROLL", label: "Enroll", icon: BookOpen, desc: "Professional enrollment services and access", accent: "from-blue-500/20 to-blue-600/10" },
  { id: "SCANNER", label: "Scanner", icon: ScanLine, desc: "Advanced scanning tools and utilities", accent: "from-emerald-500/20 to-emerald-600/10" },
  { id: "GENERAL", label: "General", icon: Store, desc: "General merchandise and digital products", accent: "from-primary/20 to-primary/10" },
];

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
function ShopPage() {
  const [activeTab, setActiveTab] = useState<ShopSection>("CARD");
  const { buy, busy } = useBuy();
  const fetchShop = useServerFn(listShopProducts);

  const { data, isLoading } = useQuery({
    queryKey: ["shop-products", activeTab],
    queryFn: () => fetchShop({ data: { section: activeTab } }),
    refetchInterval: 30_000,
  });

  const products = data?.products ?? [];
  const tab = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="surface overflow-hidden rounded-3xl relative">
        <div className={`absolute inset-0 bg-gradient-to-br ${tab.accent} transition-all duration-500`} />
        <div className="relative px-6 py-10 md:py-12">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-2 flex items-center justify-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              Admin-Curated Marketplace
            </div>
            <h1 className="text-4xl font-bold tracking-tight">Marketplace</h1>
            <p className="mt-2 text-sm text-muted-foreground max-w-lg mx-auto">
              Every purchase is escrow-protected. Funds release only when you confirm delivery.
            </p>
          </div>
        </div>

        {/* Category tabs */}
        <div className="relative border-t border-border/40 px-6 py-3">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all shrink-0 ${
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                      : "border-border/50 hover:border-primary/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Active section header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          {(() => { const Icon = tab.icon; return <Icon className="h-5 w-5 text-primary" />; })()}
          <h2 className="font-semibold text-lg">{tab.label}</h2>
        </div>
        <div className="text-sm text-muted-foreground">{tab.desc}</div>
      </div>

      {/* Section content */}
      {activeTab === "CARD" && <CardSection products={products} onBuy={buy} busy={busy} loading={isLoading} />}
      {activeTab === "ENROLL" && <EnrollSection products={products} onBuy={buy} busy={busy} loading={isLoading} />}
      {activeTab === "SCANNER" && <ScannerSection products={products} onBuy={buy} busy={busy} loading={isLoading} />}
      {activeTab === "GENERAL" && <GeneralSection products={products} onBuy={buy} busy={busy} loading={isLoading} />}

      {/* Trust footer */}
      <section className="surface rounded-2xl p-5 border border-border/30">
        <div className="flex flex-wrap items-center gap-6 justify-center md:justify-start">
          {[
            { icon: ShieldCheck, title: "Escrow Protected", desc: "Funds held until you confirm delivery" },
            { icon: Star, title: "Admin Curated", desc: "Every listing verified and approved" },
            { icon: Zap, title: "Instant Escrow", desc: "One-click secure checkout flow" },
            { icon: Layers, title: "Multi-Category", desc: "Cards, Enrollments, Scanners & More" },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-center gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="text-xs font-semibold">{title}</div>
                <div className="text-[11px] text-muted-foreground">{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
