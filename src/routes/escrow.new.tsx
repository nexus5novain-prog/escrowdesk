import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AuthGate } from "@/components/AuthGate";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { createEscrowGroup } from "@/lib/escrow-groups.functions";
import { getMe } from "@/lib/escrow.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Users2, Send, Bitcoin, DollarSign, User as UserIcon, AtSign, ShieldCheck, AlertTriangle } from "lucide-react";

const ASSETS = ["BTC", "USDT", "USDC", "ETH"] as const;
type Asset = typeof ASSETS[number];

const ASSET_ICONS: Record<Asset, string> = {
  BTC: "₿",
  USDT: "₮",
  USDC: "◎",
  ETH: "Ξ",
};

export const Route = createFileRoute("/escrow/new")({
  validateSearch: z.object({ listing: z.string().uuid().optional() }),
  component: () => (<AuthGate><NewEscrow /></AuthGate>),
});

function NewEscrow() {
  const nav = useNavigate();
  const { listing } = Route.useSearch();
  const create = useServerFn(createEscrowGroup);
  const [mode, setMode] = useState<"site" | "telegram">("site");
  const [asset, setAsset] = useState<Asset>("BTC");
  const [amount, setAmount] = useState("");
  const [fiat, setFiat] = useState("");
  const [username, setUsername] = useState("");
  const [tg, setTg] = useState("");
  const [busy, setBusy] = useState(false);
  const [listingMeta, setListingMeta] = useState<{ name: string; seller: string | null } | null>(null);

  useEffect(() => {
    if (!listing) return;
    (async () => {
      const { data: l } = await supabase.from("listings").select("name, amount, currency, user_id").eq("id", listing).maybeSingle();
      if (!l) return;
      const { data: p } = await supabase.from("profiles").select("display_name").eq("user_id", l.user_id).maybeSingle();
      setListingMeta({ name: l.name, seller: p?.display_name ?? null });
      if (l.amount != null) {
        setFiat(String(l.amount));
        const approxBtc = (l.amount / 105000).toFixed(8);
        setAmount(approxBtc);
      }
      if (p?.display_name) setUsername(p.display_name);
    })();
  }, [listing]);

  const submit = async () => {
    const amt = Number(amount);
    if (!listing && (!amt || amt <= 0)) return toast.error("Enter a valid crypto amount");
    if (!listing && mode === "site" && !username.trim()) return toast.error("Enter the seller's site username");
    if (!listing && mode === "telegram" && !tg.trim()) return toast.error("Enter the seller's Telegram username");

    const finalAmt = amt > 0 ? amt : fiat ? Number(fiat) / 105000 : 0.000001;
    if (finalAmt <= 0) return toast.error("Amount must be greater than zero");

    setBusy(true);
    try {
      const res = await create({
        data: {
          asset: listing ? "USDT" : asset,
          amount: finalAmt,
          fiat_amount: fiat ? Number(fiat) : undefined,
          fiat_currency: "USD",
          listing_id: listing,
          counterparty_username: !listing && mode === "site" ? username.trim() : undefined,
          counterparty_telegram: !listing && mode === "telegram" ? tg.trim() : undefined,
        },
      });
      toast.success("Escrow group created");
      nav({ to: "/escrow/$id", params: { id: res.id } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Create an escrow group</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {listingMeta
            ? <>Trading on listing <b>{listingMeta.name}</b>{listingMeta.seller ? <> with seller <b>{listingMeta.seller}</b></> : null}. Confirm amount and create the group.</>
            : <>Invite a seller to trade with. The group holds chat, escrow address, deposit hash, and a button to bring in a moderator if needed.</>}
        </p>
      </div>

      <div className="surface p-6 space-y-5">
        {!listing && (
          <>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Users2 className="h-4 w-4" /> Counterparty
            </div>

            <Tabs value={mode} onValueChange={(v) => setMode(v as "site" | "telegram")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="site">Site username</TabsTrigger>
                <TabsTrigger value="telegram">Telegram username</TabsTrigger>
              </TabsList>
              <TabsContent value="site" className="mt-3">
                <Label className="text-xs uppercase text-muted-foreground">Their site username</Label>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. johndoe" />
              </TabsContent>
              <TabsContent value="telegram" className="mt-3">
                <Label className="text-xs uppercase text-muted-foreground">Their Telegram @username</Label>
                <Input value={tg} onChange={(e) => setTg(e.target.value)} placeholder="@johndoe" />
                <p className="mt-2 text-[11px] text-muted-foreground">
                  The seller must have linked their Telegram to the bot (Settings → Connect Telegram).
                </p>
              </TabsContent>
            </Tabs>
          </>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          {!listing && (
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Asset</Label>
              <Select value={asset} onValueChange={(v) => setAsset(v as Asset)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSETS.map((a) => (
                    <SelectItem key={a} value={a}>
                      <span className="font-mono">{ASSET_ICONS[a]}</span> {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className={listing ? "sm:col-span-2" : ""}>
            <Label className="text-xs uppercase text-muted-foreground flex items-center gap-1">
              <Bitcoin className="h-3 w-3" />
              {listing ? "Approx. BTC amount (auto)" : "Crypto amount"}
            </Label>
            <Input
              type="number"
              step="0.00000001"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={listing ? "Auto-computed from price" : "0.05"}
            />
            {listing && <p className="mt-1 text-[11px] text-muted-foreground">Auto-filled from listing price. Adjust if needed.</p>}
          </div>

          <div>
            <Label className="text-xs uppercase text-muted-foreground flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              Fiat value (USD)
            </Label>
            <Input
              type="number"
              value={fiat}
              onChange={(e) => setFiat(e.target.value)}
              placeholder={listing ? "From listing" : "3000 (optional)"}
              readOnly={!!listing}
            />
          </div>
        </div>

        {listing && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
            <p className="text-primary/80">
              Fiat amount is set from the listing price. The crypto amount is an approximation based on current BTC rate (~$105,000).
              You can adjust the crypto amount if needed.
            </p>
          </div>
        )}

        <Button onClick={submit} disabled={busy} className="w-full">
          <Send className="mr-2 h-4 w-4" />
          {busy ? "Creating…" : listing ? "Create escrow group" : "Create group & invite seller"}
        </Button>
      </div>
    </div>
  );
}
