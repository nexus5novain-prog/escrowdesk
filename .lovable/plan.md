## Scope

Restructure the app around three clearly separated modules. Marketplace stays untouched. The existing Shop page (currently `/shop`, code in `src/routes/shop.tsx`) gets renamed to be the real Shop; a brand-new Order Book page is built; every escrow concept currently living on the Trades page moves into the Escrow section.

## What stays the same

- `src/routes/marketplace.tsx` and every component/server-fn it imports — no edits.
- All marketplace navigation links, post-listing, listing detail pages.
- All Supabase tables, RPCs, RLS — no schema changes needed.

## 1. Shop vs Order Book split

Current state:
- `src/routes/shop.tsx` (URL `/shop`) is internally titled "Order Book" and uses `store.functions.ts` (which is broken — references a non-existent `store_products` table). It's a half-built storefront, not an order book.
- There is no dedicated order-book UI today.

Target:
```
/shop        → src/routes/shop.tsx        — Shop storefront (curated listings, products, services)
/order-book  → src/routes/order-book.tsx  — NEW: live P2P offer order-book (buy/sell offers, price ladder)
```

Actions:
- Rewrite `src/routes/shop.tsx` as the real Shop page: lists `kind='product'` and `kind='service'` listings from the `listings` table via a new `listShopItems` server fn in `src/lib/marketplace.functions.ts`. Buying flow funnels into the existing auto-escrow path (same as marketplace).
- Create `src/routes/order-book.tsx` as the new Order Book: reads from `offers` table, groups by asset/side, shows live bid/ask ladder, click-to-trade opens existing trade flow. Realtime subscription on `offers`.
- Delete `src/lib/store.functions.ts` (broken, references missing table) and any imports.
- Header: keep "Shop" link pointing to `/shop`, add "Order Book" link pointing to `/order-book`.

## 2. Migrate escrow features from Trades → Escrow

Current state:
- `src/routes/trades.tsx` (URL `/trades`) shows 4 stat cards (open/successful/failed/pending) + lists escrow groups via `listMyEscrowGroups`.
- `src/routes/escrow.tsx` (URL `/escrow`) is a near-identical dashboard for escrow groups.
- `src/routes/trade.$id.tsx` and `src/routes/escrow.trade.$id.tsx` are duplicated trade-room pages.

Target:
```
/escrow              → escrow dashboard (4 stat cards + active escrows + purchases + history) — primary
/escrow/$id          → escrow group detail (existing)
/escrow/new          → manual escrow wizard (existing)
/escrow/trade/$id    → live trade room (signing, deposit confirm, release, chat, ratings)
/trades              → REMOVED
/trade/$id           → REMOVED (redirect to /escrow/trade/$id)
```

Actions:
- Make `src/routes/escrow.tsx` the canonical dashboard: fold in any unique copy/links from `trades.tsx` (the four stat cards and active list are already present in `escrow.tsx`).
- Delete `src/routes/trades.tsx`.
- Delete `src/routes/trade.$id.tsx` (kept logic already lives in `escrow.trade.$id.tsx`).
- Update every `<Link to="/trades">` → `<Link to="/escrow">` and every `<Link to="/trade/$id">` → `<Link to="/escrow/trade/$id">` across components and routes (header, marketplace auto-escrow redirect, escrow group "open trade" buttons, admin links, etc.).

## 3. Escrow module finalization

- Confirm escrow creation flows: `/escrow/new` wizard + marketplace auto-escrow both create groups via `createEscrowGroup`. No changes needed beyond link updates.
- Confirm escrow management surfaces: dashboard at `/escrow`, group detail at `/escrow/$id`, trade room at `/escrow/trade/$id`. Realtime subscriptions on `escrow_groups` + `escrow_group_messages` already wired.
- Telegram bot commands: existing `src/routes/api/public/telegram/webhook.ts` continues to mirror messages and handle `/start <token>` linking; no command changes required by this restructure. (If the user wants new bot commands, that is a separate scope and I'll ask before adding.)

## 4. Cleanup & build correctness

- Remove unused imports and dead code introduced by file deletions.
- Fix the lingering TypeScript errors in `escrow-groups.functions.ts` (asset literal type — `"USDT" | "USDC" | "ETH"` not comparable to `"BTC"`-only union; loosen the asset switch).
- Fix `trades.tsx` / `escrow.tsx` `data` typing on `useQuery` (annotate so `data.stats` / `data.groups` resolve).
- Delete stale references in `src/components/SiteHeader.tsx` to removed routes.
- Update `src/routes/__root.tsx` 404 fallback link target (currently `/` — fine).
- Run a full build; iterate until green.

## Out of scope (call out, do not silently do)

- I cannot run `git commit` / `git push` — git state is managed by the Lovable harness, not by the agent. Changes are saved automatically to the project and you can publish from the UI.
- No database migrations are performed.
- Marketplace UI/UX is untouched per your instruction.

## Technical notes

- Route deletions: removing a `src/routes/*.tsx` file regenerates `routeTree.gen.ts` automatically; no manual edits to that file.
- For `/trade/$id` callers we don't actually need a redirect file since nothing external links there — internal links are updated to `/escrow/trade/$id`. If you want a redirect kept for safety, say so and I'll add a tiny `trade.$id.tsx` that `throw redirect(...)` in `beforeLoad`.
- Order Book uses the existing `offers` table + `start_trade` RPC already in the DB; no new server fns beyond a thin `listOpenOffers` query.

Ready to implement on approval.