import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function requireAdmin(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Admin access required");
}

const AVATARS = [
  "https://api.dicebear.com/7.x/avataaars/svg?seed=",
  "https://api.dicebear.com/7.x/personas/svg?seed=",
  "https://api.dicebear.com/7.x/identicon/svg?seed=",
];

function avatar(seed: string) {
  return `${AVATARS[Math.abs(seed.charCodeAt(0) + seed.charCodeAt(1)) % AVATARS.length]}${encodeURIComponent(seed)}`;
}

// ─── Seed marketplace products ────────────────────────────────────────────────

export const adminSeedMarketplace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const adminId = context.userId;

    const cards = [
      { name: "VISA Classic", card_number: "4111111198765432", card_name: "JOHN A SMITH", card_address: "123 Oak Street, Austin TX 78701", card_status: "active" as const, btc_rate: "0.00000143", notes: "Verified VISA Classic. Good standing. Billing confirmed.", amount: 150 },
      { name: "Mastercard Gold", card_number: "5500203467891023", card_name: "EMILY R JOHNSON", card_address: "456 Pine Ave, Dallas TX 75201", card_status: "active" as const, btc_rate: "0.00000190", notes: "Mastercard Gold with travel benefits. Balance confirmed.", amount: 200 },
      { name: "VISA Platinum", card_number: "4532016478902341", card_name: "MICHAEL T BROWN", card_address: "789 Elm Blvd, Houston TX 77001", card_status: "active" as const, btc_rate: "0.00000333", notes: "VISA Platinum with high credit limit. SSN verified.", amount: 350 },
      { name: "Amex Gold Card", card_number: "3714496353984307", card_name: "SARAH M DAVIS", card_address: "321 Maple Dr, Phoenix AZ 85001", card_status: "dead" as const, btc_rate: "0.00000081", notes: "Amex Gold — recently expired. Works for CNP transactions.", amount: 85 },
      { name: "Discover Cashback", card_number: "6011000990139424", card_name: "JAMES K WILSON", card_address: "654 Cedar Ln, Chicago IL 60601", card_status: "active" as const, btc_rate: "0.00000171", notes: "Discover Cashback card. 1.5% back on all purchases.", amount: 180 },
      { name: "VISA Business", card_number: "4916338506082832", card_name: "LISA P MARTINEZ", card_address: "987 Birch St, Los Angeles CA 90001", card_status: "active" as const, btc_rate: "0.00000248", notes: "VISA Business card with elevated limits.", amount: 260 },
      { name: "Mastercard World", card_number: "5412750000032354", card_name: "ROBERT C ANDERSON", card_address: "147 Walnut Ave, Miami FL 33101", card_status: "active" as const, btc_rate: "0.00000305", notes: "Mastercard World Elite. International ready.", amount: 320 },
      { name: "VISA Infinite", card_number: "4916736052009245", card_name: "JENNIFER L TAYLOR", card_address: "258 Spruce Ct, Seattle WA 98101", card_status: "active" as const, btc_rate: "0.00000524", notes: "VISA Infinite — unlimited travel credit line.", amount: 550 },
      { name: "VISA Debit Direct", card_number: "4539578763621486", card_name: "DAVID W THOMAS", card_address: "369 Poplar Rd, Denver CO 80201", card_status: "dead" as const, btc_rate: "0.00000057", notes: "VISA Debit — good for online use. Low balance.", amount: 60 },
      { name: "Mastercard Platinum", card_number: "5301250070000191", card_name: "AMANDA G JACKSON", card_address: "741 Ash Way, Boston MA 02101", card_status: "active" as const, btc_rate: "0.00000281", notes: "MC Platinum with concierge. Verified fresh.", amount: 295 },
    ];

    const enrolls = [
      { name: "Netflix Premium Access", description: "Full Netflix Premium plan with Ultra HD and 4 screens. Account is fresh, unused, and ready to configure. Email access included.", amount: 45 },
      { name: "Spotify Family Bundle", description: "Spotify Family plan with 6 slots available. Private account with billing info attached. Premium audio quality unlocked.", amount: 25 },
      { name: "Amazon Prime Full", description: "Full Amazon Prime with Prime Video, Prime Music, and free shipping. Account has clean history and linked payment.", amount: 35 },
      { name: "HBO Max Ultimate", description: "HBO Max Ultimate tier with 4K streaming and up to 3 devices. Ad-free. Account email + pass included. Fresh.", amount: 30 },
      { name: "Disney+ Bundle Pack", description: "Disney+ with Hulu and ESPN+ included. Full bundle access. Password change allowed. Great for streaming.", amount: 40 },
    ];

    const scanners = [
      { name: "BIN Checker Pro v3", description: "Advanced BIN/IIN lookup tool with bank, country, card type, and prepaid detection. API key included. 10k req/mo.", amount: 80 },
      { name: "Card Validator Suite", description: "Full Luhn algorithm validator, expiry tester, and CVV format checker. Desktop + API access. Lifetime license.", amount: 120 },
      { name: "EMV Scanner Tool 2.0", description: "Read and decode EMV chip data from physical cards. Includes USB reader device + software. Windows/Mac.", amount: 200 },
      { name: "Track1/Track2 Reader", description: "Magnetic stripe reader with Track1/Track2 parsing. Includes decoder software and CSV export. Plug & play.", amount: 180 },
      { name: "Fullz Lookup Verifier", description: "Cross-reference fullz data against open databases. Verify DOB, SSN format, name match. API + dashboard.", amount: 150 },
    ];

    const generals = [
      { name: "Bank Logs Premium", description: "High-balance bank login credentials with email access. Verified before sale. Balance $5k–$50k range. Freshest possible.", amount: 200 },
      { name: "PayPal Aged Account", description: "Verified PayPal business account, 3+ years old, clean history. Lifting limits easy. Withdrawal-ready.", amount: 90 },
      { name: "Cash App BTC Enabled", description: "Cash App with BTC buying enabled, verified ID. $7500 monthly limit. Email + pass + recovery codes.", amount: 60 },
      { name: "Crypto Exchange Account", description: "Binance KYC-verified account, level 2. Withdrawal limit $200k/day. Email access. Region: EU.", amount: 300 },
      { name: "SSN + DOB Package", description: "Full SSN + DOB info for synthetic identity setup. Includes state ID info and credit profile summary.", amount: 75 },
    ];

    let created = 0;

    for (const c of cards) {
      const desc = JSON.stringify({ type: "card", card_number: c.card_number, card_name: c.card_name, card_address: c.card_address, card_status: c.card_status, btc_rate: c.btc_rate, notes: c.notes });
      const { error } = await supabaseAdmin.from("listings").insert({
        user_id: adminId, name: c.name, description: desc, category: "CARD",
        amount: c.amount, currency: "USD", status: "active",
      } as never);
      if (!error) created++;
    }

    for (const e of enrolls) {
      const { error } = await supabaseAdmin.from("listings").insert({
        user_id: adminId, name: e.name, description: e.description, category: "ENROLL",
        amount: e.amount, currency: "USD", status: "active",
      } as never);
      if (!error) created++;
    }

    for (const s of scanners) {
      const { error } = await supabaseAdmin.from("listings").insert({
        user_id: adminId, name: s.name, description: s.description, category: "SCANNER",
        amount: s.amount, currency: "USD", status: "active",
      } as never);
      if (!error) created++;
    }

    for (const g of generals) {
      const { error } = await supabaseAdmin.from("listings").insert({
        user_id: adminId, name: g.name, description: g.description, category: "GENERAL",
        amount: g.amount, currency: "USD", status: "active",
      } as never);
      if (!error) created++;
    }

    return { ok: true, created };
  });

