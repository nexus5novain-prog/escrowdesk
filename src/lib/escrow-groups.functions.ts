import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { tgSendMessage } from "./telegram.server";

type ProfileLite = { user_id: string; display_name: string; telegram_user_id: number | null; telegram_username: string | null; wallet_address_btc: string | null };

const ASSETS = ["BTC", "USDT", "USDC", "ETH"] as const;
type Asset = typeof ASSETS[number];

async function loadProfiles(userIds: string[]) {
  if (!userIds.length) return new Map<string, ProfileLite>();
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("user_id, display_name, telegram_user_id, telegram_username, wallet_address_btc")
    .in("user_id", userIds);
  return new Map((data ?? []).map((p) => [p.user_id, p as ProfileLite]));
}

type ListingLite = { id: string; name: string; description: string; category: string; contact_website: string | null; currency: string | null; amount: number | null };

async function loadListings(listingIds: string[]) {
  if (!listingIds.length) return new Map<string, ListingLite>();
  const { data } = await supabaseAdmin
    .from("listings")
    .select("id, name, description, category, contact_website, currency, amount")
    .in("id", listingIds);
  return new Map((data ?? []).map((row) => [row.id, row as ListingLite]));
}

async function getSellerPayoutAddress(userId: string, asset: Asset): Promise<{ address: string | null; chain: string | null }> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("wallet_address_btc, wallet_address_usdt, wallet_address_usdc, wallet_address_usdc_chain, wallet_address_eth")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return { address: null, chain: null };
  const d = data as Record<string, string | null>;
  switch (asset) {
    case "BTC":  return { address: d.wallet_address_btc, chain: "BTC" };
    case "USDT": return { address: d.wallet_address_usdt, chain: "TRC20" };
    case "USDC": return { address: d.wallet_address_usdc, chain: d.wallet_address_usdc_chain ?? "ERC20" };
    case "ETH":  return { address: d.wallet_address_eth, chain: "ETH" };
  }
}

async function ensureMember(groupId: string, userId: string) {
  const { data } = await supabaseAdmin
    .from("escrow_group_members").select("user_id").eq("group_id", groupId).eq("user_id", userId).maybeSingle();
  if (!data) throw new Error("Not a member of this group");
}

async function systemMsg(groupId: string, body: string) {
  await supabaseAdmin.from("escrow_group_messages").insert({ group_id: groupId, body, is_system: true });
  // Mirror system message to telegram if bound
  const { data: g } = await supabaseAdmin.from("escrow_groups").select("telegram_chat_id").eq("id", groupId).maybeSingle();
  if (g?.telegram_chat_id) await tgSendMessage(g.telegram_chat_id, `<i>${escapeHtml(body)}</i>`);
}

