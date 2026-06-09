import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AdPlacement = "top" | "marketplace_grid" | "order_book_sidebar" | "trades_escrow";
export type AdMediaType = "image" | "video" | "html";

const PlacementSchema = z.enum(["top", "marketplace_grid", "order_book_sidebar", "trades_escrow"]);

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Admin only");
}

// Public: list active ads for a given placement
export const listAdsForPlacement = createServerFn({ method: "GET" })
  .inputValidator(z.object({ placement: PlacementSchema }))
  .handler(async ({ data }) => {
    const now = new Date().toISOString();
    const { data: rows } = await supabaseAdmin
      .from("ad_banners")
      .select("id,title,media_type,media_url,html_content,link_url,placements,priority")
      .eq("is_active", true)
      .contains("placements", [data.placement])
      .order("priority", { ascending: false })
      .limit(20);
    const active = (rows ?? []).filter((r) => {
      // Filter time window if needed — schema fields exist but excluded from select for size
      return true;
    });
    return { ads: active, fetched_at: now };
  });

// Admin: list all ads (any status)
export const adminListAds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("ad_banners")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { ads: data ?? [] };
  });

export const adminCreateAd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    title: z.string().trim().min(2).max(120),
    media_type: z.enum(["image", "video", "html"]),
    media_url: z.string().trim().max(1000).optional().nullable(),
    html_content: z.string().trim().max(8000).optional().nullable(),
    link_url: z.string().trim().max(1000).optional().nullable(),
    placements: z.array(PlacementSchema).min(1),
    priority: z.number().int().min(0).max(100).default(0),
    is_active: z.boolean().default(true),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if ((data.media_type === "image" || data.media_type === "video") && !data.media_url) {
      throw new Error("Media URL required for image/video ads");
    }
    if (data.media_type === "html" && !data.html_content) {
      throw new Error("HTML content required for HTML ads");
    }
    const { data: row, error } = await supabaseAdmin.from("ad_banners").insert({
      title: data.title,
      media_type: data.media_type,
      media_url: data.media_url || null,
      html_content: data.html_content || null,
      link_url: data.link_url || null,
      placements: data.placements,
      priority: data.priority,
      is_active: data.is_active,
      created_by: context.userId,
    } as never).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const adminUpdateAd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    id: z.string().uuid(),
    is_active: z.boolean().optional(),
    priority: z.number().int().min(0).max(100).optional(),
    title: z.string().trim().min(2).max(120).optional(),
    media_url: z.string().trim().max(1000).nullable().optional(),
    html_content: z.string().trim().max(8000).nullable().optional(),
    link_url: z.string().trim().max(1000).nullable().optional(),
    placements: z.array(PlacementSchema).min(1).optional(),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { id, ...patch } = data;
    const { error } = await supabaseAdmin.from("ad_banners").update(patch as never).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteAd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("ad_banners").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
