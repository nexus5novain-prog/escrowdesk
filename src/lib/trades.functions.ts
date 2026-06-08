// Profile / badge / premium helpers — now backed by escrow_groups (not legacy trades table).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function requireAdmin(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Admin access required");
}

async function countReleasedGroups(userId: string): Promise<number> {
  const { data: mems } = await supabaseAdmin.from("escrow_group_members").select("group_id").eq("user_id", userId);
  const ids = (mems ?? []).map((m) => m.group_id);
  if (!ids.length) return 0;
  const { count } = await supabaseAdmin
    .from("escrow_groups").select("id", { count: "exact", head: true })
    .in("id", ids).eq("status", "released");
  return count ?? 0;
}

// ---------- Badge auto-grant (Trusted) ----------
export const autoGrantBadges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const u = context.userId;
    const tradesCount = await countReleasedGroups(u);
    const { data: prof } = await supabaseAdmin.from("profiles").select("is_trusted, is_premium").eq("user_id", u).maybeSingle();
    const updates: Record<string, boolean> = {};
    // Simplified rule: 5 released escrow groups → Trusted
    if (tradesCount >= 5 && !prof?.is_trusted) updates.is_trusted = true;
    if (Object.keys(updates).length) {
      await supabaseAdmin.from("profiles").update(updates as never).eq("user_id", u);
    }
    return { granted: Object.keys(updates), trades_completed: tradesCount, distinct_4plus: 0 };
  });

// ---------- Premium ----------
export const requestPremium = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: prof } = await supabaseAdmin.from("profiles").select("display_name").eq("user_id", context.userId).maybeSingle();
    const note = `Premium request from ${prof?.display_name ?? context.userId}. Admin must verify payment of $50 and activate.`;
    return { ok: true, note };
  });

export const adminActivatePremium = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ user_id: z.string().uuid(), months: z.number().int().min(1).max(36).default(3) }))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + data.months);
    await supabaseAdmin.from("profiles").update({ is_premium: true, premium_expires_at: expiresAt.toISOString() } as never).eq("user_id", data.user_id);
    return { ok: true, expires_at: expiresAt.toISOString() };
  });

export const adminRevokePremium = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ user_id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);
    await supabaseAdmin.from("profiles").update({ is_premium: false } as never).eq("user_id", data.user_id);
    return { ok: true };
  });

export const adminGrantTrusted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ user_id: z.string().uuid(), grant: z.boolean() }))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);
    await supabaseAdmin.from("profiles").update({ is_trusted: data.grant } as never).eq("user_id", data.user_id);
    return { ok: true };
  });

// ---------- Profile stats ----------
export const getFullProfileStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const u = context.userId;
    const [{ data: prof }, tradesCount, { data: roles }, purchasesCount] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("user_id", u).maybeSingle(),
      countReleasedGroups(u),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", u),
      supabaseAdmin.from("escrow_groups").select("id", { count: "exact", head: true })
        .eq("creator_id", u).eq("status", "released").not("listing_id", "is", null)
        .then((r) => r.count ?? 0),
    ]);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    return {
      profile: prof,
      trades_completed: tradesCount,
      avg_rating: 0,
      five_star_count: 0,
      total_ratings: 0,
      is_premium: isAdmin || !!prof?.is_premium,
      is_trusted: isAdmin || !!prof?.is_trusted,
      is_admin: isAdmin,
      purchases_count: purchasesCount,
      roles: (roles ?? []).map((r) => r.role),
    };
  });

// ---------- Purchases (released escrow groups from listings) ----------
export const listMyPurchases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: groups } = await supabaseAdmin
      .from("escrow_groups")
      .select("id, listing_id, amount, fiat_amount, fiat_currency, asset, released_at, created_at")
      .eq("creator_id", context.userId)
      .eq("status", "released")
      .not("listing_id", "is", null)
      .order("released_at", { ascending: false });
    if (!groups?.length) return { purchases: [] };
    const listingIds = groups.map((g) => g.listing_id!);
    const { data: listings } = await supabaseAdmin
      .from("listings")
      .select("id, name, description, category, amount, currency, contact_telegram, contact_website, user_id")
      .in("id", listingIds);
    const listingMap = new Map((listings ?? []).map((l) => [l.id, l]));
    return {
      purchases: groups.map((g) => ({
        ...g,
        listing: g.listing_id ? (listingMap.get(g.listing_id) ?? null) : null,
      })),
    };
  });
