import { createFileRoute } from "@tanstack/react-router";
import { AuthGate } from "@/components/AuthGate";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { getMe, generateTelegramLink, updateMyProfile } from "@/lib/escrow.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Camera, Loader2, User } from "lucide-react";

export const Route = createFileRoute("/settings")({ component: () => (<AuthGate><Settings /></AuthGate>) });

function Settings() {
  const { user } = useAuth();
  const fetchMe = useServerFn(getMe);
  const link = useServerFn(generateTelegramLink);
  const saveProfile = useServerFn(updateMyProfile);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const [tg, setTg] = useState<{ code: string; deep_link: string | null } | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (data?.profile) {
      setDisplayName(data.profile.display_name ?? "");
      setBio(data.profile.bio ?? "");
      setAvatarUrl(data.profile.avatar_url ?? null);
    }
  }, [data?.profile]);

  const onPickFile = () => fileRef.current?.click();

  const onUpload = async (file: File) => {
    if (!user) return;
    if (file.size > 4 * 1024 * 1024) { toast.error("Max 4MB"); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      setAvatarUrl(pub.publicUrl);
      await saveProfile({ data: { avatar_url: pub.publicUrl } });
      qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Avatar updated");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const onSave = async () => {
    setSaving(true);
    try {
      await saveProfile({ data: { display_name: displayName, bio } });
      qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Profile saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <div className="surface p-5">
        <h2 className="font-semibold">Profile</h2>
        <p className="text-xs text-muted-foreground">Your display name, bio and avatar appear next to every listing and trade.</p>

        <div className="mt-4 flex flex-col gap-5 sm:flex-row">
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={onPickFile}
              className="group relative h-24 w-24 overflow-hidden rounded-full border border-border/60 bg-secondary/30"
              aria-label="Change avatar"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center text-muted-foreground"><User className="h-8 w-8" /></div>
              )}
              <span className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 transition group-hover:opacity-100">
                {uploading ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <Camera className="h-5 w-5 text-white" />}
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; }}
            />
            <Button size="sm" variant="ghost" onClick={onPickFile} disabled={uploading} className="text-[11px]">
              {uploading ? "Uploading…" : "Change"}
            </Button>
          </div>

          <div className="flex-1 space-y-3">
            <div>
              <label className="text-[11px] uppercase text-muted-foreground">Display name</label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} />
            </div>
            <div>
              <label className="text-[11px] uppercase text-muted-foreground">Bio</label>
              <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={500} placeholder="Tell other traders about yourself…" />
            </div>
            <Button onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save profile"}</Button>
          </div>
        </div>
      </div>

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
