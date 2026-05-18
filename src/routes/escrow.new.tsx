import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AuthGate } from "@/components/AuthGate";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { createEscrowGroup } from "@/lib/escrow-groups.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Users2, Send } from "lucide-react";

export const Route = createFileRoute("/escrow/new")({
  component: () => (<AuthGate><NewEscrow /></AuthGate>),
});

function NewEscrow() {
  const nav = useNavigate();
  const create = useServerFn(createEscrowGroup);
  const [mode, setMode] = useState<"site"|"telegram">("site");
  const [asset, setAsset] = useState<"BTC"|"USDT"|"USDC"|"ETH">("BTC");
  const [amount, setAmount] = useState("");
  const [fiat, setFiat] = useState("");
  const [username, setUsername] = useState("");
  const [tg, setTg] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    if (mode === "site" && !username.trim()) return toast.error("Enter the seller's site username");
    if (mode === "telegram" && !tg.trim()) return toast.error("Enter the seller's Telegram username");
    setBusy(true);
    try {
      const res = await create({ data: {
        asset, amount: amt,
        fiat_amount: fiat ? Number(fiat) : undefined,
        fiat_currency: "USD",
        counterparty_username: mode === "site" ? username.trim() : undefined,
        counterparty_telegram: mode === "telegram" ? tg.trim() : undefined,
      } });
      toast.success("Escrow group created");
      nav({ to: "/escrow/$id", params: { id: res.id } });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Create an escrow group</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Invite a seller you want to trade with. The group holds the chat, escrow address, deposit hash,
          and a button to bring in a moderator if anything goes sideways.
        </p>
      </div>

      <div className="surface p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold"><Users2 className="h-4 w-4" /> Counterparty</div>

        <Tabs value={mode} onValueChange={(v) => setMode(v as "site"|"telegram")}>
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
              The seller must have linked their Telegram to the bot (Settings → Connect Telegram) for us to match them.
            </p>
          </TabsContent>
        </Tabs>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label className="text-xs uppercase text-muted-foreground">Asset</Label>
            <Select value={asset} onValueChange={(v) => setAsset(v as typeof asset)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="BTC">BTC</SelectItem>
                <SelectItem value="USDT">USDT (TRC20)</SelectItem>
                <SelectItem value="USDC">USDC</SelectItem>
                <SelectItem value="ETH">ETH</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs uppercase text-muted-foreground">Crypto amount</Label>
            <Input type="number" step="0.00000001" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.05" />
          </div>
          <div>
            <Label className="text-xs uppercase text-muted-foreground">Fiat value (USD, optional)</Label>
            <Input type="number" value={fiat} onChange={(e) => setFiat(e.target.value)} placeholder="3000" />
          </div>
        </div>

        <Button onClick={submit} disabled={busy} className="w-full">
          <Send className="mr-2 h-4 w-4" /> {busy ? "Creating…" : "Create group & invite seller"}
        </Button>
      </div>
    </div>
  );
}
