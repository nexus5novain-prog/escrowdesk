import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { tgCall, tgSendMessage } from "@/lib/telegram.server";

type HelpTopic = {
  key: string;
  label: string;
  title: string;
  body: string;
};

const HELP_TOPICS: HelpTopic[] = [
  {
    key: "start",
    label: "🚀 /start",
    title: "🚀 <b>/start</b> — Welcome &amp; quick start",
    body: [
      "Greets you and shows the main command list.",
      "Also used to link your account when followed by a code:",
      "",
      "<b>Usage</b>",
      "<code>/start</code>",
      "<code>/start AB12CD</code>   ← links via deep-link code",
    ].join("\n"),
  },
  {
    key: "link",
    label: "🔗 /link",
    title: "🔗 <b>/link CODE</b> — Link your web account",
    body: [
      "Connects this Telegram account to your EscrowDesk web profile.",
      "Generate a code in the web app: <i>Settings → Telegram → Generate code</i>.",
      "",
      "<b>Usage</b>",
      "<code>/link AB12CD</code>",
      "",
      "<b>Notes</b>",
      "• Codes expire after a few minutes",
      "• Each code can only be used once",
    ].join("\n"),
  },
  {
    key: "balance",
    label: "💼 /balance",
    title: "💼 <b>/balance</b> — Show wallet balances",
    body: [
      "Displays every asset wallet you own, with available and in-escrow amounts.",
      "",
      "<b>Usage</b>",
      "<code>/balance</code>",
      "",
      "<b>Example output</b>",
      "<code>USDT: 100.0000 (escrow 25.0000)</code>",
      "<code>BTC:  0.0050  (escrow 0.0000)</code>",
    ].join("\n"),
  },
  {
    key: "trades",
    label: "📋 /trades",
    title: "📋 <b>/trades</b> — List active trades",
    body: [
      "Shows up to 10 of your most recent trades that are not released or cancelled.",
      "Each row prints a short TRADE_ID prefix you can reuse with /release or /dispute.",
      "",
      "<b>Usage</b>",
      "<code>/trades</code>",
      "",
      "<b>Example row</b>",
      "<code>• 1a2b3c4d USDT 50 ↔ 50 EUR · funded</code>",
    ].join("\n"),
  },
  {
    key: "release",
    label: "✅ /release",
    title: "✅ <b>/release TRADE_ID</b> — Release escrow",
    body: [
      "Releases the escrowed crypto to the buyer. Only the seller can release.",
      "Accepts the 8-char prefix shown in /trades or the full UUID.",
      "",
      "<b>Usage</b>",
      "<code>/release TRADE_ID</code>",
      "",
      "<b>Examples</b>",
      "<code>/release 1a2b3c4d</code>",
      "<code>/release 1a2b3c4d-5e6f-7890-abcd-ef0123456789</code>",
    ].join("\n"),
  },
  {
    key: "dispute",
    label: "🚩 /dispute",
    title: "🚩 <b>/dispute TRADE_ID reason</b> — Open a dispute",
    body: [
      "Flags a trade for admin review. Reason must be at least 5 characters.",
      "",
      "<b>Usage</b>",
      "<code>/dispute TRADE_ID reason text…</code>",
      "",
      "<b>Examples</b>",
      "<code>/dispute 1a2b3c4d payment not received</code>",
      "<code>/dispute 1a2b3c4d wrong amount sent</code>",
    ].join("\n"),
  },
  {
    key: "terms",
    label: "📝 /terms",
    title: "📝 <b>/terms TRADE_ID text…</b> — Propose your terms",
    body: [
      "Save your side of the trade terms. Counterparty must read and sign with /sign.",
      "",
      "<b>Usage</b>",
      "<code>/terms TRADE_ID your terms…</code>",
      "",
      "<b>Example</b>",
      "<code>/terms 1a2b3c4d Payment in EUR via SEPA within 30 min.</code>",
    ].join("\n"),
  },
  {
    key: "sign",
    label: "✍️ /sign",
    title: "✍️ <b>/sign TRADE_ID PHRASE</b> — Sign the agreement",
    body: [
      "Sign the trade terms. Phrase must match EXACTLY (case-insensitive).",
      "",
      "<b>Buyer signs</b>",
      "<code>/sign TRADE_ID I AGREE TO TERMS AND CONDITIONS OF THE SELLER</code>",
      "",
      "<b>Seller signs</b>",
      "<code>/sign TRADE_ID I AGREE TO TERMS AND CONDITIONS OF THE BUYER</code>",
    ].join("\n"),
  },
  {
    key: "confirm",
    label: "✅ /confirm",
    title: "✅ <b>/confirm TRADE_ID</b> — Seller confirms deposit",
    body: [
      "Seller confirms they see the buyer's crypto locked in escrow.",
      "After this, buyer settles fiat off-platform then runs /release.",
      "",
      "<b>Usage</b>",
      "<code>/confirm TRADE_ID</code>",
    ].join("\n"),
  },
  {
    key: "release",
    label: "🎉 /release",
    title: "🎉 <b>/release TRADE_ID</b> — Release escrow to seller",
    body: [
      "Buyer releases the escrowed crypto to seller after receiving fiat.",
      "",
      "<b>Usage</b>",
      "<code>/release TRADE_ID</code>",
    ].join("\n"),
  },
  {
    key: "dispute",
    label: "🚩 /dispute",
    title: "🚩 <b>/dispute TRADE_ID reason</b> — Open a dispute",
    body: [
      "Flags a trade for judge/admin review. Reason must be at least 5 characters.",
      "",
      "<b>Usage</b>",
      "<code>/dispute TRADE_ID reason text…</code>",
    ].join("\n"),
  },
  {
    key: "fee",
    label: "⚙️ /fee (admin)",
    title: "⚙️ <b>/fee BPS</b> — Set legacy platform fee (admin)",
    body: [
      "Sets the legacy flat fee in basis points (overridden by tiered fees if present).",
      "",
      "<b>Usage</b>",
      "<code>/fee 250</code>   ← 2.50%",
    ].join("\n"),
  },
  {
    key: "ban",
    label: "🔨 /ban (staff)",
    title: "🔨 <b>/ban USER_ID reason</b> — Ban a user (admin/moderator)",
    body: [
      "Bans a user with a required reason. They lose trading access.",
      "",
      "<b>Usage</b>",
      "<code>/ban USER_ID reason text…</code>",
      "",
      "<b>Example</b>",
      "<code>/ban 9f1c0a3b fraud — multiple chargebacks</code>",
    ].join("\n"),
  },
  {
    key: "unban",
    label: "♻️ /unban (admin)",
    title: "♻️ <b>/unban USER_ID</b> — Unban a user (admin)",
    body: [
      "Lifts a ban. Only admins can unban.",
      "",
      "<b>Usage</b>",
      "<code>/unban USER_ID</code>",
    ].join("\n"),
  },
  {
    key: "warn",
    label: "⚠️ /warn (staff)",
    title: "⚠️ <b>/warn USER_ID severity reason</b> — Warn a user",
    body: [
      "Admin, moderator, or judge can issue warnings.",
      "Severity: <code>minor</code> | <code>major</code> | <code>final</code>",
      "",
      "<b>Usage</b>",
      "<code>/warn USER_ID severity reason…</code>",
      "",
      "<b>Example</b>",
      "<code>/warn 9f1c0a3b major slow response on dispute</code>",
    ].join("\n"),
  },
];

