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

export type ShopProduct = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  category: string;
  amount: number | null;
  currency: string | null;
  image_url: string | null;
  contact_telegram: string | null;
  status: "active" | "inactive" | "sold";
  created_at: string;
  seller_name: string | null;
};

export const listShopProducts = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      q: z.string().max(120).optional(),
      category: z.string().max(60).optional(),
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

    if (data.q) q = q.ilike("name", `%${data.q}%`);
    if (data.category) q = q.eq("category", data.category);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
    const profs = ids.length
      ? (await supabaseAdmin.from("profiles").select("user_id,display_name").in("user_id", ids)).data ?? []
      : [];
    const pm = new Map(profs.map((p) => [p.user_id, p.display_name]));

    const products: ShopProduct[] = (rows ?? []).map((r) => ({
      id: r.id,
      user_id: r.user_id,
      name: r.name,
      description: r.description,
      category: r.category,
      amount: r.amount,
      currency: r.currency,
      image_url: (r as Record<string, unknown>).contact_website as string | null,
      contact_telegram: r.contact_telegram,
      status: r.status as "active" | "inactive" | "sold",
      created_at: r.created_at,
      seller_name: pm.get(r.user_id) ?? null,
    }));

    return { products };
  });

export const adminListShopProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({ status: z.enum(["active", "inactive", "sold", "all"]).optional() })
      .optional().transform((v) => v ?? {}),
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

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
    const profs = ids.length
      ? (await supabaseAdmin.from("profiles").select("user_id,display_name").in("user_id", ids)).data ?? []
      : [];
    const pm = new Map(profs.map((p) => [p.user_id, p.display_name]));

    return {
      products: (rows ?? []).map((r) => ({
        id: r.id,
        user_id: r.user_id,
        name: r.name,
        description: r.description,
        category: r.category,
        amount: r.amount,
        currency: r.currency,
        image_url: (r as Record<string, unknown>).contact_website as string | null,
        contact_telegram: r.contact_telegram,
        status: r.status as "active" | "inactive" | "sold",
        created_at: r.created_at,
        seller_name: pm.get(r.user_id) ?? null,
      })) as ShopProduct[],
    };
  });

export const adminCreateShopProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      name: z.string().trim().min(2).max(120),
      description: z.string().trim().min(5).max(2000),
      category: z.string().trim().min(2).max(60),
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
        category: data.category,
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
      description: z.string().trim().min(5).max(2000).optional(),
      category: z.string().trim().min(2).max(60).optional(),
      amount: z.number().nonnegative().optional(),
      currency: z.string().trim().min(3).max(8).optional(),
      contact_telegram: z.string().trim().max(60).optional(),
      image_url: z.string().trim().max(500).optional(),
      status: z.enum(["active", "inactive", "sold"]).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    await requireAdminRole(context.userId);
    const { id, image_url, ...rest } = data;
    const update: Record<string, unknown> = {};
    if (rest.name !== undefined) update.name = rest.name;
    if (rest.description !== undefined) update.description = rest.description;
    if (rest.category !== undefined) update.category = rest.category;
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
    if (!adminIds.length) return { total: 0, active: 0, inactive: 0, sold: 0, revenue: 0 };
    const { data: rows } = await supabaseAdmin
      .from("listings")
      .select("status,amount")
      .in("user_id", adminIds)
      .eq("kind", "selling");
    const r = rows ?? [];
    return {
      total: r.length,
      active: r.filter((x) => x.status === "active").length,
      inactive: r.filter((x) => x.status === "inactive").length,
      sold: r.filter((x) => x.status === "sold").length,
      revenue: r.filter((x) => x.status === "sold").reduce((s, x) => s + (Number(x.amount) || 0), 0),
    };
  });