function escapeHtml(s: string) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// -------- Create a group --------
export const createEscrowGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    asset: z.enum(ASSETS),
    amount: z.number().positive(),
    fiat_amount: z.number().positive().optional(),
    fiat_currency: z.string().min(3).max(8).default("USD"),
    counterparty_username: z.string().trim().max(80).optional(),
    counterparty_telegram: z.string().trim().max(80).optional(),
    listing_id: z.string().uuid().optional(),
  }))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Resolve seller — if listing supplied, owner is the seller; otherwise try by username/telegram
    let sellerId: string | null = null;
    let sellerAddress: { address: string | null; chain: string | null } = { address: null, chain: null };

    if (data.listing_id) {
      const { data: l } = await supabaseAdmin.from("listings").select("user_id").eq("id", data.listing_id).maybeSingle();
      if (!l) throw new Error("Listing not found");
      sellerId = l.user_id;
    } else if (data.counterparty_username) {
      const handle = data.counterparty_username.replace(/^@/, "");
      const { data: p } = await supabaseAdmin
        .from("profiles").select("user_id")
        .ilike("display_name", handle).maybeSingle();
      if (p) sellerId = p.user_id;
    } else if (data.counterparty_telegram) {
      const tg = data.counterparty_telegram.replace(/^@/, "");
      const { data: p } = await supabaseAdmin
        .from("profiles").select("user_id")
        .ilike("telegram_username", tg).maybeSingle();
      if (p) sellerId = p.user_id;
    }

    if (sellerId && sellerId === userId) throw new Error("Cannot invite yourself");
    if (sellerId) sellerAddress = await getSellerPayoutAddress(sellerId, data.asset);

    const { data: g, error } = await supabaseAdmin.from("escrow_groups").insert({
      creator_id: userId,
      counterparty_id: sellerId,
      invited_username: data.counterparty_username ?? null,
      invited_telegram: data.counterparty_telegram ?? null,
      listing_id: data.listing_id ?? null,
      asset: data.asset,
      amount: data.amount,
      fiat_amount: data.fiat_amount ?? null,
      fiat_currency: data.fiat_currency,
      escrow_address: sellerAddress.address,
      escrow_address_chain: sellerAddress.chain,
      status: "awaiting_counterparty",
    } as never).select("id, telegram_link_token").single();
    if (error) throw new Error(error.message);

    // Members — buyer auto-accepted, seller pending acceptance
    await supabaseAdmin.from("escrow_group_members").insert([
      { group_id: g.id, user_id: userId, role: "buyer", accepted_at: new Date().toISOString() },
      ...(sellerId ? [{ group_id: g.id, user_id: sellerId, role: "seller" as const, accepted_at: null }] : []),
    ] as never);

    // Buyer profile for notification text
    const { data: buyerProfile } = await supabaseAdmin
      .from("profiles").select("display_name").eq("user_id", userId).maybeSingle();
    const buyerName = buyerProfile?.display_name ?? "A buyer";

    await systemMsg(g.id, `Escrow group created for ${data.amount} ${data.asset}. ${sellerId ? "Awaiting seller to accept the invite." : "Awaiting seller acceptance."}`);

    // Notify seller in-app + Telegram
    if (sellerId) {
      const { data: sellerProfile } = await supabaseAdmin
        .from("profiles").select("telegram_user_id").eq("user_id", sellerId).maybeSingle();
      const inviteUrl = `${process.env.SITE_URL ?? "https://escrowdesk.lovable.app"}/escrow/${g.id}`;
      if (sellerProfile?.telegram_user_id) {
        await tgSendMessage(Number(sellerProfile.telegram_user_id),
          `🤝 <b>New escrow invite</b>\n${escapeHtml(buyerName)} wants to trade <b>${data.amount} ${data.asset}</b> with you.\n\nReview & accept: ${inviteUrl}`);
      }
    } else if (data.counterparty_telegram) {
      // Seller has no site account yet — notify by @username via Telegram (best effort)
      await systemMsg(g.id, `Invited @${data.counterparty_telegram.replace(/^@/,"")} on Telegram — they must link the bot to join.`);
    }

    return { id: g.id, telegram_link_token: g.telegram_link_token };
  });

// -------- Accept / decline invite --------
export const acceptEscrowInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ group_id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: mem } = await supabaseAdmin.from("escrow_group_members")
      .select("role, accepted_at, declined_at")
      .eq("group_id", data.group_id).eq("user_id", context.userId).maybeSingle();
    if (!mem) throw new Error("You're not invited to this group");
    if (mem.accepted_at) return { ok: true };
    if (mem.declined_at) throw new Error("You previously declined this invite");
    await supabaseAdmin.from("escrow_group_members")
      .update({ accepted_at: new Date().toISOString() } as never)
      .eq("group_id", data.group_id).eq("user_id", context.userId);
    // If seller accepted, move group to active
    if (mem.role === "seller") {
      await supabaseAdmin.from("escrow_groups")
        .update({ status: "active" } as never)
        .eq("id", data.group_id).eq("status", "awaiting_counterparty");
    }
    const { data: p } = await supabaseAdmin.from("profiles").select("display_name").eq("user_id", context.userId).maybeSingle();
    await systemMsg(data.group_id, `✅ ${p?.display_name ?? "Counterparty"} accepted the invite.`);
    return { ok: true };
  });

export const declineEscrowInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ group_id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: mem } = await supabaseAdmin.from("escrow_group_members")
      .select("role").eq("group_id", data.group_id).eq("user_id", context.userId).maybeSingle();
    if (!mem) throw new Error("Not invited");
    await supabaseAdmin.from("escrow_group_members")
      .update({ declined_at: new Date().toISOString() } as never)
      .eq("group_id", data.group_id).eq("user_id", context.userId);
    if (mem.role === "seller") {
      await supabaseAdmin.from("escrow_groups")
        .update({ status: "cancelled" } as never).eq("id", data.group_id);
    }
    const { data: p } = await supabaseAdmin.from("profiles").select("display_name").eq("user_id", context.userId).maybeSingle();
    await systemMsg(data.group_id, `❌ ${p?.display_name ?? "Counterparty"} declined the invite. Group cancelled.`);
    return { ok: true };
  });

