import { createFileRoute } from "@tanstack/react-router";
import { AuthGate } from "@/components/AuthGate";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getMe, generateTelegramLink } from "@/lib/escrow.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({ component: () => (<AuthGate><Settings /></AuthGate>) });

function Settings() {
  const fetchMe = useServerFn(getMe);
  const link = useServerFn(generateTelegramLink);
  const { data } = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
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
    </div>
  );
}
