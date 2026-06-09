import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ASSETS = ["BTC", "USDT", "USDC", "ETH"] as const;

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Admin only");
}

// Public browse
export const listProducts = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({ q: z.string().max(120).optional(), category: z.string().max(60).optional() })
      .optional()
      .transform((v) => v ?? {}),
  )
  .handler(async ({ data }) => {
    let q = supabaseAdmin
      .from("marketplace_products")
      .select("id,name,description,category,price,currency,image_url,stock,status,is_featured,created_at,seller_wallet_asset")
      .eq("status", "active")
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.q) q = q.ilike("name", `%${data.q}%`);
    if (data.category) q = q.eq("category", data.category);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { products: rows ?? [] };
  });

// Admin: list all (any status)
export const adminListProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin.from("marketplace_products").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { products: data ?? [] };
  });

export const adminCreateProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    name: z.string().trim().min(2).max(160),
    description: z.string().trim().min(5).max(4000),
    category: z.string().trim().min(2).max(60),
    price: z.number().positive(),
    currency: z.string().trim().min(3).max(8).default("USD"),
    image_url: z.string().trim().max(1000).optional().nullable(),
    stock: z.number().int().default(-1),
    seller_wallet_address: z.string().trim().max(200).optional().nullable(),
    seller_wallet_asset: z.enum(ASSETS).default("USDT"),
    is_featured: z.boolean().default(false),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: row, error } = await supabaseAdmin.from("marketplace_products").insert({
      ...data,
      image_url: data.image_url || null,
      seller_wallet_address: data.seller_wallet_address || null,
      created_by: context.userId,
    } as never).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const adminUpdateProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    id: z.string().uuid(),
    name: z.string().trim().min(2).max(160).optional(),
    description: z.string().trim().min(5).max(4000).optional(),
    category: z.string().trim().min(2).max(60).optional(),
    price: z.number().positive().optional(),
    currency: z.string().trim().min(3).max(8).optional(),
    image_url: z.string().trim().max(1000).nullable().optional(),
    stock: z.number().int().optional(),
    seller_wallet_address: z.string().trim().max(200).nullable().optional(),
    seller_wallet_asset: z.enum(ASSETS).optional(),
    is_featured: z.boolean().optional(),
    status: z.enum(["active", "inactive", "sold_out"]).optional(),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { id, ...patch } = data;
    const { error } = await supabaseAdmin.from("marketplace_products").update(patch as never).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("marketplace_products").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Buy → auto-create an escrow group between buyer and product owner (admin)
export const buyProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: p, error } = await supabaseAdmin
      .from("marketplace_products")
      .select("id, price, currency, seller_wallet_address, seller_wallet_asset, status, created_by, name")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!p) throw new Error("Product not found");
    if (p.status !== "active") throw new Error("Product unavailable");
    if (p.created_by === userId) throw new Error("Cannot buy your own product");

    const asset = (p.seller_wallet_asset || "USDT") as "BTC" | "USDT" | "USDC" | "ETH";
    const fiatAmount = Number(p.price);
    const cryptoAmount = fiatAmount; // 1:1 placeholder for stablecoins; real conversion happens off-platform

    const { data: g, error: gErr } = await supabaseAdmin.from("escrow_groups").insert({
      creator_id: userId,
      counterparty_id: p.created_by,
      asset,
      amount: cryptoAmount,
      fiat_amount: fiatAmount,
      fiat_currency: p.currency,
      escrow_address: p.seller_wallet_address || null,
      escrow_address_chain: asset === "USDT" ? "TRC20" : asset === "USDC" ? "ERC20" : asset,
      status: "awaiting_counterparty",
    } as never).select("id").single();
    if (gErr) throw new Error(gErr.message);

    await supabaseAdmin.from("escrow_group_members").insert([
      { group_id: g.id, user_id: userId, role: "buyer", accepted_at: new Date().toISOString() },
      { group_id: g.id, user_id: p.created_by, role: "seller", accepted_at: null },
    ] as never);

    await supabaseAdmin.from("escrow_group_messages").insert({
      group_id: g.id,
      body: `Marketplace purchase opened for "${p.name}" — ${fiatAmount} ${p.currency}.`,
      is_system: true,
    } as never);

    return { id: g.id };
  });
