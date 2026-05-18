## 1. Wallet page rework

- Remove deposit UI entirely.
- Replace single balance with **per-asset PnL** (Earned − Spent) for BTC, USDT-TRC20, USDC, ETH, plus a lifetime USD summary (Total earned, Total spent, Net).
  - Earned = sum of `wallet_transactions` of kind `escrow_release` credited to user as seller.
  - Spent = sum of `crypto_amount` from `trades` where user is buyer and status='released'.
  - USD totals derived from `trades.fiat_amount`.
- Replace deposit panel with **Add Wallet Address** form, one input per accepted coin:
  - BTC, USDT (TRC20), USDC (chain selectable: ERC20 / TRC20), ETH.
  - Stored on `profiles` as new columns (see schema below).
- Keep the Trusted / Premium milestone journey panel as-is.

## 2. Escrow bank system — multi-coin

- Extend the `asset_type` enum to include `USDC` and `ETH` (currently `BTC`, `USDT`).
- Every trade must record which payout address of the seller will receive funds, and which address of the buyer is funding escrow — snapshotted on the trade row so address rotations don't break history.
- Buyer's tx hash (on-chain deposit reference) becomes a required field before seller can confirm deposit.

## 3. Escrow Groups (new core feature)

A reusable "room" that owns the trade chat, terms, deposit address, tx hash, and participants. Two creation paths:

- **From marketplace**: clicking a listing's "Trade" button auto-creates a group with the buyer + listing owner (seller).
- **Manual**: any user can open `/escrow/new`, invite a counterparty by site username OR Telegram username, and pick coin/amount.

Each group supports:
- Invite **moderator (judge)** button — pings staff with `judge` role; first to accept joins the group.
- In-app chat (reuses `trade_messages` realtime).
- Selected escrow bank address (seller's payout address for the chosen coin).
- Amount + coin.
- **Tx hash submission** by the group creator (buyer) once funds are sent on-chain. Seller verifies → releases.
- Optional Telegram mirror — see §4.

## 4. Telegram parity

Telegram bots cannot create groups. Flow:
1. Buyer clicks "Open in Telegram" in the group → bot DM gives them a `t.me/...?startgroup=<token>` deep link.
2. Buyer creates the group in Telegram, adds the bot, and (optionally) the seller's @username.
3. Bot binds that Telegram chat to the escrow group via the start token, then mirrors messages both ways between Telegram and the website chat.
4. `/invite_moderator` slash command pings a staff judge.
5. `/txhash <hash>` and `/release` commands available to the right participants.

## Technical details

### Schema (new migration)

```text
alter type asset_type add value 'USDC';
alter type asset_type add value 'ETH';

alter table profiles
  add column wallet_address_usdc text,
  add column wallet_address_usdc_chain text default 'ERC20',
  add column wallet_address_eth text;

create table escrow_groups (
  id uuid pk,
  creator_id uuid,           -- buyer
  counterparty_id uuid null,  -- seller (null until accepted if invited by tg handle)
  invited_telegram text null,
  invited_username text null,
  listing_id uuid null,       -- if created from marketplace
  trade_id uuid null,         -- once escrow proper begins
  asset asset_type,
  amount numeric,
  fiat_amount numeric null,
  fiat_currency text default 'USD',
  escrow_address text,        -- seller's payout addr snapshot
  deposit_tx_hash text null,
  status text  -- 'awaiting_counterparty' | 'active' | 'funded' | 'released' | 'cancelled' | 'disputed'
  telegram_chat_id bigint null,
  telegram_link_token text unique,
  created_at, updated_at
);

create table escrow_group_members (
  group_id uuid, user_id uuid, role text  -- 'buyer'|'seller'|'moderator'
  primary key (group_id, user_id)
);
```

Group chat uses existing `trade_messages` keyed by a synthetic trade once funding starts, or a new `escrow_group_messages` table — I'll add the latter to avoid coupling.

### Server functions (`src/lib/escrow-groups.functions.ts`)

- `createEscrowGroup({ asset, amount, counterparty: { username? | telegram? }, listing_id? })`
- `acceptGroupInvite({ group_id })`
- `inviteModerator({ group_id })`
- `submitTxHash({ group_id, hash })`
- `confirmDepositReceived({ group_id })` → spins up actual `trades` row + locks escrow
- `releaseEscrowGroup({ group_id })`
- `sendGroupMessage` / `getEscrowGroup`
- All gated by `requireSupabaseAuth` and membership checks.

### Telegram webhook additions

- Handle `/start <link_token>` in groups → bind `telegram_chat_id`.
- Handle `/invite_moderator`, `/txhash`, `/release`.
- Mirror website→Telegram on insert via realtime subscriber in webhook handler (or a server fn that fans out).

### Frontend

- `src/routes/wallet.tsx` rewritten: PnL view + multi-coin address inputs.
- `src/routes/escrow.new.tsx` — group creation wizard.
- `src/routes/escrow.$id.tsx` — group detail page with chat, deposit panel, tx hash submission, invite moderator button, "Open in Telegram" button.
- `src/routes/index.tsx` (Marketplace): "Trade" CTA on each listing → calls `createEscrowGroup` then redirects to group page.
- `src/components/SiteHeader.tsx`: new "Escrow" nav.

### Migration / behavior of existing trades

Existing `trades` rows continue to work via the original `/trade/$id` page. New trades originating from escrow groups will have `trade_id` linked back to the group; the group page shows the same data plus the new fields.

## Build sequence

1. Schema migration (assets + profile cols + escrow_groups + messages).
2. Wallet page rewrite (PnL + multi-coin addresses).
3. Escrow group server functions + website UI (create, invite, chat, tx hash, release).
4. Marketplace "Trade" CTA wiring.
5. Telegram webhook commands + group binding + mirror.
6. Test end-to-end on a sample group.

## Open assumptions (flag if wrong)

- "USDC" defaults to ERC20 but user can switch to TRC20 via dropdown.
- ETH = native Ether (not an ERC20 token list).
- Moderator = any user with `judge` role in `user_roles`. First to accept the ping joins.
- Telegram mirroring is best-effort (no guaranteed ordering between web↔TG).
- Existing `/trade/$id` page stays for legacy trades; escrow groups become the new default path.
