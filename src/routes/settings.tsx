import { createFileRoute } from "@tanstack/react-router";
import { AuthGate } from "@/components/AuthGate";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { getMe, generateTelegramLink, updateMyProfile, getBadgeProgress } from "@/lib/escrow.functions";
import { getFullProfileStats, autoGrantBadges, requestPremium } from "@/lib/trades.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Camera, Loader2, User, Star, ShieldCheck, Crown,
  TrendingUp, Award, Zap, CheckCircle2, Clock, Copy,
  DollarSign, BadgeCheck,
} from "lucide-react";

export const Route = createFileRoute("/settings")({ component: () => (<AuthGate><Settings /></AuthGate>) });

function StarRating({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i < Math.round(value) ? "text-amber-400 fill-amber-400" : "text-muted-foreground/30"}`}
        />
      ))}
      <span className="ml-1.5 text-sm font-semibold">{value > 0 ? value.toFixed(1) : "—"}</span>
    </div>
  );
}

function BadgeDisplay({ label, description, active, icon: Icon, color }: {
  label: string; description: string; active: boolean;
  icon: React.ComponentType<{ className?: string }>; color: string;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border p-4 transition-all ${active ? `border-${color}-500/40 bg-${color}-500/10` : "border-border/30 bg-secondary/20 opacity-50"}`}>
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${active ? `bg-${color}-500/20 text-${color}-400` : "bg-secondary/40 text-muted-foreground"}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className={`flex items-center gap-1.5 font-semibold text-sm ${active ? "" : "text-muted-foreground"}`}>
          {label}
          {active && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
      </div>
      {!active && (
        <div className="ml-auto">
          <Badge variant="outline" className="text-[10px]">Locked</Badge>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon }: {
  label: string; value: string | number; sub?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="surface rounded-xl p-4 flex items-center gap-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <div className="text-xl font-bold leading-none">{value}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
        {sub && <div className="text-[10px] text-muted-foreground/70">{sub}</div>}
      </div>
    </div>
  );
}

function Settings() {
  const { user } = useAuth();
  const fetchMe = useServerFn(getMe);
  const fetchStats = useServerFn(getFullProfileStats);
  const fetchBadges = useServerFn(getBadgeProgress);
  const link = useServerFn(generateTelegramLink);
  const saveProfile = useServerFn(updateMyProfile);
  const grantBadges = useServerFn(autoGrantBadges);
  const reqPremium = useServerFn(requestPremium);
  const qc = useQueryClient();

  const { data } = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const { data: stats } = useQuery({ queryKey: ["profile-stats"], queryFn: () => fetchStats(), enabled: !!user, staleTime: 30_000 });
  const { data: badges } = useQuery({ queryKey: ["badge-progress"], queryFn: () => fetchBadges(), enabled: !!user, staleTime: 30_000 });

  const [tg, setTg] = useState<{ code: string; deep_link: string | null } | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [checkingBadges, setCheckingBadges] = useState(false);
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

  const onCheckBadges = async () => {
    setCheckingBadges(true);
    try {
      const res = await grantBadges();
      if (res.granted.length > 0) {
        toast.success(`Badges granted: ${res.granted.join(", ")}`);
        qc.invalidateQueries({ queryKey: ["profile-stats"] });
        qc.invalidateQueries({ queryKey: ["badge-progress"] });
      } else {
        toast.info(`No new badges. ${res.trades_completed} trades, ${res.distinct_4plus} unique 4-star raters (need 5 trades + 3 raters).`);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCheckingBadges(false);
    }
  };

  const onRequestPremium = async () => {
    try {
      const res = await reqPremium();
      toast.info(res.note);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const isTrusted = stats?.is_trusted ?? badges?.is_trusted ?? false;
  const isPremium = stats?.is_premium ?? badges?.is_premium ?? false;
  const isAdmin = stats?.is_admin ?? false;
  const tradesCompleted = stats?.trades_completed ?? badges?.trades_completed ?? 0;
  const avgRating = stats?.avg_rating ?? 0;
  const fiveStars = stats?.five_star_count ?? badges?.five_star_count ?? 0;
  const totalRatings = stats?.total_ratings ?? 0;
  const btcVol = Number(data?.profile?.btc_volume_usd ?? 0);

  const premiumExpiresAt = (data?.profile as Record<string, unknown> | null)?.premium_expires_at as string | null;
  const premiumActive = isPremium && (!premiumExpiresAt || new Date(premiumExpiresAt) > new Date());

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      {/* ── Profile overview ── */}
      <div className="surface rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Profile</h2>
          <div className="flex items-center gap-1.5">
            {isAdmin && <Badge className="text-[10px] bg-red-500/15 text-red-400 border-red-500/20">Admin</Badge>}
            {premiumActive && <Badge className="text-[10px] bg-amber-500/15 text-amber-400 border-amber-500/20"><Crown className="h-3 w-3 mr-1" />Premium</Badge>}
            {isTrusted && <Badge className="text-[10px] bg-emerald-500/15 text-emerald-400 border-emerald-500/20"><BadgeCheck className="h-3 w-3 mr-1" />Trusted</Badge>}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Your display name, bio and avatar appear next to every listing and trade.</p>

        <div className="flex flex-col gap-5 sm:flex-row">
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

        {/* Email display */}
        {user?.email && (
          <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-secondary/20 px-3 py-2 text-sm">
            <span className="text-muted-foreground text-xs uppercase tracking-wider w-12">Email</span>
            <span className="font-mono text-xs">{user.email}</span>
            <button onClick={() => { navigator.clipboard.writeText(user.email!); toast.success("Copied"); }}
              className="ml-auto text-muted-foreground hover:text-foreground transition-colors">
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* ── Stats ── */}
      <div className="surface rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Trading Stats
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Trades done" value={tradesCompleted} icon={CheckCircle2} />
          <StatCard label="5-star reviews" value={fiveStars} sub={totalRatings > 0 ? `of ${totalRatings} total` : undefined} icon={Star} />
          <StatCard label="Avg rating" value={avgRating > 0 ? avgRating.toFixed(1) : "—"} icon={Award} />
          <StatCard label="Volume (USD)" value={btcVol > 0 ? `$${btcVol.toLocaleString()}` : "$0"} icon={DollarSign} />
        </div>
        {avgRating > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Overall rating:</span>
            <StarRating value={avgRating} />
          </div>
        )}
      </div>

      {/* ── Badges ── */}
      <div className="surface rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <Award className="h-4 w-4 text-primary" />
            Badges &amp; Reputation
          </h2>
          <Button size="sm" variant="outline" disabled={checkingBadges} onClick={onCheckBadges} className="text-xs gap-1">
            {checkingBadges ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
            Check eligibility
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <BadgeDisplay
            label="Trusted Trader"
            description="Earned by completing 5+ trades with 3+ unique 4-star raters. Manually revocable by staff."
            active={isTrusted}
            icon={BadgeCheck}
            color="emerald"
          />
          <BadgeDisplay
            label="Premium Member"
            description="3-month premium membership ($50). Priority support, premium badge, and exclusive listings."
            active={premiumActive}
            icon={Crown}
            color="amber"
          />
          <BadgeDisplay
            label="5-Star Streak"
            description="5 consecutive 5-star ratings. Awarded automatically."
            active={fiveStars >= 5}
            icon={Star}
            color="yellow"
          />
          <BadgeDisplay
            label="Volume Trader"
            description="Completed over $10,000 in total trading volume."
            active={btcVol >= 10000}
            icon={TrendingUp}
            color="blue"
          />
        </div>
        <div className="rounded-xl border border-border/30 bg-secondary/20 p-3 text-xs text-muted-foreground">
          Progress toward Trusted: <b>{tradesCompleted}/5</b> trades · <b>{badges?.distinct_4plus_raters ?? 0}/3</b> unique 4-star raters
        </div>
      </div>

      {/* ── Premium membership ── */}
      {!premiumActive && (
        <div className="surface rounded-2xl border border-amber-500/20 p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500/15">
              <Crown className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h2 className="font-semibold">Upgrade to Premium</h2>
              <p className="text-xs text-muted-foreground">3-month access for $50. Includes priority support &amp; premium badge.</p>
            </div>
            <div className="ml-auto text-right">
              <div className="text-2xl font-bold text-amber-400">$50</div>
              <div className="text-[11px] text-muted-foreground">per 3 months</div>
            </div>
          </div>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {[
              "Premium badge on your profile",
              "Priority dispute resolution",
              "Access to premium-only listings",
              "Higher trade limits",
              "Dedicated support channel",
            ].map((f) => (
              <li key={f} className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
          <Button onClick={onRequestPremium} className="gap-1.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold">
            <Crown className="h-4 w-4" />
            Request Premium — $50
          </Button>
          <p className="text-[11px] text-muted-foreground">
            After requesting, send $50 USDT to the admin wallet. An admin will verify and activate within 24h.
          </p>
        </div>
      )}

      {premiumActive && (
        <div className="surface rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-2">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-400" />
            <h2 className="font-semibold text-amber-400">Premium Active</h2>
          </div>
          {premiumExpiresAt && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              Expires: {new Date(premiumExpiresAt).toLocaleDateString()}
            </div>
          )}
          <p className="text-xs text-muted-foreground">You have full premium access. Contact support to renew before expiry.</p>
        </div>
      )}

      {/* ── Telegram ── */}
      <div className="surface rounded-2xl p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Telegram
        </h2>
        <p className="text-xs text-muted-foreground">Link your Telegram account to receive trade alerts and control trades from the bot.</p>
        {data?.profile?.telegram_user_id ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            Linked as <b>@{data.profile.telegram_username ?? "unknown"}</b>
          </div>
        ) : (
          <div className="space-y-2">
            <Button onClick={async () => { try { setTg(await link()); } catch (e) { toast.error((e as Error).message); } }}>Generate link code</Button>
            {tg && (
              <div className="rounded-xl border border-border/60 bg-secondary/30 p-3 text-sm">
                {tg.deep_link
                  ? <>Open <a href={tg.deep_link} className="text-primary underline" target="_blank" rel="noreferrer">{tg.deep_link}</a> in Telegram, or send <code className="font-mono bg-secondary/50 px-1 rounded">/link {tg.code}</code> to the bot.</>
                  : <>Send <code className="font-mono bg-secondary/50 px-1 rounded">/link {tg.code}</code> to your bot in Telegram. Code expires in 10 minutes.</>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
