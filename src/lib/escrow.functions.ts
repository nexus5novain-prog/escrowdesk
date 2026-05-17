import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { tgSendMessage } from "./telegram.server";

// ---------- Notifications ----------
async function notifyUser(userId: string, message: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("telegram_user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (data?.telegram_user_id) {
    await tgSendMessage(Number(data.telegram_user_id), message);
  }
}

// ---------- Marketplace ----------
export const listOffers = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      side: z.enum(["buy", "sell"]).optional(),
      asset: z.enum(["USDT", "BTC"]).optional(),
      fiat: z.string().max(8).optional(),
    }).optional().transform((v) => v ?? {}),
  )
  .handler(async ({ data }) => {
    let q = supabaseAdmin
      .from("offers")
      .select("id, side, asset, fiat_currency, price, min_amount, max_amount, available_crypto, payment_method_types, terms, maker_id, profiles:profiles!offers_maker_id_fkey(display_name, trades_completed)" as never)
      .eq("status", "active")
      .order("price", { ascending: true })
      .limit(100);
    if (data.side) q = q.eq("side", data.side);
    if (data.asset) q = q.eq("asset", data.asset);
    if (data.fiat) q = q.eq("fiat_currency", data.fiat);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { offers: rows ?? [] };
  });

export const createOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      side: z.enum(["buy", "sell"]),
      asset: z.enum(["USDT", "BTC"]),
      fiat_currency: z.string().min(3).max(8),
      price: z.number().positive(),
      min_amount: z.number().positive(),
      max_amount: z.number().positive(),
      available_crypto: z.number().positive(),
      payment_method_types: z.array(z.string()).min(1),
      terms: z.string().max(2000).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    if (data.max_amount < data.min_amount) throw new Error("max < min");
    // If selling crypto, require enough available balance.
    if (data.side === "sell") {
      const { data: w } = await supabaseAdmin
        .from("wallets").select("available").eq("user_id", userId).eq("asset", data.asset).maybeSingle();
      if (!w || Number(w.available) < data.available_crypto) {
        throw new Error("Insufficient wallet balance to back this offer");
      }
    }
    const { data: row, error } = await supabaseAdmin
      .from("offers")
      .insert({ ...data, maker_id: userId })
      .select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const pauseOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), status: z.enum(["active", "paused", "closed"]) }))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin.from("offers").update({ status: data.status }).eq("id", data.id).eq("maker_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Trade lifecycle ----------
export const startTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    offer_id: z.string().uuid(),
    fiat_amount: z.number().positive(),
    payment_method_id: z.string().uuid().nullable().optional(),
  }))
  .handler(async ({ data, context }) => {
    const { data: tradeId, error } = await supabaseAdmin.rpc("start_trade", {
      _offer_id: data.offer_id,
      _buyer: context.userId,
      _fiat_amount: data.fiat_amount,
      _payment_method_id: data.payment_method_id ?? null,
    });
    if (error) throw new Error(error.message);
    const tid = tradeId as unknown as string;
    const { data: t } = await supabaseAdmin.from("trades").select("buyer_id, seller_id").eq("id", tid).single();
    if (t) {
      await notifyUser(t.seller_id, `🔔 New trade <code>${tid.slice(0,8)}</code> opened. Awaiting buyer payment.`);
      await notifyUser(t.buyer_id, `✅ Trade <code>${tid.slice(0,8)}</code> created. Send fiat then mark as paid.`);
    }
    return { id: tid };
  });

export const markPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ trade_id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin.rpc("mark_trade_paid", { _trade_id: data.trade_id, _caller: context.userId });
    if (error) throw new Error(error.message);
    const { data: t } = await supabaseAdmin.from("trades").select("seller_id").eq("id", data.trade_id).single();
    if (t) await notifyUser(t.seller_id, `💸 Buyer marked trade <code>${data.trade_id.slice(0,8)}</code> as paid. Verify and release.`);
    return { ok: true };
  });

export const releaseTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ trade_id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin.rpc("release_trade", { _trade_id: data.trade_id, _caller: context.userId });
    if (error) throw new Error(error.message);
    const { data: t } = await supabaseAdmin.from("trades").select("buyer_id, asset, crypto_amount").eq("id", data.trade_id).single();
    if (t) await notifyUser(t.buyer_id, `🎉 Crypto released! You received ${t.crypto_amount} ${t.asset}.`);
    return { ok: true };
  });

export const cancelTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ trade_id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin.rpc("cancel_trade", { _trade_id: data.trade_id, _caller: context.userId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const openDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ trade_id: z.string().uuid(), reason: z.string().min(5).max(500) }))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin.rpc("open_dispute", { _trade_id: data.trade_id, _caller: context.userId, _reason: data.reason });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ trade_id: z.string().uuid(), body: z.string().min(1).max(2000) }))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin.from("trade_messages").insert({
      trade_id: data.trade_id, sender_id: context.userId, body: data.body,
    });
    if (error) throw new Error(error.message);
    const { data: t } = await supabaseAdmin.from("trades").select("buyer_id, seller_id").eq("id", data.trade_id).single();
    if (t) {
      const other = t.buyer_id === context.userId ? t.seller_id : t.buyer_id;
      await notifyUser(other, `💬 New message on trade <code>${data.trade_id.slice(0,8)}</code>:\n${data.body.slice(0,300)}`);
    }
    return { ok: true };
  });