function helpMenuKeyboard() {
  const rows: { text: string; callback_data: string }[][] = [];
  for (let i = 0; i < HELP_TOPICS.length; i += 2) {
    rows.push(
      HELP_TOPICS.slice(i, i + 2).map((t) => ({
        text: t.label,
        callback_data: `help:${t.key}`,
      })),
    );
  }
  return { inline_keyboard: rows };
}

function helpTopicKeyboard() {
  return {
    inline_keyboard: [[{ text: "⬅️ Back to menu", callback_data: "help:menu" }]],
  };
}

function helpMenuText() {
  return [
    "<b>📖 EscrowDesk · Interactive Help</b>",
    "",
    "Tap a command below for detailed usage and examples.",
    "You can also type <code>/help &lt;command&gt;</code> — e.g. <code>/help release</code>.",
    "",
    "<b>Quick reference</b>",
    "🚀 <code>/start</code> — welcome",
    "🔗 <code>/link CODE</code> — link your web account",
    "💼 <code>/balance</code> — wallet balances",
    "📋 <code>/trades</code> — list active trades",
    "✅ <code>/release TRADE_ID</code> — release escrow",
    "🚩 <code>/dispute TRADE_ID reason</code> — open dispute",
    "⚙️ <code>/fee BPS</code> — set platform fee <i>(admin)</i>",
    "🔨 <code>/ban USER_ID</code> — ban a user <i>(admin)</i>",
  ].join("\n");
}


