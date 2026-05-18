This is a multi-turn build. I'll ship one slice per turn so each is reviewable. After you approve this plan I'll start with **Turn 1**.

---

## Fee schedule (monotonic, no duplicates)

| Trade value (USD equiv) | Fee |
|---|---|
| < $20      | 2% |
| $20–$49.99 | 3% |
| $50–$99.99 | 5% |
| $100–$249  | 7% |
| $250–$999  | 9% |
| ≥ $1,000   | 10% |

Stored as a JSON ladder in `platform_settings.fee_tiers`, editable by admin. Old flat `fee_bps` kept as fallback.

---

## Turn 1 — Escrow model inversion + tiered fees + agreement signatures

**Database migration**
- Add `trades.terms_seller`, `trades.terms_buyer` (text) — terms each side proposes.
- Add `trades.signed_by_buyer_at`, `trades.signed_by_seller_at` (timestamptz).
- Add `trades.signature_buyer`, `trades.signature_seller` (text — the literal "I AGREE TO TERMS AND CONDITIONS OF THE …" phrase, validated).
- Add new trade status `awaiting_deposit` and `awaiting_seller_confirm` to the `trade_status` enum.
- New flow: `awaiting_agreement` → `awaiting_deposit` → `awaiting_seller_confirm` → `paid` (fiat sent) → `released`.
- Add `platform_settings.fee_tiers` JSON.
- Rewrite SQL functions:
  - `start_trade` now debits **buyer's** crypto wallet → escrow (not seller's), creates trade in `awaiting_agreement`.
  - New `sign_terms(trade_id, side, signature_text)` — validates exact phrase, records signature, advances to `awaiting_deposit` once both signed.
  - New `confirm_buyer_deposit(trade_id, seller)` — seller confirms; advances to `paid`.
  - `release_trade` — buyer releases crypto from escrow → seller, fee deducted using new `compute_fee(amount)` SQL helper that reads the ladder.

**Server functions** (`escrow.functions.ts`): `signTerms`, `confirmBuyerDeposit`, plus existing ones updated to the new state machine.

**Web UI** (`trade.$id.tsx`): step-by-step panel showing current state, two textareas for each side's terms, signature input with phrase validation, deposit-confirmation button for seller, release button for buyer.

**Telegram** (`webhook.ts`): new commands `/terms`, `/sign`, `/confirm`, `/release` adapted to new flow. `/help` updated.

---

## Turn 2 — Staff roles + moderation

**Database**
- Extend `app_role` enum with `judge`, `finance`, `support`.
- New table `user_warnings` (user_id, issued_by, reason, severity, created_at, acknowledged_at).
- Add `profiles.is_banned` already exists; add `ban_reason`, `banned_at`, `banned_by`.
- RLS: only `admin` can assign roles; `judge` can resolve disputes; `finance` can adjust fee tiers and view wallet ledger; `support` read-only.
- Trigger: banned users can't start trades or sign terms (raise exception in functions).

**Web Admin tabs**
- **Staff**: list users with role assignment dropdown (admin-only), shows `judge`/`finance`/`support`/`moderator`/`admin`.
- **Moderation**: ban/unban user with reason; warn user/staff with severity; warning history per user.
- Tighten existing admin functions to per-role permissions instead of blanket `is_staff`.

---

## Turn 3 — Telegram parity + admin reassign + polish

- Web admin Telegram panel: per-user "Unlink Telegram" button (clears `telegram_user_id`, forcing user to re-run `/link`).
- Telegram commands for users: full marketplace browse (`/offers`, `/buy <id> <amount>`, `/sell <…>`), trade lifecycle (`/mytrades`, `/trade <id>`, `/terms`, `/sign`, `/confirm`, `/release`, `/dispute`), `/balance`, `/warnings`.
- Telegram commands for staff: `/disputes`, `/resolve <id> buyer|seller`, `/ban <user>`, `/warn <user> <reason>` (gated by role).
- Notifications: every state transition pings both parties via Telegram if linked.
- Update `/help` to be role-aware (different command lists for user / judge / finance / admin).

---

## Technical notes (for reference)

- New enum values added with `ALTER TYPE … ADD VALUE` in separate migration statements (Postgres requirement).
- `compute_fee` runs in SQL so both web and Telegram paths agree on the number.
- Signature phrase comparison is case-insensitive, trimmed, exact-match — stored verbatim for audit.
- All new server functions use `requireSupabaseAuth` and re-check ban status server-side.
- Telegram callback_query keyboard already wired (from prior `/help` work) — reused for trade action buttons.

Reply **approve** and I'll start Turn 1 (migration + invert escrow + signatures + tiered fees).