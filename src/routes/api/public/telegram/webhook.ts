import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { tgCall, tgSendMessage } from "@/lib/telegram.server";

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type HelpScope = "user" | "staff" | "admin";
type HelpTopic = {
  key: string;
  label: string;
  title: string;
  body: string;
  scope?: HelpScope; // defaults to "user"
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
  // (release/dispute defined below with richer content)
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
    scope: "admin",
    body: [
      "Sets the legacy flat fee in basis points (overridden by tiered fees if present).",
      "",
      "<b>Usage</b>",
      "<code>/fee 250</code>   ← 2.50%",
    ].join("\n"),
  },
  {
    key: "profile",
    label: "👤 /profile",
    title: "👤 <b>/profile</b> — View your profile &amp; stats",
    body: [
      "Shows your display name, bio, trading stats, badges, and membership status.",
      "",
      "<b>Usage</b>",
      "<code>/profile</code>",
    ].join("\n"),
  },
  {
    key: "purchases",
    label: "🛍️ /purchases",
    title: "🛍️ <b>/purchases</b> — List your marketplace purchases",
    body: [
      "Shows your last 10 completed marketplace buys with product names, prices, and dates.",
      "Full card details are only available in the web app Trade Library after escrow release.",
      "",
      "<b>Usage</b>",
      "<code>/purchases</code>",
    ].join("\n"),
  },
  {
    key: "premium",
    label: "👑 /premium",
    title: "👑 <b>/premium</b> — Check or request Premium membership",
    body: [
      "Shows your current Premium status and benefits.",
      "Premium costs $50 for 3 months. Activate via Settings in the web app.",
      "",
      "<b>Usage</b>",
      "<code>/premium</code>",
    ].join("\n"),
  },
  {
    key: "ban",
    label: "🔨 /ban (staff)",
    title: "🔨 <b>/ban USER_ID reason</b> — Ban a user (admin/moderator)",
    scope: "staff",
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
    scope: "admin",
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
    scope: "staff",
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

function topicsForRoles(roles: string[]): HelpTopic[] {
  const isAdmin = roles.includes("admin");
  const isStaff = isAdmin || roles.some((r) => ["moderator","judge","finance","support"].includes(r));
  return HELP_TOPICS.filter((t) => {
    const s = t.scope ?? "user";
    if (s === "admin") return isAdmin;
    if (s === "staff") return isStaff;
    return true;
  });
}

function helpMenuKeyboard(topics: HelpTopic[] = HELP_TOPICS) {
  const rows: { text: string; callback_data: string }[][] = [];
  for (let i = 0; i < topics.length; i += 2) {
    rows.push(
      topics.slice(i, i + 2).map((t) => ({
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

function helpMenuText(topics: HelpTopic[] = HELP_TOPICS, roles: string[] = []) {
  const roleBadge = roles.length ? ` <i>(roles: ${roles.join(", ")})</i>` : "";
  const lines = [
    `<b>📖 EscrowDesk · Interactive Help</b>${roleBadge}`,
    "",
    "Tap a command below for detailed usage and examples.",
    "You can also type <code>/help &lt;command&gt;</code> — e.g. <code>/help sign</code>.",
    "",
    "<b>Quick reference</b>",
  ];
  for (const t of topics) {
    // Strip the leading emoji + key chunk from label and reuse title's first segment
    lines.push(`${t.label}`);
  }
  return lines.join("\n");
}

async function getRoles(userId: string): Promise<string[]> {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r) => r.role as string);
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
  const from = cb.from as { id: number } | undefined;
  await tgCall("answerCallbackQuery", { callback_query_id: id });
  if (!msg) return;

  // Look up roles for this Telegram user (if linked) for role-aware help
  let roles: string[] = [];
  if (from?.id) {
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("user_id").eq("telegram_user_id", from.id).maybeSingle();
    if (prof?.user_id) roles = await getRoles(prof.user_id);
  }
  const visible = topicsForRoles(roles);

  if (data === "help:menu") {
    return tgCall("editMessageText", {
      chat_id: msg.chat.id,
      message_id: msg.message_id,
      text: helpMenuText(visible, roles),
      parse_mode: "HTML",
      reply_markup: helpMenuKeyboard(visible),
    });
  }
  if (data.startsWith("help:")) {
    const key = data.slice(5);
    const topic = visible.find((t) => t.key === key) ?? HELP_TOPICS.find((t) => t.key === key);
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
    .select("user_id, display_name, is_banned, ban_reason")
    .eq("telegram_user_id", tgId)
    .maybeSingle();

  const send = (t: string) => tgSendMessage(chat.id, t);
  const roles = profile?.user_id ? await getRoles(profile.user_id) : [];
  const isAdmin = roles.includes("admin");
  const isModerator = isAdmin || roles.includes("moderator");
  const isJudge = isAdmin || roles.includes("judge");
  const visibleTopics = topicsForRoles(roles);

  if (text.startsWith("/start")) {
    const arg = text.split(" ")[1];
    if (arg) {
      // Disambiguate: 6-char alnum = link code, 24-char hex = escrow group token
      if (/^[0-9a-f]{24}$/i.test(arg)) {
        if (!profile) return send("⚠️ Link your account first: /link CODE (from web Settings → Telegram).");
        return handleEscrowBind(chat.id, arg, profile.user_id);
      }
      return handleLink(chat.id, tgId, from, arg);
    }
    return tgCall("sendMessage", {
      chat_id: chat.id,
      text: helpMenuText(visibleTopics, roles),
      parse_mode: "HTML",
      reply_markup: helpMenuKeyboard(visibleTopics),
    });
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
      text: helpMenuText(visibleTopics, roles),
      parse_mode: "HTML",
      reply_markup: helpMenuKeyboard(visibleTopics),
    });
  }
  if (text.startsWith("/link")) {
    const code = text.split(" ")[1]?.trim();
    if (!code) return send("Usage: /link CODE");
    return handleLink(chat.id, tgId, from, code);
  }

  if (!profile) return send("⚠️ Your Telegram isn't linked. Generate a code in the web app → Settings → Telegram, then send /link CODE.");

  // Ban gate: banned users can only use /help, /start, /link
  if (profile.is_banned) {
    return send(`🚫 Your account is banned.${profile.ban_reason ? `\nReason: ${profile.ban_reason}` : ""}\nContact support if you believe this is a mistake.`);
  }

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
    if (!isAdmin) return send("Admin only.");
    const n = Number(text.split(" ")[1]);
    if (!Number.isFinite(n) || n < 0 || n > 1000) return send("Usage: /fee BPS (0..1000)");
    await supabaseAdmin.from("platform_settings").upsert({ key: "fee_bps", value: n, updated_at: new Date().toISOString() });
    return send(`✅ Fee set to ${n} bps`);
  }
  if (text.startsWith("/ban")) {
    if (!isModerator) return send("Admin or moderator only.");
    const parts = text.split(" ");
    const target = parts[1];
    const reason = parts.slice(2).join(" ").trim();
    if (!target || reason.length < 3) return send("Usage: <code>/ban USER_ID reason text…</code> (reason min 3 chars)");
    const { error } = await supabaseAdmin.rpc("ban_user", { _target: target, _caller: profile.user_id, _reason: reason });
    return send(error ? `❌ ${error.message}` : `🔨 Banned <code>${target.slice(0,8)}</code>: ${reason}`);
  }
  if (text.startsWith("/unban")) {
    if (!isAdmin) return send("Admin only.");
    const target = text.split(" ")[1];
    if (!target) return send("Usage: <code>/unban USER_ID</code>");
    const { error } = await supabaseAdmin.rpc("unban_user", { _target: target, _caller: profile.user_id });
    return send(error ? `❌ ${error.message}` : `♻️ Unbanned <code>${target.slice(0,8)}</code>`);
  }
  if (text.startsWith("/warn")) {
    if (!(isAdmin || isModerator || isJudge)) return send("Admin, moderator, or judge only.");
    const parts = text.split(" ");
    const target = parts[1];
    const severity = (parts[2] || "").toLowerCase();
    const reason = parts.slice(3).join(" ").trim();
    if (!target || !["minor","major","final"].includes(severity) || reason.length < 3) {
      return send("Usage: <code>/warn USER_ID severity reason</code>\nseverity = minor | major | final");
    }
    const { error } = await supabaseAdmin.rpc("warn_user", { _target: target, _caller: profile.user_id, _reason: reason, _severity: severity });
    return send(error ? `❌ ${error.message}` : `⚠️ Warned <code>${target.slice(0,8)}</code> (${severity})`);
  }

  // ---------- Escrow group commands ----------
  // Resolve which escrow group this chat is bound to (if any)
  const { data: boundGroup } = await supabaseAdmin
    .from("escrow_groups").select("id, status, creator_id, counterparty_id, escrow_address, asset, amount")
    .eq("telegram_chat_id", chat.id).maybeSingle();

  if (text.startsWith("/escrow_bind") || text.startsWith("/bind")) {
    const token = text.split(" ")[1]?.trim();
    if (!token) return send("Usage: <code>/bind GROUP_TOKEN</code> (get the token from the website escrow page)");
    return handleEscrowBind(chat.id, token, profile.user_id);
  }

  if (text.startsWith("/escrow_status") || text.startsWith("/status")) {
    if (!boundGroup) return send("This chat isn't bound to an escrow group. Use /bind TOKEN first.");
    return sendGroupStatus(chat.id, boundGroup.id);
  }

  if (text.startsWith("/txhash")) {
    const hash = text.split(" ").slice(1).join(" ").trim();
    if (!hash) return send("Usage: <code>/txhash 0x…</code>");
    const group = boundGroup ?? (await groupForUser(profile.user_id));
    if (!group) return send("No active escrow group found for you.");
    if (group.creator_id !== profile.user_id) return send("Only the buyer can submit the tx hash.");
    if (!["active","awaiting_counterparty"].includes(String(group.status))) return send("Cannot submit hash in current state.");
    await supabaseAdmin.from("escrow_groups").update({ deposit_tx_hash: hash, status: "funded" } as never).eq("id", group.id);
    await insertGroupSystem(group.id, `💸 Buyer submitted deposit tx hash via Telegram: ${hash}. Awaiting seller verification.`);
    return send(`✅ Tx hash recorded. Seller will verify and release.`);
  }

  if (text.startsWith("/release_group") || text === "/release_g") {
    const group = boundGroup ?? (await groupForUser(profile.user_id));
    if (!group) return send("No active escrow group found.");
    if (group.counterparty_id !== profile.user_id) return send("Only the seller can release.");
    if (group.status !== "funded") return send("Group is not in funded state.");
    await supabaseAdmin.from("escrow_groups").update({ status: "released", released_at: new Date().toISOString() } as never).eq("id", group.id);
    await insertGroupSystem(group.id, `✅ Trade released via Telegram. Funds delivered to ${group.escrow_address ?? "seller address"}.`);
    return send(`✅ Released.`);
  }

  if (text.startsWith("/cancel_group")) {
    const group = boundGroup ?? (await groupForUser(profile.user_id));
    if (!group) return send("No active escrow group found.");
    if (![group.creator_id, group.counterparty_id].includes(profile.user_id)) return send("Not a participant.");
    if (["released","cancelled"].includes(String(group.status))) return send("Already closed.");
    await supabaseAdmin.from("escrow_groups").update({ status: "cancelled" } as never).eq("id", group.id);
    await insertGroupSystem(group.id, `❌ Group cancelled via Telegram by ${profile.display_name}.`);
    return send("❌ Cancelled.");
  }

  if (text.startsWith("/invite_moderator") || text.startsWith("/invite_mod") || text.startsWith("/judge")) {
    const group = boundGroup ?? (await groupForUser(profile.user_id));
    if (!group) return send("No active escrow group found.");
    if (![group.creator_id, group.counterparty_id].includes(profile.user_id)) return send("Not a participant.");
    const { data: judges } = await supabaseAdmin
      .from("user_roles").select("user_id, role").in("role", ["judge","moderator","admin"]);
    const ids = Array.from(new Set((judges ?? []).map((j) => j.user_id)));
    if (!ids.length) return send("No moderators available right now.");
    const { data: existing } = await supabaseAdmin
      .from("escrow_group_members").select("user_id").eq("group_id", group.id).in("user_id", ids);
    const taken = new Set((existing ?? []).map((e) => e.user_id));
    const pick = ids.find((id) => !taken.has(id));
    if (!pick) return send("All available moderators already in this group.");
    await supabaseAdmin.from("escrow_group_members").insert({ group_id: group.id, user_id: pick, role: "moderator" } as never);
    await insertGroupSystem(group.id, `🧑‍⚖️ Moderator invited via Telegram by ${profile.display_name}.`);
    const { data: modProf } = await supabaseAdmin.from("profiles").select("telegram_user_id, display_name").eq("user_id", pick).maybeSingle();
    if (modProf?.telegram_user_id) {
      await tgSendMessage(Number(modProf.telegram_user_id),
        `🧑‍⚖️ You've been added as moderator to escrow group <code>${group.id.slice(0,8)}</code>.`);
    }
    return send(`✅ Moderator invited${modProf?.display_name ? ` (${modProf.display_name})` : ""}.`);
  }

  if (text.startsWith("/profile")) {
    const { data: p } = await supabaseAdmin.from("profiles").select("display_name, bio, trades_completed, btc_volume_usd, is_trusted, is_premium, five_star_count, created_at").eq("user_id", profile.user_id).maybeSingle();
    if (!p) return send("Profile not found.");
    const badges = [p.is_trusted ? "✅ Trusted" : null, p.is_premium ? "👑 Premium" : null].filter(Boolean).join(" · ") || "None";
    return send([
      `👤 <b>${escapeHtml(p.display_name ?? profile.display_name ?? "—")}</b>`,
      p.bio ? `<i>${escapeHtml(p.bio)}</i>` : null,
      "",
      `📊 <b>Stats</b>`,
      `Trades: ${p.trades_completed ?? 0}`,
      `5-star reviews: ${p.five_star_count ?? 0}`,
      `Volume: $${Number(p.btc_volume_usd ?? 0).toLocaleString()}`,
      "",
      `🏆 <b>Badges</b>: ${badges}`,
      "",
      `Joined: ${new Date(p.created_at).toLocaleDateString()}`,
    ].filter(Boolean).join("\n"));
  }

  if (text.startsWith("/premium")) {
    const { data: p } = await supabaseAdmin.from("profiles").select("is_premium").eq("user_id", profile.user_id).maybeSingle();
    if (p?.is_premium) {
      return send("👑 <b>Premium Status</b>\n\nYou have an active Premium membership.\n\nBenefits:\n• Priority dispute resolution\n• Premium badge on profile\n• Access to premium listings\n\nTo check expiry, visit Settings in the web app.");
    }
    return send("💎 <b>Premium Membership</b>\n\nYou are not yet a Premium member.\n\nPremium costs <b>$50 for 3 months</b> and includes:\n• 👑 Premium badge on your profile\n• Priority dispute resolution\n• Exclusive premium listings\n• Higher trade limits\n\nTo upgrade, go to: Settings → Premium in the web app, then request and pay an admin.");
  }

  if (text.startsWith("/purchases")) {
    const { data: groups } = await supabaseAdmin
      .from("escrow_groups")
      .select("id, listing_id, fiat_amount, fiat_currency, released_at")
      .eq("creator_id", profile.user_id)
      .eq("status", "released")
      .not("listing_id", "is", null)
      .order("released_at", { ascending: false })
      .limit(10);
    if (!groups?.length) return send("🛍️ No completed marketplace purchases yet.\n\nBrowse the Marketplace at /shop and buy items with escrow protection. After release, they appear here.");
    const listingIds = groups.map((g) => g.listing_id!);
    const { data: listings } = await supabaseAdmin.from("listings").select("id, name").in("id", listingIds);
    const lmap = new Map((listings ?? []).map((l) => [l.id, l.name]));
    const lines = groups.map((g) => {
      const name = g.listing_id ? (lmap.get(g.listing_id) ?? "Unknown") : "Unknown";
      const price = g.fiat_amount ? ` · $${g.fiat_amount} ${g.fiat_currency ?? "USD"}` : "";
      const date = g.released_at ? new Date(g.released_at).toLocaleDateString() : "?";
      return `• ${escapeHtml(name)}${price} — ${date}`;
    });
    return send(`🛍️ <b>My Purchases (${groups.length})</b>\n\n${lines.join("\n")}\n\nFull details in web app → Trade Library`);
  }

  // Mirror plain (non-command) messages from a bound TG chat into the website group chat
  if (boundGroup && !text.startsWith("/")) {
    await supabaseAdmin.from("escrow_group_messages").insert({
      group_id: boundGroup.id, sender_id: profile.user_id, body: text, from_telegram: true,
    } as never);
    return;
  }

  return send("Unknown command. Try /help");
}

async function groupForUser(userId: string) {
  const { data } = await supabaseAdmin
    .from("escrow_groups")
    .select("id, status, creator_id, counterparty_id, escrow_address, asset, amount")
    .or(`creator_id.eq.${userId},counterparty_id.eq.${userId}`)
    .not("status", "in", "(released,cancelled)")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data;
}

async function insertGroupSystem(groupId: string, body: string) {
  await supabaseAdmin.from("escrow_group_messages").insert({ group_id: groupId, body, is_system: true } as never);
  const { data: g } = await supabaseAdmin.from("escrow_groups").select("telegram_chat_id").eq("id", groupId).maybeSingle();
  if (g?.telegram_chat_id) await tgSendMessage(Number(g.telegram_chat_id), `<i>${body.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</i>`);
}

async function handleEscrowBind(chatId: number, token: string, userId: string) {
  const { data: g } = await supabaseAdmin
    .from("escrow_groups").select("id, creator_id, counterparty_id, telegram_chat_id")
    .eq("telegram_link_token", token).maybeSingle();
  if (!g) return tgSendMessage(chatId, "❌ Unknown escrow token.");
  if (![g.creator_id, g.counterparty_id].includes(userId)) return tgSendMessage(chatId, "❌ You're not a participant of that group.");
  if (g.telegram_chat_id && Number(g.telegram_chat_id) !== chatId) return tgSendMessage(chatId, "❌ Group already bound to another chat.");
  await supabaseAdmin.from("escrow_groups").update({ telegram_chat_id: chatId } as never).eq("id", g.id);
  await insertGroupSystem(g.id, `🔗 Telegram chat linked to this escrow group.`);
  return tgSendMessage(chatId, `✅ Telegram chat bound. Use /status, /txhash, /release_group, /cancel_group, /invite_moderator. Plain messages here mirror to the web chat.`);
}

async function sendGroupStatus(chatId: number, groupId: string) {
  const { data: g } = await supabaseAdmin
    .from("escrow_groups").select("*").eq("id", groupId).maybeSingle();
  if (!g) return tgSendMessage(chatId, "Group not found.");
  return tgSendMessage(chatId, [
    `<b>Escrow ${String(g.id).slice(0,8)}</b>`,
    `Status: <code>${g.status}</code>`,
    `${g.amount} ${g.asset}${g.fiat_amount ? ` (≈ ${g.fiat_amount} ${g.fiat_currency})` : ""}`,
    g.escrow_address ? `Payout: <code>${g.escrow_address}</code>` : null,
    g.deposit_tx_hash ? `Tx: <code>${g.deposit_tx_hash}</code>` : null,
  ].filter(Boolean).join("\n"));
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