// -------- Seller verifies on-chain deposit --------
export const verifyGroupDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ group_id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: g } = await supabaseAdmin.from("escrow_groups")
      .select("counterparty_id, deposit_tx_hash, status").eq("id", data.group_id).maybeSingle();
    if (!g) throw new Error("Not found");
    if (g.counterparty_id !== context.userId) throw new Error("Only the seller can verify the deposit");
    if (!g.deposit_tx_hash) throw new Error("Buyer hasn't submitted a tx hash yet");
    if (g.status !== "funded") throw new Error("Group not in funded state");
    await supabaseAdmin.from("escrow_groups")
      .update({ deposit_verified_at: new Date().toISOString() } as never)
      .eq("id", data.group_id);
    await systemMsg(data.group_id, `🔎 Seller verified the deposit on-chain. Ready to release.`);
    return { ok: true };
  });

// -------- Get a group --------
export const getEscrowGroup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: g, error } = await supabaseAdmin.from("escrow_groups").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!g) throw new Error("Group not found");

    let { data: mems } = await supabaseAdmin
      .from("escrow_group_members").select("user_id, role, joined_at, accepted_at, declined_at").eq("group_id", data.id);
    let isMember = (mems ?? []).some((m) => m.user_id === context.userId);

    // Auto-claim invite: if not yet a member but user matches invited_username / invited_telegram, add them as the seller.
    if (!isMember && (g.invited_username || g.invited_telegram) && !g.counterparty_id) {
      const { data: me } = await supabaseAdmin
        .from("profiles").select("display_name, telegram_username")
        .eq("user_id", context.userId).maybeSingle();
      const matchesName = g.invited_username && me?.display_name &&
        me.display_name.toLowerCase() === String(g.invited_username).replace(/^@/, "").toLowerCase();
      const matchesTg = g.invited_telegram && me?.telegram_username &&
        me.telegram_username.toLowerCase() === String(g.invited_telegram).replace(/^@/, "").toLowerCase();
      if (matchesName || matchesTg) {
        await supabaseAdmin.from("escrow_group_members").insert({
          group_id: data.id, user_id: context.userId, role: "seller", accepted_at: null,
        } as never);
        await supabaseAdmin.from("escrow_groups").update({ counterparty_id: context.userId } as never).eq("id", data.id);
        const re = await supabaseAdmin
          .from("escrow_group_members").select("user_id, role, joined_at, accepted_at, declined_at").eq("group_id", data.id);
        mems = re.data;
        isMember = true;
        await systemMsg(data.id, `🔗 Invited counterparty joined via invite link.`);
      }
    }
    if (!isMember) throw new Error("Forbidden — you are not a member of this escrow group");

    const profileMap = await loadProfiles((mems ?? []).map((m) => m.user_id));
    const { data: msgs } = await supabaseAdmin
      .from("escrow_group_messages").select("*").eq("group_id", data.id).order("created_at");

    const senderMap = await loadProfiles(
      Array.from(new Set((msgs ?? []).map((m) => m.sender_id).filter((x): x is string => !!x)))
    );

    return {
      group: g,
      members: (mems ?? []).map((m) => ({ ...m, profile: profileMap.get(m.user_id) ?? null })),
      messages: (msgs ?? []).map((m) => ({ ...m, sender: m.sender_id ? senderMap.get(m.sender_id) ?? null : null })),
    };
  });

// -------- Send a message --------
export const sendGroupMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ group_id: z.string().uuid(), body: z.string().trim().min(1).max(2000) }))
  .handler(async ({ data, context }) => {
    await ensureMember(data.group_id, context.userId);
    await supabaseAdmin.from("escrow_group_messages").insert({
      group_id: data.group_id, sender_id: context.userId, body: data.body,
    } as never);
    // Mirror to TG
    const { data: g } = await supabaseAdmin.from("escrow_groups").select("telegram_chat_id").eq("id", data.group_id).maybeSingle();
    if (g?.telegram_chat_id) {
      const { data: p } = await supabaseAdmin.from("profiles").select("display_name").eq("user_id", context.userId).maybeSingle();
      await tgSendMessage(g.telegram_chat_id, `<b>${escapeHtml(p?.display_name ?? "User")}:</b> ${escapeHtml(data.body)}`);
    }
    return { ok: true };
  });

