import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getMe, upsertPaymentMethod, deletePaymentMethod, generateTelegramLink } from "@/lib/escrow.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({ component: Settings });

function Settings() {
  const fetchMe = useServerFn(getMe);
  const up = useServerFn(upsertPaymentMethod);
  const del = useServerFn(deletePaymentMethod);
  const link = useServerFn(generateTelegramLink);
  const { data, refetch } = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const [pm, setPm] = useState({ label: "", method_type: "bank", details: "" });
  const [tg, setTg] = useState<{ code: string; deep_link: string | null } | null>(null);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <div className="surface p-5">
        <h2 className="font-semibold">Telegram</h2>
        <p className="text-xs text-muted-foreground">Link your Telegram account to receive trade alerts and control trades from the bot.</p>
        {data?.profile?.telegram_user_id ? (
          <div className="mt-3 rounded-md border border-primary/40 bg-primary/10 p-3 text-sm">✅ Linked as @{data.profile.telegram_username ?? "unknown"}</div>
        ) : (
          <div className="mt-3 space-y-2">
            <Button onClick={async () => { try { setTg(await link()); } catch (e) { toast.error((e as Error).message); } }}>Generate link code</Button>
            {tg && (
              <div className="rounded-md border border-border/60 bg-secondary/30 p-3 text-sm">
                {tg.deep_link
                  ? <>Open <a href={tg.deep_link} className="text-primary underline" target="_blank" rel="noreferrer">{tg.deep_link}</a> in Telegram, or send <code className="font-mono">/link {tg.code}</code> to the bot.</>
                  : <>Send <code className="font-mono">/link {tg.code}</code> to your bot in Telegram. Code expires in 10 minutes.</>}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="surface p-5">
        <h2 className="font-semibold">Payment methods</h2>
        <div className="mt-3 grid gap-2">
          {(data?.payment_methods ?? []).map((p) => (
            <div key={p.id} className="flex items-start justify-between rounded-md border border-border/60 p-3">
              <div>
                <div className="text-sm font-semibold">{p.label} <span className="text-xs text-muted-foreground">· {p.method_type}</span></div>
                <pre className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{p.details}</pre>
              </div>
              <Button size="sm" variant="ghost" onClick={async () => { await del({ data: { id: p.id } }); refetch(); }}>Remove</Button>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div><Label>Label</Label><Input value={pm.label} onChange={(e) => setPm({...pm, label: e.target.value})} placeholder="Chase Bank" /></div>
          <div><Label>Type</Label><Input value={pm.method_type} onChange={(e) => setPm({...pm, method_type: e.target.value})} placeholder="bank / wise / paypal" /></div>
          <div className="sm:col-span-3"><Label>Details</Label><Textarea value={pm.details} onChange={(e) => setPm({...pm, details: e.target.value})} placeholder="Account # / IBAN / email…" /></div>
        </div>
        <Button className="mt-3" onClick={async () => { try { await up({ data: { ...pm, is_active: true } }); setPm({ label: "", method_type: "bank", details: "" }); refetch(); toast.success("Saved"); } catch (e) { toast.error((e as Error).message); } }}>Add method</Button>
      </div>
    </div>
  );
}
