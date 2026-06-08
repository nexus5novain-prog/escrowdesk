import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, ArrowLeftRight } from "lucide-react";

type Rates = Record<string, number>; // USD per 1 unit of asset
const ASSETS = ["BTC", "ETH", "USDT", "USDC"] as const;
const COINGECKO_IDS: Record<(typeof ASSETS)[number], string> = {
  BTC: "bitcoin", ETH: "ethereum", USDT: "tether", USDC: "usd-coin",
};

export function CryptoCalculator({ className = "" }: { className?: string }) {
  const [rates, setRates] = useState<Rates | null>(null);
  const [loading, setLoading] = useState(false);
  const [asset, setAsset] = useState<(typeof ASSETS)[number]>("BTC");
  const [usd, setUsd] = useState<string>("100");
  const [crypto, setCrypto] = useState<string>("");
  const [direction, setDirection] = useState<"usd" | "crypto">("usd");
  const [updated, setUpdated] = useState<number>(0);

  const fetchRates = async () => {
    setLoading(true);
    try {
      const ids = Object.values(COINGECKO_IDS).join(",");
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
      const json = await res.json();
      const next: Rates = {};
      for (const a of ASSETS) next[a] = json[COINGECKO_IDS[a]]?.usd ?? 0;
      setRates(next);
      setUpdated(Date.now());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRates();
    const id = setInterval(fetchRates, 30_000);
    return () => clearInterval(id);
  }, []);

  const price = rates?.[asset] ?? 0;

  useMemo(() => {
    if (!price) return;
    if (direction === "usd") {
      const n = parseFloat(usd);
      setCrypto(isFinite(n) ? (n / price).toFixed(8) : "");
    } else {
      const n = parseFloat(crypto);
      setUsd(isFinite(n) ? (n * price).toFixed(2) : "");
    }
  }, [usd, crypto, price, direction]);

  return (
    <div className={`surface p-5 ${className}`}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">Live rate calculator</h3>
          <p className="text-[11px] text-muted-foreground">Updated {updated ? new Date(updated).toLocaleTimeString() : "—"} · refreshes every 30s</p>
        </div>
        <Button size="icon" variant="ghost" onClick={fetchRates} disabled={loading} className="h-8 w-8">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-[10px] uppercase text-muted-foreground">USD</label>
          <Input value={usd} onChange={(e) => { setDirection("usd"); setUsd(e.target.value); }} inputMode="decimal" />
        </div>
        <button
          aria-label="swap"
          onClick={() => setDirection((d) => (d === "usd" ? "crypto" : "usd"))}
          className="mt-5 grid h-10 w-10 place-items-center rounded-md bg-primary/15 text-primary transition hover:bg-primary/25"
        >
          <ArrowLeftRight className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <label className="text-[10px] uppercase text-muted-foreground">{asset}</label>
          <Input value={crypto} onChange={(e) => { setDirection("crypto"); setCrypto(e.target.value); }} inputMode="decimal" />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {ASSETS.map((a) => (
          <button
            key={a}
            onClick={() => setAsset(a)}
            className={`rounded-md px-2.5 py-1 text-xs font-mono transition ${asset === a ? "bg-primary text-primary-foreground" : "bg-secondary/40 text-muted-foreground hover:bg-secondary/60"}`}
          >
            {a} {rates?.[a] ? `· $${rates[a].toLocaleString(undefined, { maximumFractionDigits: 2 })}` : ""}
          </button>
        ))}
      </div>
    </div>
  );
}