function expectedSecret() {
  const TK = process.env.TELEGRAM_API_KEY || "";
  return createHash("sha256").update(`telegram-webhook:${TK}`).digest("base64url");
}
function safeEq(a: string, b: string) {
  const A = Buffer.from(a), B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

async function handleCallback(cb: Record<string, unknown>) {
  const id = cb.id as string;
  const data = (cb.data as string | undefined) ?? "";
  const msg = cb.message as { chat: { id: number }; message_id: number } | undefined;
  await tgCall("answerCallbackQuery", { callback_query_id: id });
  if (!msg) return;
  if (data === "help:menu") {
    return tgCall("editMessageText", {
      chat_id: msg.chat.id,
      message_id: msg.message_id,
      text: helpMenuText(),
      parse_mode: "HTML",
      reply_markup: helpMenuKeyboard(),
    });
  }
  if (data.startsWith("help:")) {
    const key = data.slice(5);
    const topic = HELP_TOPICS.find((t) => t.key === key);
    if (!topic) return;
    return tgCall("editMessageText", {
      chat_id: msg.chat.id,
      message_id: msg.message_id,
      text: `${topic.title}\n\n${topic.body}`,
      parse_mode: "HTML",
      reply_markup: helpTopicKeyboard(),
    });
  }
}

async function handle(update: Record<string, unknown>) {
  if (update.callback_query) {
    return handleCallback(update.callback_query as Record<string, unknown>);
  }
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
    const arg = text.split(" ")[1]?.toLowerCase().replace(/^\//, "");
    if (arg) {
      const topic = HELP_TOPICS.find((t) => t.key === arg);
      if (topic) {
        return tgCall("sendMessage", {
          chat_id: chat.id,
          text: `${topic.title}\n\n${topic.body}`,
          parse_mode: "HTML",
          reply_markup: helpTopicKeyboard(),
        });
      }
      return send(`Unknown help topic <code>${arg}</code>. Try /help`);
    }
    return tgCall("sendMessage", {
      chat_id: chat.id,
      text: helpMenuText(),
      parse_mode: "HTML",
      reply_markup: helpMenuKeyboard(),
    });
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
  if (text.startsWith("/terms")) {
    // /terms TRADE_ID my terms text...
    const parts = text.split(" ");
    const idArg = parts[1];
    const termsText = parts.slice(2).join(" ").trim();
    if (!idArg || !termsText) return send("Usage: <code>/terms TRADE_ID your terms text</code>");
    const full = await resolveTradeId(idArg, profile.user_id);
    if (!full) return send("Trade not found.");
    const { data: tr } = await supabaseAdmin.from("trades").select("buyer_id, seller_id").eq("id", full).maybeSingle();
    if (!tr) return send("Trade not found.");
    const col = tr.buyer_id === profile.user_id ? "terms_buyer" : tr.seller_id === profile.user_id ? "terms_seller" : null;
    if (!col) return send("You are not a party to this trade.");
    const patch = (col === "terms_buyer" ? { terms_buyer: termsText } : { terms_seller: termsText });
    const { error } = await supabaseAdmin.from("trades").update(patch).eq("id", full);
    return send(error ? `❌ ${error.message}` : `📝 Terms saved for trade <code>${full.slice(0,8)}</code>. Counterparty can read them with /trade ${full.slice(0,8)}, then sign with /sign.`);
  }
  if (text.startsWith("/sign")) {
    // /sign TRADE_ID I AGREE TO TERMS AND CONDITIONS OF THE SELLER
    const parts = text.split(" ");
    const idArg = parts[1];
    const phrase = parts.slice(2).join(" ").trim();
    if (!idArg || !phrase) return send("Usage:\n<code>/sign TRADE_ID I AGREE TO TERMS AND CONDITIONS OF THE SELLER</code> (if you're the buyer)\n<code>/sign TRADE_ID I AGREE TO TERMS AND CONDITIONS OF THE BUYER</code> (if you're the seller)");
    const full = await resolveTradeId(idArg, profile.user_id);
    if (!full) return send("Trade not found.");
    const { error } = await supabaseAdmin.rpc("sign_terms", { _trade_id: full, _caller: profile.user_id, _signature: phrase, _terms: null as unknown as string });
    return send(error ? `❌ ${error.message}` : `✍️ Signed trade <code>${full.slice(0,8)}</code>.`);
  }
  if (text.startsWith("/confirm")) {
    const idArg = text.split(" ")[1];
    if (!idArg) return send("Usage: <code>/confirm TRADE_ID</code> (seller confirms buyer's escrow deposit)");
    const full = await resolveTradeId(idArg, profile.user_id);
    if (!full) return send("Trade not found.");
    const { error } = await supabaseAdmin.rpc("confirm_buyer_deposit", { _trade_id: full, _caller: profile.user_id });
    return send(error ? `❌ ${error.message}` : `✅ Deposit confirmed on trade <code>${full.slice(0,8)}</code>. Buyer can now release.`);
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
