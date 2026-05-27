import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type BinRecord = {
  id: string;
  bin: string;
  bank: string;
  brand: string;
  card_type: string | null;
  card_level: string | null;
  country: string | null;
  country_code: string | null;
  currency: string | null;
  notes: string | null;
};

async function requireAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Admin access required");
}

/** Look up the best-matching BIN row for a card number (first 6 digits). */
export const lookupBin = createServerFn({ method: "GET" })
  .inputValidator(z.object({ cardNumber: z.string().min(6).max(25) }))
  .handler(async ({ data }) => {
    const digits = data.cardNumber.replace(/\D/g, "").slice(0, 8);
    if (digits.length < 6) return { bin: null as BinRecord | null };
    const candidates = [digits.slice(0, 8), digits.slice(0, 7), digits.slice(0, 6)];
    for (const c of candidates) {
      if (c.length < 6) continue;
      const { data: row } = await supabaseAdmin
        .from("bins")
        .select("id,bin,bank,brand,card_type,card_level,country,country_code,currency,notes")
        .eq("bin", c)
        .maybeSingle();
      if (row) return { bin: row as BinRecord };
    }
    return { bin: null as BinRecord | null };
  });

export const listBins = createServerFn({ method: "GET" })
  .inputValidator(z.object({ q: z.string().max(120).optional() }).optional().transform((v) => v ?? {}))
  .handler(async ({ data }) => {
    let q = supabaseAdmin
      .from("bins")
      .select("id,bin,bank,brand,card_type,card_level,country,country_code,currency,notes")
      .order("bin", { ascending: true })
      .limit(500);
    if (data.q) {
      const s = data.q.trim();
      q = q.or(`bin.ilike.%${s}%,bank.ilike.%${s}%,brand.ilike.%${s}%,country.ilike.%${s}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { bins: (rows ?? []) as BinRecord[] };
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  bin: z.string().regex(/^\d{6,8}$/),
  bank: z.string().trim().min(1).max(120),
  brand: z.string().trim().min(1).max(60),
  card_type: z.string().trim().max(60).optional(),
  card_level: z.string().trim().max(60).optional(),
  country: z.string().trim().max(80).optional(),
  country_code: z.string().trim().max(8).optional(),
  currency: z.string().trim().max(8).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const adminUpsertBin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(upsertSchema)
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);
    const payload = { ...data, created_by: context.userId };
    if (data.id) {
      const { id, ...rest } = payload;
      const { error } = await supabaseAdmin.from("bins").update(rest as never).eq("id", id as string);
      if (error) throw new Error(error.message);
      return { id: id as string };
    }
    const { data: row, error } = await supabaseAdmin
      .from("bins").insert(payload as never).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const adminDeleteBin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);
    const { error } = await supabaseAdmin.from("bins").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
