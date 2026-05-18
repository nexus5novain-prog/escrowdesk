import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ListingRow = {
  id: string;
  user_id: string;
  kind: "selling" | "seeking";
  name: string;
  description: string;
  category: string;
  amount: number | null;
  currency: string | null;
  contact_telegram: string | null;
  contact_website: string | null;
  status: "active" | "inactive" | "sold";
  created_at: string;
  profile: {
    display_name: string;
    telegram_username: string | null;
    is_premium: boolean;
    is_trusted: boolean;
    trades_completed: number;
    rating_sum: number;
    rating_count: number;
  } | null;
};

export type Tier = "premium" | "trusted" | "regular";

export const listMarketplace = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({ q: z.string().max(120).optional(), category: z.string().max(60).optional() })
      .optional()
      .transform((v) => v ?? {}),
  )
  .handler(async ({ data }) => {
    let q = supabaseAdmin
      .from("listings")
      .select("id,user_id,kind,name,description,category,amount,currency,contact_telegram,contact_website,status,created_at")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.q) q = q.ilike("name", `%${data.q}%`);
    if (data.category) q = q.eq("category", data.category);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
    const profs = ids.length
      ? (
          await supabaseAdmin
            .from("profiles")
            .select("user_id,display_name,telegram_username,is_premium,is_trusted,trades_completed,rating_sum,rating_count")
            .in("user_id", ids)
        ).data ?? []
      : [];
    const pm = new Map(profs.map((p) => [p.user_id, p]));
    const enriched: ListingRow[] = (rows ?? []).map((r) => ({
      ...(r as Omit<ListingRow, "profile">),
      profile: (pm.get(r.user_id) as ListingRow["profile"]) ?? null,
    }));
    const tierOf = (l: ListingRow): Tier =>
      l.profile?.is_premium ? "premium" : l.profile?.is_trusted ? "trusted" : "regular";
    const groups: Record<Tier, { selling: ListingRow[]; seeking: ListingRow[] }> = {
      premium: { selling: [], seeking: [] },
      trusted: { selling: [], seeking: [] },
      regular: { selling: [], seeking: [] },
    };
    for (const l of enriched) groups[tierOf(l)][l.kind].push(l);
    return { groups, total: enriched.length };
  });

export const createListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      kind: z.enum(["selling", "seeking"]),
      name: z.string().trim().min(2).max(120),
      description: z.string().trim().min(5).max(2000),
      category: z.string().trim().min(2).max(60),
      amount: z.number().nonnegative().nullable().optional(),
      currency: z.string().trim().min(3).max(8).optional(),
      contact_telegram: z.string().trim().max(60).optional(),
      contact_website: z.string().trim().max(200).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("is_banned, telegram_username")
      .eq("user_id", userId)
      .maybeSingle();
    if (prof?.is_banned) throw new Error("Account is banned");
    // Auto-assign the linked Telegram username unless user explicitly overrode it
    const tg = (data.contact_telegram?.trim() || prof?.telegram_username || "").replace(/^@/, "");
    const { data: row, error } = await supabaseAdmin
      .from("listings")
      .insert({
        user_id: userId,
        kind: data.kind,
        name: data.name,
        description: data.description,
        category: data.category,
        amount: data.kind === "selling" ? data.amount ?? null : null,
        currency: data.currency ?? "USD",
        contact_telegram: tg || null,
        contact_website: data.contact_website || null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const myListings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("listings")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { listings: data ?? [] };
  });

export const updateListingStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({ id: z.string().uuid(), status: z.enum(["active", "inactive", "sold"]) }),
  )
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("listings")
      .update({ status: data.status })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