// -------- Invite moderator --------
export const inviteModerator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ group_id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await ensureMember(data.group_id, context.userId);
    // Find a judge / moderator
    const { data: judges } = await supabaseAdmin
      .from("user_roles").select("user_id, role").in("role", ["judge","moderator","admin"]);
    const ids = Array.from(new Set((judges ?? []).map((j) => j.user_id)));
    if (!ids.length) throw new Error("No moderators are available right now");
    // Pick the first one not already in the group
    const { data: existing } = await supabaseAdmin
      .from("escrow_group_members").select("user_id").eq("group_id", data.group_id).in("user_id", ids);
    const taken = new Set((existing ?? []).map((e) => e.user_id));
    const pick = ids.find((id) => !taken.has(id));
    if (!pick) throw new Error("All available moderators already in group");
    await supabaseAdmin.from("escrow_group_members").insert({
      group_id: data.group_id, user_id: pick, role: "moderator",
    } as never);
    await systemMsg(data.group_id, `🧑‍⚖️ Moderator invited.`);
    // Notify moderator via TG
    const { data: p } = await supabaseAdmin.from("profiles").select("telegram_user_id").eq("user_id", pick).maybeSingle();
    if (p?.telegram_user_id) {
      await tgSendMessage(Number(p.telegram_user_id),
        `You've been added as moderator to escrow group <code>${data.group_id}</code>.`);
    }
    return { ok: true, moderator_id: pick };
  });

// -------- Submit tx hash --------
export const submitGroupTxHash = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ group_id: z.string().uuid(), hash: z.string().trim().min(8).max(200) }))
  .handler(async ({ data, context }) => {
    const { data: g } = await supabaseAdmin.from("escrow_groups").select("creator_id, status").eq("id", data.group_id).maybeSingle();
    if (!g) throw new Error("Not found");
    if (g.creator_id !== context.userId) throw new Error("Only buyer can submit the tx hash");
    if (!["active","awaiting_counterparty"].includes(String(g.status))) throw new Error("Cannot submit hash in current state");
    await supabaseAdmin.from("escrow_groups").update({
      deposit_tx_hash: data.hash, status: "funded",
    } as never).eq("id", data.group_id);
    await systemMsg(data.group_id, `💸 Buyer submitted deposit tx hash: <code>${data.hash}</code>. Awaiting seller verification.`);
    return { ok: true };
  });

// -------- Release --------
export const releaseEscrowGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ group_id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: g } = await supabaseAdmin.from("escrow_groups").select("*").eq("id", data.group_id).maybeSingle();
    if (!g) throw new Error("Not found");
    if (g.counterparty_id !== context.userId) throw new Error("Only seller can release");
    if (g.status !== "funded") throw new Error("Group not funded");
    await supabaseAdmin.from("escrow_groups").update({
      status: "released", released_at: new Date().toISOString(),
    } as never).eq("id", data.group_id);
    await systemMsg(data.group_id, `✅ Trade released. Funds delivered to ${g.escrow_address}.`);
    return { ok: true };
  });

// -------- Cancel --------
export const cancelEscrowGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ group_id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await ensureMember(data.group_id, context.userId);
    const { data: g } = await supabaseAdmin.from("escrow_groups").select("status").eq("id", data.group_id).maybeSingle();
    if (!g) throw new Error("Not found");
    if (["released","cancelled"].includes(String(g.status))) throw new Error("Already closed");
    await supabaseAdmin.from("escrow_groups").update({ status: "cancelled" } as never).eq("id", data.group_id);
    await systemMsg(data.group_id, `❌ Group cancelled.`);
    return { ok: true };
  });

// -------- List my groups + stats --------
export const listMyEscrowGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: mems } = await supabaseAdmin
      .from("escrow_group_members").select("group_id, role").eq("user_id", context.userId);
    const ids = (mems ?? []).map((m) => m.group_id);
    const stats = { open: 0, pending: 0, successful: 0, failed: 0 };
    if (!ids.length) return { groups: [], stats };
    const { data: groups } = await supabaseAdmin
      .from("escrow_groups").select("*").in("id", ids).order("created_at", { ascending: false });
    const roleMap = new Map((mems ?? []).map((m) => [m.group_id, m.role]));
    const counterIds = Array.from(new Set((groups ?? []).flatMap((g) => [g.creator_id, g.counterparty_id]).filter((x): x is string => !!x && x !== context.userId)));
    const profileMap = await loadProfiles(counterIds);
    const listingIds = Array.from(new Set((groups ?? []).flatMap((g) => g.listing_id ? [g.listing_id] : [])));
    const listingMap = await loadListings(listingIds);
    for (const g of groups ?? []) {
      const s = String(g.status);
      if (s === "released") stats.successful++;
      else if (s === "cancelled" || s === "disputed") stats.failed++;
      else {
        stats.open++;
        if (s === "awaiting_counterparty") stats.pending++;
      }
    }
    return {
      stats,
      groups: (groups ?? []).map((g) => {
        const otherId = g.creator_id === context.userId ? g.counterparty_id : g.creator_id;
        return {
          ...g,
          my_role: roleMap.get(g.id),
          counterparty: otherId ? profileMap.get(otherId) ?? null : null,
          listing: g.listing_id ? listingMap.get(g.listing_id) ?? null : null,
        };
      }),
    };
  });
