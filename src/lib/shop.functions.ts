import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function requireAdminRole(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Admin access required");
}

async function getAdminIds(): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");
  return (data ?? []).map((r) => r.user_id);
}

export type ShopSection = "CARD" | "ENROLL" | "SCANNER" | "GENERAL";

export type CardMeta = {
  type: "card";
  card_number: string;
  card_name: string;
  card_address: string;
  card_status: "active" | "dead";
  btc_rate: string;
  notes: string;
};

export type ShopProduct = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  category: string;
  section: ShopSection;
  amount: number | null;
  currency: string | null;
  image_url: string | null;
  contact_telegram: string | null;
  status: "active" | "inactive" | "sold";
  created_at: string;
  seller_name: string | null;
  card?: CardMeta | null;
};

function parseProduct(r: {
  id: string; user_id: string; name: string; description: string; category: string;
  amount: number | null; currency: string | null; contact_telegram: string | null;
  contact_website?: string | null; status: string; created_at: string;
}, sellerMap: Map<string, string>): ShopProduct {
  let card: CardMeta | null = null;
  let plainDescription = r.description;
  const section = deriveSection(r.category);

  if (section === "CARD") {
    try {
      const parsed = JSON.parse(r.description);
      if (parsed?.type === "card") {
        card = parsed as CardMeta;
        plainDescription = parsed.notes || "";
      }
    } catch { /* plain text description */ }
  }

  return {
    id: r.id,
    user_id: r.user_id,
    name: r.name,
    description: plainDescription,
    category: r.category,
    section,
    amount: r.amount,
    currency: r.currency,
    image_url: (r as Record<string, unknown>).contact_website as string | null ?? null,
    contact_telegram: r.contact_telegram,
    status: r.status as "active" | "inactive" | "sold",
    created_at: r.created_at,
    seller_name: sellerMap.get(r.user_id) ?? null,
    card,
  };
}

export function deriveSection(category: string): ShopSection {
  const c = category.toUpperCase();
  if (c === "CARD") return "CARD";
  if (c === "ENROLL") return "ENROLL";
  if (c === "SCANNER") return "SCANNER";
  return "GENERAL";
}

export const listShopProducts = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      section: z.enum(["CARD", "ENROLL", "SCANNER", "GENERAL"]).optional(),
      q: z.string().max(120).optional(),
    }).optional().transform((v) => v ?? {}),
  )
  .handler(async ({ data }) => {
    const adminIds = await getAdminIds();
    if (!adminIds.length) return { products: [] as ShopProduct[] };

    let q = supabaseAdmin
      .from("listings")
      .select("id,user_id,name,description,category,amount,currency,contact_telegram,contact_website,status,created_at")
      .in("user_id", adminIds)
      .eq("kind", "selling")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(200);

    if (data.section) {
      q = q.eq("category", data.section);
    }
    if (data.q) q = q.ilike("name", `%${data.q}%`);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
    const profs = ids.length
      ? (await supabaseAdmin.from("profiles").select("user_id,display_name").in("user_id", ids)).data ?? []
      : [];
    const pm = new Map(profs.map((p) => [p.user_id, p.display_name]));

    return { products: (rows ?? []).map((r) => parseProduct(r, pm)) };
  });

export const adminListShopProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      status: z.enum(["active", "inactive", "sold", "all"]).optional(),
      section: z.enum(["CARD", "ENROLL", "SCANNER", "GENERAL", "all"]).optional(),
    }).optional().transform((v) => v ?? {}),
  )
  .handler(async ({ data, context }) => {
    await requireAdminRole(context.userId);
    const adminIds = await getAdminIds();
    if (!adminIds.length) return { products: [] as ShopProduct[] };

    let q = supabaseAdmin
      .from("listings")
      .select("id,user_id,name,description,category,amount,currency,contact_telegram,contact_website,status,created_at")
      .in("user_id", adminIds)
      .eq("kind", "selling")
      .order("created_at", { ascending: false });

    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.section && data.section !== "all") q = q.eq("category", data.section);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
    const profs = ids.length
      ? (await supabaseAdmin.from("profiles").select("user_id,display_name").in("user_id", ids)).data ?? []
      : [];
    const pm = new Map(profs.map((p) => [p.user_id, p.display_name]));

    return { products: (rows ?? []).map((r) => parseProduct(r, pm)) };
  });

export const adminCreateShopProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      name: z.string().trim().min(2).max(120),
      description: z.string().trim().min(1).max(5000),
      section: z.enum(["CARD", "ENROLL", "SCANNER", "GENERAL"]),
      amount: z.number().nonnegative(),
      currency: z.string().trim().min(3).max(8).default("USD"),
      contact_telegram: z.string().trim().max(60).optional(),
      image_url: z.string().trim().max(500).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    await requireAdminRole(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("listings")
      .insert({
        user_id: context.userId,
        kind: "selling",
        name: data.name,
        description: data.description,
        category: data.section,
        amount: data.amount,
        currency: data.currency,
        contact_telegram: data.contact_telegram || null,
        contact_website: data.image_url || null,
        status: "active",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const adminUpdateShopProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(2).max(120).optional(),
      description: z.string().trim().min(1).max(5000).optional(),
      section: z.enum(["CARD", "ENROLL", "SCANNER", "GENERAL"]).optional(),
      amount: z.number().nonnegative().optional(),
      currency: z.string().trim().min(3).max(8).optional(),
      contact_telegram: z.string().trim().max(60).optional(),
      image_url: z.string().trim().max(500).optional(),
      status: z.enum(["active", "inactive", "sold"]).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    await requireAdminRole(context.userId);
    const { id, image_url, section, ...rest } = data;
    const update: Record<string, unknown> = {};
    if (rest.name !== undefined) update.name = rest.name;
    if (rest.description !== undefined) update.description = rest.description;
    if (section !== undefined) update.category = section;
    if (rest.amount !== undefined) update.amount = rest.amount;
    if (rest.currency !== undefined) update.currency = rest.currency;
    if (rest.contact_telegram !== undefined) update.contact_telegram = rest.contact_telegram || null;
    if (image_url !== undefined) update.contact_website = image_url || null;
    if (rest.status !== undefined) update.status = rest.status;
    const { error } = await supabaseAdmin.from("listings").update(update).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteShopProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await requireAdminRole(context.userId);
    const { error } = await supabaseAdmin.from("listings").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminGetShopStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdminRole(context.userId);
    const adminIds = await getAdminIds();
    if (!adminIds.length) return { total: 0, active: 0, inactive: 0, sold: 0, bySection: {} as Record<string, number> };
    const { data: rows } = await supabaseAdmin
      .from("listings")
      .select("status,amount,category")
      .in("user_id", adminIds)
      .eq("kind", "selling");
    const r = rows ?? [];
    const bySection: Record<string, number> = { CARD: 0, ENROLL: 0, SCANNER: 0, GENERAL: 0 };
    r.forEach((x) => { const s = (x.category ?? "GENERAL").toUpperCase(); if (s in bySection) bySection[s]++; });
    return {
      total: r.length,
      active: r.filter((x) => x.status === "active").length,
      inactive: r.filter((x) => x.status === "inactive").length,
      sold: r.filter((x) => x.status === "sold").length,
      bySection,
    };
  });
