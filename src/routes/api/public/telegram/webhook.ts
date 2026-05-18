import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { tgSendMessage } from "@/lib/telegram.server";

function expectedSecret() {
  const TK = process.env.TELEGRAM_API_KEY || "";
  return createHash("sha256").update(`telegram-webhook:${TK}`).digest("base64url");
}
function safeEq(a: string, b: string) {
  const A = Buffer.from(a), B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

async function handle(update: Record<string, unknown>) {
  const message = (update.message ?? update.edited_message) as Record<string, unknown> | undefined;
  if (!message) return;
  const chat = message.chat as { id: number };
  const from = message.from as { id: number; username?: string; first_name?: string };
  const text = (message.text as string | undefined) ?? "";
  const tgId = from.id;

  // Find linked user
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("user_id, display_name")
    .eq("telegram_user_id", tgId)
    .maybeSingle();

  const send = (t: string) => tgSendMessage(chat.id, t);

  if (text.startsWith("/start")) {
    const arg = text.split(" ")[1];
    if (arg) return handleLink(chat.id, tgId, from, arg);
    return send("👋 Welcome to <b>EscrowDesk</b>.\n\nCommands:\n/link CODE – link your web account\n/balance – your wallets\n/trades – your active trades\n/release ID – release a trade\n/dispute ID reason – open a dispute\n/help");
  }
  if (text.startsWith("/help")) {
    return send(
      [
        "<b>📖 EscrowDesk Commands</b>",
        "",
        "<b>Account</b>",
        "• <code>/start</code> — welcome &amp; quick start",
        "• <code>/link CODE</code> — link your web account",
        "   ex: <code>/link AB12CD</code>",
        "",
        "<b>Wallets &amp; Trades</b>",
        "• <code>/balance</code> — show wallet balances",
        "• <code>/trades</code> — list your active trades",
        "",
        "<b>Escrow Actions</b>",
        "• <code>/release TRADE_ID</code> — release escrow to buyer",
        "   ex: <code>/release 1a2b3c4d</code>",
        "• <code>/dispute TRADE_ID reason</code> — open a dispute (reason ≥ 5 chars)",
        "   ex: <code>/dispute 1a2b3c4d payment not received</code>",
        "",
        "<b>Admin</b>",
        "• <code>/fee BPS</code> — set platform fee in basis points (0–1000)",
        "   ex: <code>/fee 50</code> = 0.50%",
        "• <code>/ban USER_ID</code> — ban a user",
        "",
        "<i>Tip: TRADE_ID accepts the first 8 chars shown in /trades.</i>",
      ].join("\n")
    );
  }
  if (text.startsWith("/link")) {
    const code = text.split(" ")[1]?.trim();
    if (!code) return send("Usage: /link CODE");
    return handleLink(chat.id, tgId, from, code);
  }

  if (!profile) return send("⚠️ Your Telegram isn't linked. Generate a code in the web app → Settings → Telegram, then send /link CODE.");

  if (text.startsWith("/balance")) {
    const { data: w } = await supabaseAdmin.from("wallets").select("asset, available, escrow").eq("user_id", profile.user_id);
    const lines = (w ?? []).map((r) => `${r.asset}: <code>${Number(r.available).toFixed(4)}</code> (escrow ${Number(r.escrow).toFixed(4)})`).join("\n");
    return send(`💼 <b>Balance</b>\n${lines || "—"}`);
  }
  if (text.startsWith("/trades")) {
    const { data: t } = await supabaseAdmin.from("trades")
      .select("id, status, asset, crypto_amount, fiat_amount, fiat_currency")
      .or(`buyer_id.eq.${profile.user_id},seller_id.eq.${profile.user_id}`)
      .neq("status", "released").neq("status", "cancelled").order("created_at", { ascending: false }).limit(10);
    if (!t?.length) return send("No active trades.");
    return send("📋 <b>Active trades</b>\n" + t.map((x) => `• <code>${x.id.slice(0,8)}</code> ${x.asset} ${x.crypto_amount} ↔ ${x.fiat_amount} ${x.fiat_currency} · ${x.status}`).join("\n"));
  }
  if (text.startsWith("/release")) {
    const id = text.split(" ")[1]?.trim();
    if (!id) return send("Usage: /release TRADE_ID");
    const full = await resolveTradeId(id, profile.user_id);
    if (!full) return send("Trade not found.");
    const { error } = await supabaseAdmin.rpc("release_trade", { _trade_id: full, _caller: profile.user_id });
    return send(error ? `❌ ${error.message}` : `✅ Released ${full.slice(0,8)}`);
  }
  if (text.startsWith("/dispute")) {
    const parts = text.split(" "); const id = parts[1]; const reason = parts.slice(2).join(" ");
    if (!id || reason.length < 5) return send("Usage: /dispute TRADE_ID reason (min 5 chars)");
    const full = await resolveTradeId(id, profile.user_id);
    if (!full) return send("Trade not found.");
    const { error } = await supabaseAdmin.rpc("open_dispute", { _trade_id: full, _caller: profile.user_id, _reason: reason });
    return send(error ? `❌ ${error.message}` : `🚩 Dispute opened for ${full.slice(0,8)}`);
  }
  if (text.startsWith("/fee")) {
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", profile.user_id);
    if (!roles?.some((r) => r.role === "admin")) return send("Admin only.");
    const n = Number(text.split(" ")[1]);
    if (!Number.isFinite(n) || n < 0 || n > 1000) return send("Usage: /fee BPS (0..1000)");
    await supabaseAdmin.from("platform_settings").upsert({ key: "fee_bps", value: n, updated_at: new Date().toISOString() });
    return send(`✅ Fee set to ${n} bps`);
  }
  if (text.startsWith("/ban")) {
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", profile.user_id);
    if (!roles?.some((r) => r.role === "admin")) return send("Admin only.");
    const target = text.split(" ")[1];
    if (!target) return send("Usage: /ban USER_ID");
    await supabaseAdmin.from("profiles").update({ is_banned: true }).eq("user_id", target);
    return send(`🔨 Banned ${target.slice(0,8)}`);
  }
  return send("Unknown command. Try /help");
}

async function resolveTradeId(prefix: string, userId: string) {
  // accept full uuid or 8-char prefix
  const { data } = await supabaseAdmin.from("trades")
    .select("id").or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .ilike("id", `${prefix}%`).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function handleLink(chatId: number, tgId: number, from: { username?: string; first_name?: string }, code: string) {
  const { data: row } = await supabaseAdmin.from("telegram_link_codes").select("*").eq("code", code.toUpperCase()).maybeSingle();
  if (!row) return tgSendMessage(chatId, "❌ Invalid code.");
  if (row.used_at) return tgSendMessage(chatId, "❌ Code already used.");
  if (new Date(row.expires_at).getTime() < Date.now()) return tgSendMessage(chatId, "❌ Code expired.");
  await supabaseAdmin.from("profiles").update({
    telegram_user_id: tgId, telegram_username: from.username ?? from.first_name ?? null,
  }).eq("user_id", row.user_id);
  await supabaseAdmin.from("telegram_link_codes").update({ used_at: new Date().toISOString() }).eq("code", row.code);
  return tgSendMessage(chatId, "✅ Telegram linked! You'll now get trade alerts and can use commands like /balance, /trades, /release.");
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEq(provided, expectedSecret())) return new Response("Unauthorized", { status: 401 });
        try {
          const update = await request.json();
          await handle(update);
        } catch (e) {
          console.error("[tg-webhook]", e);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      },
    },
  },
});