// ─── Seed demo users ──────────────────────────────────────────────────────────

const PREMIUM_USERS = [
  { username: "darktrader_99", bio: "Elite digital trader. 500+ deals closed. Premium member.", trades: 312, vol: 450000 },
  { username: "cypher_vault", bio: "Crypto specialist & marketplace veteran. 4 years on-platform.", trades: 287, vol: 380000 },
  { username: "phantom_pro", bio: "Ghost moves only. Premium escrow trader since day one.", trades: 245, vol: 310000 },
  { username: "iron_crypt", bio: "Iron-clad deals. No disputes ever. Top-rated seller.", trades: 198, vol: 275000 },
  { username: "stealth_deal", bio: "Professional grade transactions. Premium & trusted.", trades: 176, vol: 224000 },
  { username: "alpha_chain", bio: "Chain-level security on every trade. 5-star streak.", trades: 163, vol: 198000 },
  { username: "omega_desk", bio: "Founder-level trader. Premium lifetime member.", trades: 154, vol: 182000 },
  { username: "krypto_king", bio: "King of the escrow game. Premium certified.", trades: 141, vol: 167000 },
  { username: "vaultless", bio: "Borderless trades, secured by escrow. Premium user.", trades: 128, vol: 149000 },
  { username: "neon_desk", bio: "Neon-fast executions. Premium & elite status.", trades: 115, vol: 134000 },
];

