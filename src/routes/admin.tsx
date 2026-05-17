import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { adminListDisputes, adminResolveDispute, adminSetFee, adminMakeMeAdmin, getMe } from "@/lib/escrow.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({ component: Admin });

function Admin() {
  const fetchMe = useServerFn(getMe);
  const { data: me, refetch: refetchMe } = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const isStaff = me?.roles.some((r) => r === "admin" || r === "moderator") ?? false;
  const promote = useServerFn(adminMakeMeAdmin);
  const listD = useServerFn(adminListDisputes);
  const resolve = useServerFn(adminResolveDispute);
  const setFee = useServerFn(adminSetFee);
  const { data: dataRaw, refetch } = useQuery({ queryKey: ["disputes"], queryFn: () => listD(), enabled: isStaff });
  const data = dataRaw as { disputes: Array<{ id: string; trade_id: string; reason: string; status: string; created_at: string }> } | undefined;
  const [fee, setFee2] = useState("100");

  if (!isStaff) {
    return (
      <div className="surface mx-auto max-w-md p-6 text-center">
        <h1 className="text-xl font-semibold">Admin</h1>
        <p className="mt-2 text-sm text-muted-foreground">You're not a staff member yet. If no admin exists, you can claim the first admin role.</p>
        <Button className="mt-4" onClick={async () => { try { await promote(); toast.success("You're admin"); refetchMe(); } catch (e) { toast.error((e as Error).message); } }}>Claim admin</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <div className="surface p-5">
        <h2 className="font-semibold">Platform fee (bps · 100 = 1%)</h2>
        <div className="mt-2 flex gap-2"><Input className="w-32 font-mono" value={fee} onChange={(e) => setFee2(e.target.value)} />
          <Button onClick={async () => { try { await setFee({ data: { fee_bps: Number(fee) } }); toast.success("Saved"); } catch (e) { toast.error((e as Error).message); } }}>Save</Button>
        </div>
      </div>
      <div className="surface p-5">
        <h2 className="font-semibold">Open disputes</h2>
        <div className="mt-3 space-y-2">
          {(data?.disputes ?? []).filter((d) => d.status === "open").map((d) => (
            <div key={d.id} className="rounded-md border border-border/60 p-3">
              <div className="text-xs text-muted-foreground">Trade {d.trade_id.slice(0,8)} · opened {new Date(d.created_at).toLocaleString()}</div>
              <p className="mt-1 text-sm">{d.reason}</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={async () => { try { await resolve({ data: { trade_id: d.trade_id, award_to: "buyer", note: "" } }); toast.success("Resolved → buyer"); refetch(); } catch (e) { toast.error((e as Error).message); } }}>Award buyer</Button>
                <Button size="sm" variant="outline" onClick={async () => { try { await resolve({ data: { trade_id: d.trade_id, award_to: "seller", note: "" } }); toast.success("Resolved → seller"); refetch(); } catch (e) { toast.error((e as Error).message); } }}>Award seller</Button>
              </div>
            </div>
          ))}
          {(data?.disputes ?? []).filter((d) => d.status === "open").length === 0 && <div className="text-sm text-muted-foreground">No open disputes.</div>}
        </div>
      </div>
    </div>
  );
}
