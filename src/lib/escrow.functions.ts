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
      .select("id, side, asset, fiat_currency, price, min_amount, max_amount, available_crypto, payment_method_types, terms, maker_id")
      .eq("status", "active")
      .order("price", { ascending: true })
      .limit(100);
    if (data.side) q = q.eq("side", data.side);
    if (data.asset) q = q.eq("asset", data.asset);
    if (data.fiat) q = q.eq("fiat_currency", data.fiat);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((rows ?? []).map((r) => r.maker_id)));
    const profs = ids.length
      ? (await supabaseAdmin.from("profiles").select("user_id, display_name, trades_completed").in("user_id", ids)).data ?? []
      : [];
    const pm = new Map(profs.map((p) => [p.user_id, p]));
    return { offers: (rows ?? []).map((r) => ({ ...r, profile: pm.get(r.maker_id) ?? null })) };
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
      _payment_method_id: (data.payment_method_id ?? null) as string,
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
    const { data: t } = await supabaseAdmin.from("trades").select("seller_id, asset, crypto_amount, fee_amount").eq("id", data.trade_id).single();
    if (t) {
      const net = Number(t.crypto_amount) - Number(t.fee_amount);
      await notifyUser(t.seller_id, `🎉 Buyer released escrow! You received ${net.toFixed(4)} ${t.asset}.`);
    }
    return { ok: true };
  });

// Sign the trade terms (buyer or seller). Phrase must be exact.
export const signTerms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    trade_id: z.string().uuid(),
    signature: z.string().min(10).max(200),
    terms: z.string().max(2000).optional(),
  }))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin.rpc("sign_terms", {
      _trade_id: data.trade_id,
      _caller: context.userId,
      _signature: data.signature,
      _terms: (data.terms ?? null) as string,
    });
    if (error) throw new Error(error.message);
    const { data: t } = await supabaseAdmin.from("trades").select("buyer_id, seller_id, status").eq("id", data.trade_id).single();
    if (t) {
      const other = t.buyer_id === context.userId ? t.seller_id : t.buyer_id;
      await notifyUser(other, `✍️ Counterparty signed terms on trade <code>${data.trade_id.slice(0,8)}</code>. Status: ${t.status}.`);
    }
    return { ok: true };
  });

// Seller confirms they see the buyer's crypto in escrow.
export const confirmBuyerDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ trade_id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin.rpc("confirm_buyer_deposit", { _trade_id: data.trade_id, _caller: context.userId });
    if (error) throw new Error(error.message);
    const { data: t } = await supabaseAdmin.from("trades").select("buyer_id").eq("id", data.trade_id).single();
    if (t) await notifyUser(t.buyer_id, `✅ Seller confirmed your deposit on trade <code>${data.trade_id.slice(0,8)}</code>. Settle fiat off-platform, then release.`);
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
      botUsername = (me?.result as { username?: string } | undefined)?.username ?? null;
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
      key: "fee_bps", value: data.fee_bps, updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminBanUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ user_id: z.string().uuid(), reason: z.string().min(3).max(500) }))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin.rpc("ban_user", {
      _target: data.user_id, _caller: context.userId, _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    await notifyUser(data.user_id, `🚫 Your account has been banned. Reason: ${data.reason}`);
    return { ok: true };
  });

export const adminUnbanUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ user_id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin.rpc("unban_user", { _target: data.user_id, _caller: context.userId });
    if (error) throw new Error(error.message);
    await notifyUser(data.user_id, `✅ Your account has been unbanned. Welcome back.`);
    return { ok: true };
  });

export const adminWarnUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    user_id: z.string().uuid(),
    reason: z.string().min(3).max(500),
    severity: z.enum(["minor","major","final"]).default("minor"),
  }))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin.rpc("warn_user", {
      _target: data.user_id, _caller: context.userId, _reason: data.reason, _severity: data.severity,
    });
    if (error) throw new Error(error.message);
    await notifyUser(data.user_id, `⚠️ Warning (${data.severity}) issued by staff: ${data.reason}`);
    return { ok: true };
  });

