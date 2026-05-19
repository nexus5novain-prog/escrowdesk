import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function requireAdmin(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Admin access required");
}

// ---------- Trade Library ----------

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
      .select("id, name, description, category, amount, currency, contact_telegram, image_url, user_id")
      .in("id", listingIds);
    const listingMap = new Map((listings ?? []).map((l) => [l.id, l]));
    return {
      purchases: groups.map((g) => ({
        ...g,
        listing: g.listing_id ? (listingMap.get(g.listing_id) ?? null) : null,
      })),
    };
  });

// ---------- Badge auto-grant ----------

export const autoGrantBadges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const u = context.userId;
    const [{ count: tradesCount }, { data: ratings }, { data: prof }] = await Promise.all([
      supabaseAdmin.from("trades").select("id", { count: "exact", head: true }).eq("status", "released").or(`buyer_id.eq.${u},seller_id.eq.${u}`),
      supabaseAdmin.from("trade_ratings").select("rater_id, stars").eq("ratee_id", u),
      supabaseAdmin.from("profiles").select("is_trusted, is_premium").eq("user_id", u).maybeSingle(),
    ]);
    const distinct4plus = new Set((ratings ?? []).filter((r) => r.stars >= 4).map((r) => r.rater_id)).size;
    const updates: Record<string, boolean> = {};
    if ((tradesCount ?? 0) >= 5 && distinct4plus >= 3 && !prof?.is_trusted) {
      updates.is_trusted = true;
    }
    if (Object.keys(updates).length) {
      await supabaseAdmin.from("profiles").update(updates as never).eq("user_id", u);
    }
    return { granted: Object.keys(updates), trades_completed: tradesCount ?? 0, distinct_4plus: distinct4plus };
  });

// ---------- Premium subscription ----------

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

// ---------- Full profile stats ----------

export const getFullProfileStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const u = context.userId;
    const [{ data: prof }, { count: tradesCount }, { data: ratings }, { data: roles }, { data: purchases }] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("user_id", u).maybeSingle(),
      supabaseAdmin.from("trades").select("id", { count: "exact", head: true }).eq("status", "released").or(`buyer_id.eq.${u},seller_id.eq.${u}`),
      supabaseAdmin.from("trade_ratings").select("stars").eq("ratee_id", u),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", u),
      supabaseAdmin.from("escrow_groups").select("id", { count: "exact", head: true }).eq("creator_id", u).eq("status", "released").not("listing_id", "is", null),
    ]);
    const avgRating = ratings?.length ? ratings.reduce((s, r) => s + r.stars, 0) / ratings.length : 0;
    const fiveStars = (ratings ?? []).filter((r) => r.stars === 5).length;
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    const isPremium = isAdmin || !!prof?.is_premium;
    const isTrusted = isAdmin || !!prof?.is_trusted;
    return {
      profile: prof,
      trades_completed: tradesCount ?? 0,
      avg_rating: Math.round(avgRating * 10) / 10,
      five_star_count: fiveStars,
      total_ratings: ratings?.length ?? 0,
      is_premium: isPremium,
      is_trusted: isTrusted,
      is_admin: isAdmin,
      purchases_count: (purchases as unknown as { count: number })?.count ?? 0,
      roles: (roles ?? []).map((r) => r.role),
    };
  });