const TRUSTED_USERS = [
  { username: "swift_trades", bio: "Quick settlements, zero drama.", trades: 89, vol: 92000 },
  { username: "clear_runner", bio: "Clear communication every time.", trades: 76, vol: 78000 },
  { username: "vouched_x", bio: "Vouched by 20+ traders on the platform.", trades: 68, vol: 71000 },
  { username: "trusted_99", bio: "99% positive feedback rating.", trades: 61, vol: 64000 },
  { username: "fastchain", bio: "Fast on-chain confirmations always.", trades: 57, vol: 58000 },
  { username: "reliable_z", bio: "Reliability is my brand. Always delivers.", trades: 52, vol: 53000 },
  { username: "solid_deal", bio: "Solid deals, no flaking, no games.", trades: 49, vol: 49000 },
  { username: "sterling_pro", bio: "Sterling reputation across all markets.", trades: 45, vol: 46000 },
  { username: "confirmed_one", bio: "Confirmed clean record — check my stats.", trades: 43, vol: 42000 },
  { username: "approved_x", bio: "Approved seller with verified history.", trades: 41, vol: 39000 },
  { username: "verified_link", bio: "Verified identity and clean trade history.", trades: 39, vol: 37000 },
  { username: "vetted_pro", bio: "Staff-vetted and community approved.", trades: 37, vol: 34000 },
  { username: "backed_deal", bio: "Backed by escrow on every transaction.", trades: 35, vol: 32000 },
  { username: "bonded_pro", bio: "Bonded trader with escrow guarantee.", trades: 33, vol: 30000 },
  { username: "secured_x", bio: "Every deal locked in escrow before release.", trades: 31, vol: 28000 },
  { username: "bonafide_z", bio: "Bona fide legit — ask anyone here.", trades: 29, vol: 25000 },
  { username: "earnest_pro", bio: "Earnest about every deal. 100% completion.", trades: 27, vol: 23000 },
  { username: "genuine_x", bio: "Genuine trades, no empty promises.", trades: 25, vol: 21000 },
  { username: "legit_chain", bio: "On-chain legitimacy — verifiable history.", trades: 23, vol: 19000 },
  { username: "authentic_z", bio: "Authentic profile, real rep, real deals.", trades: 21, vol: 17000 },
];

const REGULAR_NAMES = [
  "blade_coder","pixel_ghost","nova_chain","echo_byte","flux_trade","neon_crypt","zero_deal","dark_pixel",
  "storm_byte","rapid_link","cold_vault","night_trade","blue_chain","flash_node","void_crypt","orbit_deal",
  "pulse_trade","cyber_zero","edge_node","wave_crypt","frost_deal","turbo_link","blaze_trade","grid_node",
  "spin_vault","micro_deal","nano_chain","giga_trade","tera_link","pico_node","alpha_zero","beta_chain",
  "gamma_trade","delta_link","epsilon_node","zeta_vault","eta_deal","theta_chain","iota_trade","kappa_link",
  "lambda_node","mu_vault","nu_deal","xi_chain","omicron_link","pi_node","rho_trade","sigma_vault","tau_link","upsilon_deal",
];

export const adminSeedUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);

    let created = 0;
    let skipped = 0;

    const seedOne = async (username: string, tier: "premium" | "trusted" | "regular", meta: { bio: string; trades: number; vol: number }) => {
      const email = `${username}@escrowdesk.demo`;
      let userId: string;
      try {
        const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
        const found = existing?.users?.find((u) => u.email === email);
        if (found) { skipped++; return; }
        const { data: newUser, error } = await supabaseAdmin.auth.admin.createUser({
          email, password: "Demo@2024!", email_confirm: true,
          user_metadata: { display_name: username },
        });
        if (error || !newUser?.user) { skipped++; return; }
        userId = newUser.user.id;
      } catch { skipped++; return; }

      const avatarUrl = avatar(username);
      const isPremium = tier === "premium";
      const isTrusted = tier === "premium" || tier === "trusted";

      const { error: pe } = await supabaseAdmin.from("profiles").upsert({
        user_id: userId,
        display_name: username,
        bio: meta.bio,
        avatar_url: avatarUrl,
        is_premium: isPremium,
        is_trusted: isTrusted,
        trades_completed: meta.trades,
        btc_volume_usd: meta.vol,
        five_star_count: Math.floor(meta.trades * 0.7),
        distinct_partners: Math.floor(meta.trades * 0.8),
      } as never, { onConflict: "user_id" });

      if (!pe) {
        if (isPremium) {
          await supabaseAdmin.from("user_roles").upsert({ user_id: userId, role: "user" } as never, { onConflict: "user_id,role" });
        }
        created++;
      } else {
        skipped++;
      }
    };

    for (const u of PREMIUM_USERS) {
      await seedOne(u.username, "premium", { bio: u.bio, trades: u.trades, vol: u.vol });
    }
    for (const u of TRUSTED_USERS) {
      await seedOne(u.username, "trusted", { bio: u.bio, trades: u.trades, vol: u.vol });
    }
    for (let i = 0; i < REGULAR_NAMES.length; i++) {
      const name = REGULAR_NAMES[i];
      const trades = Math.floor(Math.random() * 15);
      await seedOne(name, "regular", { bio: `Trader #${i + 1} on EscrowDesk. Building rep.`, trades, vol: trades * 1200 });
    }

    return { ok: true, created, skipped };
  });

export const adminSeedAll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    return { ok: true, message: "Use individual seed buttons for marketplace and users." };
  });