export const adminListWarnings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ user_id: z.string().uuid().optional() }).optional().transform((v) => v ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let q = supabaseAdmin.from("user_warnings")
      .select("id, user_id, issued_by, reason, severity, created_at")
      .order("created_at", { ascending: false }).limit(200);
    if (data.user_id) q = q.eq("user_id", data.user_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((rows ?? []).flatMap((r) => [r.user_id, r.issued_by])));
    const profs = ids.length
      ? (await supabaseAdmin.from("profiles").select("user_id, display_name").in("user_id", ids)).data ?? []
      : [];
    const nm = new Map(profs.map((p) => [p.user_id, p.display_name]));
    return { warnings: (rows ?? []).map((w) => ({
      ...w, user_name: nm.get(w.user_id) ?? null, issued_by_name: nm.get(w.issued_by) ?? null,
    })) };
  });

export const adminAssignRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    user_id: z.string().uuid(),
    role: z.enum(["admin","moderator","judge","finance","support","user"]),
  }))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin.rpc("assign_role", {
      _target: data.user_id, _caller: context.userId, _role: data.role,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminRevokeRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    user_id: z.string().uuid(),
    role: z.enum(["admin","moderator","judge","finance","support","user"]),
  }))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin.rpc("revoke_role", {
      _target: data.user_id, _caller: context.userId, _role: data.role,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ search: z.string().max(100).optional() }).optional().transform((v) => v ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let q = supabaseAdmin.from("profiles")
      .select("user_id, display_name, telegram_username, telegram_user_id, is_banned, ban_reason, banned_at, trades_completed, created_at")
      .order("created_at", { ascending: false }).limit(200);
    if (data.search && data.search.trim()) {
      q = q.ilike("display_name", `%${data.search.trim()}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const ids = (rows ?? []).map((r) => r.user_id);
    const { data: roleRows } = ids.length
      ? await supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids)
      : { data: [] as { user_id: string; role: string }[] };
    const rmap = new Map<string, string[]>();
    (roleRows ?? []).forEach((r) => {
      const arr = rmap.get(r.user_id) ?? [];
      arr.push(r.role as string);
      rmap.set(r.user_id, arr);
    });
    return { users: (rows ?? []).map((u) => ({ ...u, roles: rmap.get(u.user_id) ?? [] })) };
  });

export const adminUnlinkTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ user_id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { isAdmin } = await assertAdmin(context.userId);
    if (!isAdmin) throw new Error("Admin only");
    const { error } = await supabaseAdmin.from("profiles")
      .update({ telegram_user_id: null, telegram_username: null })
      .eq("user_id", data.user_id);
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

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    display_name: z.string().min(1).max(80).optional(),
    bio: z.string().max(500).optional(),
    avatar_url: z.string().url().max(1024).nullable().optional(),
  }))
  .handler(async ({ data, context }) => {
    const patch: { display_name?: string; bio?: string | null; avatar_url?: string | null } = {};
    if (data.display_name !== undefined) patch.display_name = data.display_name;
    if (data.bio !== undefined) patch.bio = data.bio;
    if (data.avatar_url !== undefined) patch.avatar_url = data.avatar_url;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await supabaseAdmin.from("profiles").update(patch).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
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

// ---------- Admin: lightweight role check (no throw) ----------
export const getMyRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId);
    return { roles: (data ?? []).map((r) => r.role as string) };
  });

// ---------- Admin: tables ----------
export const adminListOffers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ status: z.enum(["active","paused","closed"]).optional() }).optional().transform((v) => v ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let q = supabaseAdmin.from("offers")
      .select("id, side, asset, fiat_currency, price, min_amount, max_amount, available_crypto, status, maker_id, created_at")
      .order("created_at", { ascending: false }).limit(200);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((rows ?? []).map((r) => r.maker_id)));
    const profs = ids.length
      ? (await supabaseAdmin.from("profiles").select("user_id, display_name").in("user_id", ids)).data ?? []
      : [];
    const pm = new Map(profs.map((p) => [p.user_id, p.display_name]));
    return { offers: (rows ?? []).map((r) => ({ ...r, maker_name: pm.get(r.maker_id) ?? null })) };
  });

export const adminUpdateOfferStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), status: z.enum(["active","paused","closed"]) }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("offers").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListTrades = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    status: z.enum(["awaiting_agreement","awaiting_seller_confirm","pending_payment","paid","released","cancelled","disputed"]).optional(),
  }).optional().transform((v) => v ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let q = supabaseAdmin.from("trades")
      .select("id, status, asset, crypto_amount, fiat_amount, fiat_currency, price, created_at, buyer_id, seller_id")
      .order("created_at", { ascending: false }).limit(200);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((rows ?? []).flatMap((r) => [r.buyer_id, r.seller_id])));
    const profs = ids.length
      ? (await supabaseAdmin.from("profiles").select("user_id, display_name").in("user_id", ids)).data ?? []
      : [];
    const nm = new Map(profs.map((p) => [p.user_id, p.display_name]));
    return { trades: (rows ?? []).map((r) => ({
      ...r, buyer_name: nm.get(r.buyer_id) ?? null, seller_name: nm.get(r.seller_id) ?? null,
    })) };
  });

export const adminForceCancelTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ trade_id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { isAdmin } = await assertAdmin(context.userId);
    if (!isAdmin) throw new Error("Admin only");
    const { error } = await supabaseAdmin.rpc("cancel_trade", { _trade_id: data.trade_id, _caller: context.userId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminForceReleaseTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ trade_id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { isAdmin } = await assertAdmin(context.userId);
    if (!isAdmin) throw new Error("Admin only");
    const { error } = await supabaseAdmin.rpc("release_trade", { _trade_id: data.trade_id, _caller: context.userId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Admin: Telegram wizard ----------
export const tgGetStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { tgCall } = await import("./telegram.server");
    const hasKey = !!process.env.TELEGRAM_API_KEY;
    if (!hasKey) return { hasKey: false, me: null, webhook: null };
    const [me, wh] = await Promise.all([tgCall("getMe", {}), tgCall("getWebhookInfo", {})]);
    return { hasKey: true, me: me?.result ?? null, webhook: wh?.result ?? null };
  });

export const tgSetWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ url: z.string().url() }))
  .handler(async ({ data, context }) => {
    const { isAdmin } = await assertAdmin(context.userId);
    if (!isAdmin) throw new Error("Admin only");
    if (!data.url.startsWith("https://")) throw new Error("HTTPS required");
    const { tgCall } = await import("./telegram.server");
    const { createHash } = await import("crypto");
    const secret = createHash("sha256").update(`telegram-webhook:${process.env.TELEGRAM_API_KEY ?? ""}`).digest("base64url");
    const r = await tgCall("setWebhook", {
      url: data.url, secret_token: secret, allowed_updates: ["message","edited_message","callback_query"],
    });
    if (!r?.ok) throw new Error(r?.description || "setWebhook failed");
    return { ok: true };
  });

export const tgDeleteWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdmin } = await assertAdmin(context.userId);
    if (!isAdmin) throw new Error("Admin only");
    const { tgCall } = await import("./telegram.server");
    const r = await tgCall("deleteWebhook", { drop_pending_updates: false });
    if (!r?.ok) throw new Error(r?.description || "deleteWebhook failed");
    return { ok: true };
  });

export const tgSendTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ chat_id: z.union([z.number(), z.string()]) }))
  .handler(async ({ data, context }) => {
    const { isAdmin } = await assertAdmin(context.userId);
    if (!isAdmin) throw new Error("Admin only");
    const { tgSendMessage } = await import("./telegram.server");
    const r = await tgSendMessage(data.chat_id, "✅ EscrowDesk test message — bot is wired up.");
    if (!r?.ok) throw new Error(r?.description || "send failed");
    return { ok: true };
  });

// ---------- Wallet addresses (replaces deposits) ----------
export const updateWalletAddresses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      wallet_address_btc: z.string().trim().max(120).optional().nullable(),
      wallet_address_usdt: z.string().trim().max(120).optional().nullable(),
      wallet_address_usdc: z.string().trim().max(120).optional().nullable(),
      wallet_address_usdc_chain: z.enum(["ERC20","TRC20"]).optional(),
      wallet_address_eth: z.string().trim().max(120).optional().nullable(),
    }),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, string | null> = {};
    if (data.wallet_address_btc !== undefined) patch.wallet_address_btc = data.wallet_address_btc || null;
    if (data.wallet_address_usdt !== undefined) patch.wallet_address_usdt = data.wallet_address_usdt || null;
    if (data.wallet_address_usdc !== undefined) patch.wallet_address_usdc = data.wallet_address_usdc || null;
    if (data.wallet_address_usdc_chain !== undefined) patch.wallet_address_usdc_chain = data.wallet_address_usdc_chain;
    if (data.wallet_address_eth !== undefined) patch.wallet_address_eth = data.wallet_address_eth || null;
    const { error } = await supabaseAdmin
      .from("profiles").update(patch as never).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Wallet PnL ----------
export const getWalletPnL = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const u = context.userId;
    const { data: trades } = await supabaseAdmin
      .from("trades")
      .select("asset, crypto_amount, fiat_amount, buyer_id, seller_id, status")
      .eq("status", "released")
      .or(`buyer_id.eq.${u},seller_id.eq.${u}`);
    const byAsset = new Map<string, { earned: number; spent: number }>();
    let totalEarnedUsd = 0, totalSpentUsd = 0;
    for (const t of trades ?? []) {
      const a = String(t.asset);
      const row = byAsset.get(a) ?? { earned: 0, spent: 0 };
      const crypto = Number(t.crypto_amount);
      const fiat = Number(t.fiat_amount);
      if (t.seller_id === u) { row.earned += crypto; totalEarnedUsd += fiat; }
      if (t.buyer_id === u)  { row.spent  += crypto; totalSpentUsd  += fiat; }
      byAsset.set(a, row);
    }
    return {
      per_asset: Array.from(byAsset, ([asset, v]) => ({ asset, ...v, net: v.earned - v.spent })),
      total_earned_usd: totalEarnedUsd,
      total_spent_usd: totalSpentUsd,
      net_usd: totalEarnedUsd - totalSpentUsd,
    };
  });

// ---------- Trade ratings ----------
export const submitRating = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      trade_id: z.string().uuid(),
      stars: z.number().int().min(1).max(5),
      comment: z.string().trim().max(500).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { data: t, error: te } = await supabaseAdmin
      .from("trades")
      .select("id,status,buyer_id,seller_id")
      .eq("id", data.trade_id)
      .maybeSingle();
    if (te) throw new Error(te.message);
    if (!t) throw new Error("Trade not found");
    if (t.status !== "released") throw new Error("Can only rate completed trades");
    const ratee =
      t.buyer_id === context.userId ? t.seller_id
      : t.seller_id === context.userId ? t.buyer_id
      : null;
    if (!ratee) throw new Error("Not a participant");
    const { error } = await supabaseAdmin.from("trade_ratings").insert({
      trade_id: data.trade_id,
      rater_id: context.userId,
      ratee_id: ratee,
      stars: data.stars,
      comment: data.comment ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getTradeRatings = createServerFn({ method: "GET" })
  .inputValidator(z.object({ trade_id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin
      .from("trade_ratings")
      .select("id,rater_id,ratee_id,stars,comment,created_at")
      .eq("trade_id", data.trade_id);
    if (error) throw new Error(error.message);
    return { ratings: rows ?? [] };
  });

// ---------- Badge progress (for current user) ----------
export const getBadgeProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const u = context.userId;
    const [{ data: prof }, { count: tradesCount }, ratings, partners, { data: roleRows }] = await Promise.all([
      supabaseAdmin.from("profiles").select("is_trusted,is_premium,btc_volume_usd,five_star_count,distinct_partners").eq("user_id", u).maybeSingle(),
      supabaseAdmin.from("trades").select("id", { count: "exact", head: true }).eq("status","released").or(`buyer_id.eq.${u},seller_id.eq.${u}`),
      supabaseAdmin.from("trade_ratings").select("rater_id,stars").eq("ratee_id", u),
      supabaseAdmin.from("trades").select("buyer_id,seller_id").eq("status","released").or(`buyer_id.eq.${u},seller_id.eq.${u}`),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", u),
    ]);
    const distinct4plus = new Set(
      (ratings.data ?? []).filter((r) => r.stars >= 4).map((r) => r.rater_id),
    ).size;
    const partnerCounts = new Map<string, number>();
    for (const t of partners.data ?? []) {
      const p = t.buyer_id === u ? t.seller_id : t.buyer_id;
      partnerCounts.set(p, (partnerCounts.get(p) ?? 0) + 1);
    }
    const maxRepeat = Math.max(0, ...Array.from(partnerCounts.values()));
    const isAdmin = (roleRows ?? []).some((r) => r.role === "admin");
    return {
      is_trusted: isAdmin || !!prof?.is_trusted,
      is_premium: isAdmin || !!prof?.is_premium,
      trades_completed: tradesCount ?? 0,
      distinct_4plus_raters: distinct4plus,
      max_repeat_partner: maxRepeat,
      btc_volume_usd: Number(prof?.btc_volume_usd ?? 0),
      five_star_count: prof?.five_star_count ?? 0,
    };
  });
