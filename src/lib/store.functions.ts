import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function ensureAdmin(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("admin")) throw new Error("Admin only");
}

export const listProducts = createServerFn({ method: "GET" })
  .inputValidator(z.object({ page: z.number().int().min(1).optional(), per_page: z.number().int().min(1).max(100).optional(), q: z.string().max(256).optional(), category: z.string().max(64).optional() }).optional())
  .handler(async ({ data }) => {
    const page = (data as any)?.page ?? 1;
    const per = (data as any)?.per_page ?? 25;
    let q = supabaseAdmin.from("store_products").select("*");
    const filt = data as any;
    if (filt?.category) q = q.eq("category", filt.category);
    if (filt?.q) q = q.ilike("card_number", `%${filt.q}%`).or(`card_user.ilike.%${filt.q}%`);
    const offset = (page - 1) * per;
    const { data: rows, error, count } = await q.order("created_at", { ascending: false }).range(offset, offset + per - 1).limit(per).select();
    if (error) throw new Error(error.message);
    // count may be undefined depending on PostgREST; fetch total separately
    const { count: total } = await supabaseAdmin.from("store_products").select("id", { count: "exact", head: false });
    return { products: rows ?? [], total: Number(total ?? 0), page, per_page: per };
  });

export const exportProductsCSV = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({}).optional())
  .handler(async ({ context }) => {
    const userId = context.userId;
    if (!userId) throw new Error("Unauthenticated");
    await ensureAdmin(userId);
    const { data: rows, error } = await supabaseAdmin.from("store_products").select("*").order("created_at", { ascending: false }).limit(10000);
    if (error) throw new Error(error.message);
    const csv = ["id,category,card_number,card_user,card_type,card_bank,card_address,price_usd,created_by,created_at"]
      .concat((rows ?? []).map((r: any) => `${r.id},"${(r.category||"").replace(/"/g,'""')}","${(r.card_number||"").replace(/"/g,'""')}","${(r.card_user||"").replace(/"/g,'""')}","${(r.card_type||"").replace(/"/g,'""')}","${(r.card_bank||"").replace(/"/g,'""')}","${(r.card_address||"").replace(/"/g,'""')}",${r.price_usd},${r.created_by},${r.created_at}`))
      .join("\n");
    return { csv };
  });

export const createProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ product: z.object({
    category: z.string().max(64),
    card_number: z.string().max(256).nullable().optional(),
    card_user: z.string().max(200).nullable().optional(),
    card_type: z.string().max(100).nullable().optional(),
    card_bank: z.string().max(200).nullable().optional(),
    card_address: z.string().max(1024).nullable().optional(),
    price_usd: z.number().nonnegative(),
  }) }))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    if (!userId) throw new Error("Unauthenticated");
    await ensureAdmin(userId);
    const { product } = data as any;
    const { data: row, error } = await supabaseAdmin.from("store_products").insert({ ...product, created_by: userId }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    if (!userId) throw new Error("Unauthenticated");
    await ensureAdmin(userId);
    const { error } = await supabaseAdmin.from("store_products").delete().eq("id", (data as any).id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), patch: z.object({ category: z.string().max(64).optional(), card_number: z.string().max(256).nullable().optional(), card_user: z.string().max(200).nullable().optional(), card_type: z.string().max(100).nullable().optional(), card_bank: z.string().max(200).nullable().optional(), card_address: z.string().max(1024).nullable().optional(), price_usd: z.number().nonnegative().optional() }) }))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    if (!userId) throw new Error("Unauthenticated");
    await ensureAdmin(userId);
    const { id, patch } = data as any;
    const { error } = await supabaseAdmin.from("store_products").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const submitReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ trade_id: z.string().uuid().optional(), target_user: z.string().uuid(), rating: z.number().int().min(1).max(5), comment: z.string().max(2000).optional() }))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    if (!userId) throw new Error("Unauthenticated");
    const { trade_id, target_user, rating, comment } = data as any;
    const { error } = await supabaseAdmin.rpc("apply_review", { _reviewer: userId, _target: target_user, _trade: trade_id ?? null, _rating: rating, _comment: comment ?? null });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