// ---------- Wallet (simulated deposit/withdraw) ----------
export const depositSimulated = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ asset: z.enum(["USDT","BTC"]), amount: z.number().positive().max(1_000_000) }))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin.rpc("credit_wallet", {
      _user: context.userId, _asset: data.asset, _amount: data.amount, _note: "Test deposit",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Payment methods ----------
export const upsertPaymentMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    id: z.string().uuid().optional(),
    label: z.string().min(1).max(100),
    method_type: z.string().min(1).max(40),
    details: z.string().min(1).max(2000),
    is_active: z.boolean().default(true),
  }))
  .handler(async ({ data, context }) => {
    if (data.id) {
      const { error } = await supabaseAdmin.from("payment_methods").update({
        label: data.label, method_type: data.method_type, details: data.details, is_active: data.is_active,
      }).eq("id", data.id).eq("user_id", context.userId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("payment_methods").insert({
        user_id: context.userId, label: data.label, method_type: data.method_type, details: data.details, is_active: data.is_active,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deletePaymentMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin.from("payment_methods").delete().eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Telegram linking ----------
export const generateTelegramLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const code = Math.random().toString(36).slice(2, 10).toUpperCase();
    const { error } = await supabaseAdmin.from("telegram_link_codes").insert({
      code, user_id: context.userId,
    });
    if (error) throw new Error(error.message);

    // Find the bot username for a deep link
    let botUsername: string | null = null;
    try {
      const { tgCall } = await import("./telegram.server");
      const me = await tgCall("getMe", {});
      botUsername = me?.result?.username ?? null;
    } catch { /* ignore */ }

    return {
      code,
      deep_link: botUsername ? `https://t.me/${botUsername}?start=${code}` : null,
    };
  });

// ---------- Admin ----------
async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r) => r.role === "admin" || r.role === "moderator")) throw new Error("Forbidden");
  const isAdmin = data.some((r) => r.role === "admin");
  return { isAdmin };
}

export const adminMakeMeAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Allow self-promotion ONLY when no admins exist yet (bootstrap).
    const { data: existing } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin").limit(1);
    if (existing && existing.length > 0) throw new Error("Admin already exists. Ask an admin to promote you.");
    const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: context.userId, role: "admin" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListDisputes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("disputes")
      .select("id, trade_id, opened_by, reason, status, created_at, trades(asset, crypto_amount, fiat_amount, fiat_currency, buyer_id, seller_id)" as never)
      .order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return { disputes: data ?? [] };
  });

export const adminResolveDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ trade_id: z.string().uuid(), award_to: z.enum(["buyer","seller"]), note: z.string().max(1000).default("") }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.rpc("resolve_dispute", {
      _trade_id: data.trade_id, _caller: context.userId, _award_to: data.award_to, _note: data.note,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSetFee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ fee_bps: z.number().int().min(0).max(1000) }))
  .handler(async ({ data, context }) => {
    const { isAdmin } = await assertAdmin(context.userId);
    if (!isAdmin) throw new Error("Admin only");
    const { error } = await supabaseAdmin.from("platform_settings").upsert({
      key: "fee_bps", value: data.fee_bps as unknown as object, updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminBanUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ user_id: z.string().uuid(), banned: z.boolean() }))
  .handler(async ({ data, context }) => {
    const { isAdmin } = await assertAdmin(context.userId);
    if (!isAdmin) throw new Error("Admin only");
    const { error } = await supabaseAdmin.from("profiles").update({ is_banned: data.banned }).eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminCreditWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ user_id: z.string().uuid(), asset: z.enum(["USDT","BTC"]), amount: z.number() }))
  .handler(async ({ data, context }) => {
    const { isAdmin } = await assertAdmin(context.userId);
    if (!isAdmin) throw new Error("Admin only");
    const rpc = data.amount >= 0 ? "credit_wallet" : "debit_wallet";
    const { error } = await supabaseAdmin.rpc(rpc, {
      _user: data.user_id, _asset: data.asset, _amount: Math.abs(data.amount), _note: "Admin adjustment",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Get current user dashboard data
export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [profile, wallets, pms, roles, settings] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("user_id", context.userId).maybeSingle(),
      supabaseAdmin.from("wallets").select("*").eq("user_id", context.userId),
      supabaseAdmin.from("payment_methods").select("*").eq("user_id", context.userId).order("created_at"),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId),
      supabaseAdmin.from("platform_settings").select("*"),
    ]);
    return {
      profile: profile.data,
      wallets: wallets.data ?? [],
      payment_methods: pms.data ?? [],
      roles: (roles.data ?? []).map((r) => r.role),
      settings: settings.data ?? [],
    };
  });

export const getMyTrades = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("trades")
      .select("id, status, asset, crypto_amount, fiat_amount, fiat_currency, price, created_at, buyer_id, seller_id")
      .or(`buyer_id.eq.${context.userId},seller_id.eq.${context.userId}`)
      .order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return { trades: data ?? [] };
  });

export const getTrade = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: t, error } = await supabaseAdmin
      .from("trades").select("*").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    if (t.buyer_id !== context.userId && t.seller_id !== context.userId) {
      const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId);
      if (!roles?.some((r) => r.role === "admin" || r.role === "moderator")) throw new Error("Forbidden");
    }
    const [{ data: msgs }, { data: buyer }, { data: seller }, { data: pm }] = await Promise.all([
      supabaseAdmin.from("trade_messages").select("*").eq("trade_id", data.id).order("created_at"),
      supabaseAdmin.from("profiles").select("display_name, trades_completed").eq("user_id", t.buyer_id).maybeSingle(),
      supabaseAdmin.from("profiles").select("display_name, trades_completed").eq("user_id", t.seller_id).maybeSingle(),
      t.payment_method_id ? supabaseAdmin.from("payment_methods").select("*").eq("id", t.payment_method_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    return { trade: t, messages: msgs ?? [], buyer, seller, payment_method: pm };
  });
