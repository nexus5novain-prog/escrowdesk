
-- 1. Enum values (must be separate statements, committed before use)
ALTER TYPE trade_status ADD VALUE IF NOT EXISTS 'awaiting_agreement';
ALTER TYPE trade_status ADD VALUE IF NOT EXISTS 'awaiting_deposit';
ALTER TYPE trade_status ADD VALUE IF NOT EXISTS 'awaiting_seller_confirm';

-- 2. New columns on trades
ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS terms_seller text,
  ADD COLUMN IF NOT EXISTS terms_buyer text,
  ADD COLUMN IF NOT EXISTS signature_seller text,
  ADD COLUMN IF NOT EXISTS signature_buyer text,
  ADD COLUMN IF NOT EXISTS signed_by_seller_at timestamptz,
  ADD COLUMN IF NOT EXISTS signed_by_buyer_at timestamptz,
  ADD COLUMN IF NOT EXISTS deposit_confirmed_at timestamptz;

-- 3. Seed fee ladder
INSERT INTO public.platform_settings(key, value)
VALUES ('fee_tiers', '[
  {"max":20,"bps":200},
  {"max":50,"bps":300},
  {"max":100,"bps":500},
  {"max":250,"bps":700},
  {"max":1000,"bps":900},
  {"max":null,"bps":1000}
]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 4. compute_fee_bps helper
CREATE OR REPLACE FUNCTION public.compute_fee_bps(_fiat_amount numeric)
RETURNS integer
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tier jsonb;
  tiers jsonb;
BEGIN
  SELECT value INTO tiers FROM platform_settings WHERE key = 'fee_tiers';
  IF tiers IS NULL THEN
    RETURN COALESCE((SELECT (value)::int FROM platform_settings WHERE key='fee_bps'), 200);
  END IF;
  FOR tier IN SELECT * FROM jsonb_array_elements(tiers) LOOP
    IF tier->>'max' IS NULL OR _fiat_amount < (tier->>'max')::numeric THEN
      RETURN (tier->>'bps')::int;
    END IF;
  END LOOP;
  RETURN 1000;
END; $$;

-- 5. Rewrite start_trade: buyer's crypto -> escrow, status awaiting_agreement
CREATE OR REPLACE FUNCTION public.start_trade(_offer_id uuid, _buyer uuid, _fiat_amount numeric, _payment_method_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer offers%rowtype;
  v_seller uuid;
  v_buyer uuid;
  v_crypto numeric(24,8);
  v_fee numeric(24,8);
  v_fee_bps int;
  v_trade_id uuid;
  v_banned boolean;
BEGIN
  SELECT * INTO v_offer FROM offers WHERE id = _offer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Offer not found'; END IF;
  IF v_offer.status <> 'active' THEN RAISE EXCEPTION 'Offer not active'; END IF;
  IF _fiat_amount < v_offer.min_amount OR _fiat_amount > v_offer.max_amount THEN
    RAISE EXCEPTION 'Amount out of bounds';
  END IF;
  IF v_offer.maker_id = _buyer THEN RAISE EXCEPTION 'Cannot trade with yourself'; END IF;

  SELECT is_banned INTO v_banned FROM profiles WHERE user_id = _buyer;
  IF v_banned THEN RAISE EXCEPTION 'Account is banned'; END IF;

  v_crypto := round(_fiat_amount / v_offer.price, 8);
  IF v_crypto > v_offer.available_crypto THEN RAISE EXCEPTION 'Not enough liquidity'; END IF;

  IF v_offer.side = 'sell' THEN
    v_seller := v_offer.maker_id;
    v_buyer := _buyer;
  ELSE
    v_seller := _buyer;
    v_buyer := v_offer.maker_id;
  END IF;

  v_fee_bps := compute_fee_bps(_fiat_amount);
  v_fee := round(v_crypto * v_fee_bps / 10000.0, 8);

  -- INVERTED: buyer escrows the crypto, not seller
  UPDATE wallets
    SET available = available - v_crypto,
        escrow = escrow + v_crypto
    WHERE user_id = v_buyer AND asset = v_offer.asset AND available >= v_crypto;
  IF NOT FOUND THEN RAISE EXCEPTION 'Buyer has insufficient crypto balance for escrow'; END IF;

  UPDATE offers SET available_crypto = available_crypto - v_crypto WHERE id = _offer_id;

  INSERT INTO trades(offer_id, buyer_id, seller_id, asset, fiat_currency, price, crypto_amount, fiat_amount, fee_amount, payment_method_id, status)
  VALUES (_offer_id, v_buyer, v_seller, v_offer.asset, v_offer.fiat_currency, v_offer.price, v_crypto, _fiat_amount, v_fee, _payment_method_id, 'awaiting_agreement')
  RETURNING id INTO v_trade_id;

  INSERT INTO wallet_transactions(user_id, asset, kind, amount, trade_id, note)
  VALUES (v_buyer, v_offer.asset, 'escrow_lock', v_crypto, v_trade_id, 'Buyer locked crypto into escrow');

  INSERT INTO trade_messages(trade_id, sender_id, body, is_system)
  VALUES (v_trade_id, _buyer, 'Trade started. Both parties must propose & sign terms before deposit confirmation.', true);

  RETURN v_trade_id;
END; $$;

-- 6. sign_terms
CREATE OR REPLACE FUNCTION public.sign_terms(_trade_id uuid, _caller uuid, _signature text, _terms text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v trades%rowtype;
  v_side text;
  v_required_phrase text;
  v_norm text;
BEGIN
  SELECT * INTO v FROM trades WHERE id = _trade_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trade not found'; END IF;
  IF v.status NOT IN ('awaiting_agreement','pending_payment') THEN
    RAISE EXCEPTION 'Trade not awaiting agreement';
  END IF;

  IF v.buyer_id = _caller THEN
    v_side := 'buyer';
    v_required_phrase := 'I AGREE TO TERMS AND CONDITIONS OF THE SELLER';
  ELSIF v.seller_id = _caller THEN
    v_side := 'seller';
    v_required_phrase := 'I AGREE TO TERMS AND CONDITIONS OF THE BUYER';
  ELSE
    RAISE EXCEPTION 'Not a participant';
  END IF;

  v_norm := upper(btrim(_signature));
  IF v_norm <> v_required_phrase THEN
    RAISE EXCEPTION 'Signature must be exactly: %', v_required_phrase;
  END IF;

  IF v_side = 'buyer' THEN
    UPDATE trades SET signature_buyer = _signature, signed_by_buyer_at = now(),
      terms_buyer = COALESCE(_terms, terms_buyer) WHERE id = _trade_id;
  ELSE
    UPDATE trades SET signature_seller = _signature, signed_by_seller_at = now(),
      terms_seller = COALESCE(_terms, terms_seller) WHERE id = _trade_id;
  END IF;

  INSERT INTO trade_messages(trade_id, sender_id, body, is_system)
  VALUES (_trade_id, _caller, v_side || ' signed terms.', true);

  -- Both signed? advance
  SELECT * INTO v FROM trades WHERE id = _trade_id;
  IF v.signed_by_buyer_at IS NOT NULL AND v.signed_by_seller_at IS NOT NULL AND v.status = 'awaiting_agreement' THEN
    UPDATE trades SET status = 'awaiting_seller_confirm' WHERE id = _trade_id;
    INSERT INTO trade_messages(trade_id, sender_id, body, is_system)
    VALUES (_trade_id, _caller, 'Both parties signed. Seller, please confirm buyer''s escrow deposit.', true);
  END IF;
END; $$;

-- 7. confirm_buyer_deposit
CREATE OR REPLACE FUNCTION public.confirm_buyer_deposit(_trade_id uuid, _caller uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v trades%rowtype;
BEGIN
  SELECT * INTO v FROM trades WHERE id = _trade_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trade not found'; END IF;
  IF v.seller_id <> _caller THEN RAISE EXCEPTION 'Only seller can confirm deposit'; END IF;
  IF v.status <> 'awaiting_seller_confirm' THEN RAISE EXCEPTION 'Trade not in deposit-confirm step'; END IF;
  UPDATE trades SET status = 'paid', deposit_confirmed_at = now(), paid_at = now() WHERE id = _trade_id;
  INSERT INTO trade_messages(trade_id, sender_id, body, is_system)
  VALUES (_trade_id, _caller, 'Seller confirmed buyer''s escrow deposit. Buyer must release after fiat is settled.', true);
END; $$;

-- 8. Rewrite release_trade: buyer releases, crypto goes from buyer-escrow to seller
CREATE OR REPLACE FUNCTION public.release_trade(_trade_id uuid, _caller uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v trades%rowtype; v_net numeric(24,8);
BEGIN
  SELECT * INTO v FROM trades WHERE id = _trade_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trade not found'; END IF;
  IF v.buyer_id <> _caller AND NOT public.is_staff(_caller) THEN
    RAISE EXCEPTION 'Only buyer can release';
  END IF;
  IF v.status NOT IN ('paid','disputed') THEN RAISE EXCEPTION 'Trade not releasable'; END IF;

  -- Remove from buyer's escrow (buyer deposited)
  UPDATE wallets SET escrow = escrow - v.crypto_amount
    WHERE user_id = v.buyer_id AND asset = v.asset;

  v_net := v.crypto_amount - v.fee_amount;

  -- Credit seller
  INSERT INTO wallets(user_id, asset, available) VALUES (v.seller_id, v.asset, v_net)
    ON CONFLICT (user_id, asset) DO UPDATE SET available = wallets.available + v_net;

  UPDATE trades SET status='released', released_at=now() WHERE id=_trade_id;

  INSERT INTO wallet_transactions(user_id, asset, kind, amount, trade_id, note) VALUES
    (v.buyer_id, v.asset, 'escrow_release', v.crypto_amount, _trade_id, 'Released from escrow to seller'),
    (v.seller_id, v.asset, 'escrow_release', v_net, _trade_id, 'Received from escrow'),
    (v.buyer_id, v.asset, 'fee', v.fee_amount, _trade_id, 'Platform fee');

  UPDATE profiles SET trades_completed = trades_completed + 1 WHERE user_id IN (v.buyer_id, v.seller_id);
  INSERT INTO trade_messages(trade_id, sender_id, body, is_system)
  VALUES (_trade_id, _caller, 'Crypto released to seller. Trade complete.', true);
END; $$;

-- 9. cancel_trade refunds buyer's escrow
CREATE OR REPLACE FUNCTION public.cancel_trade(_trade_id uuid, _caller uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v trades%rowtype;
BEGIN
  SELECT * INTO v FROM trades WHERE id = _trade_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trade not found'; END IF;
  IF v.buyer_id <> _caller AND v.seller_id <> _caller AND NOT public.is_staff(_caller) THEN
    RAISE EXCEPTION 'Not a participant';
  END IF;
  IF v.status NOT IN ('awaiting_agreement','awaiting_deposit','awaiting_seller_confirm','pending_payment') THEN
    RAISE EXCEPTION 'Trade cannot be cancelled now';
  END IF;

  UPDATE wallets SET escrow = escrow - v.crypto_amount, available = available + v.crypto_amount
    WHERE user_id = v.buyer_id AND asset = v.asset;
  UPDATE offers SET available_crypto = available_crypto + v.crypto_amount WHERE id = v.offer_id;
  UPDATE trades SET status='cancelled', cancelled_at=now() WHERE id=_trade_id;
  INSERT INTO wallet_transactions(user_id, asset, kind, amount, trade_id, note)
    VALUES (v.buyer_id, v.asset, 'escrow_refund', v.crypto_amount, _trade_id, 'Refunded from cancelled trade');
  INSERT INTO trade_messages(trade_id, sender_id, body, is_system) VALUES (_trade_id, _caller, 'Trade cancelled.', true);
END; $$;

-- 10. resolve_dispute updated to refund/award correctly with buyer-held escrow
CREATE OR REPLACE FUNCTION public.resolve_dispute(_trade_id uuid, _caller uuid, _award_to text, _note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v trades%rowtype; v_net numeric(24,8);
BEGIN
  IF NOT public.is_staff(_caller) THEN RAISE EXCEPTION 'Only staff can resolve'; END IF;
  SELECT * INTO v FROM trades WHERE id = _trade_id FOR UPDATE;
  IF v.status <> 'disputed' THEN RAISE EXCEPTION 'Trade not disputed'; END IF;

  IF _award_to = 'seller' THEN
    -- Award crypto to seller (buyer paid fiat but is being awarded against)
    UPDATE wallets SET escrow = escrow - v.crypto_amount WHERE user_id = v.buyer_id AND asset = v.asset;
    v_net := v.crypto_amount - v.fee_amount;
    INSERT INTO wallets(user_id, asset, available) VALUES (v.seller_id, v.asset, v_net)
      ON CONFLICT (user_id, asset) DO UPDATE SET available = wallets.available + v_net;
    UPDATE trades SET status='released', released_at=now() WHERE id=_trade_id;
    UPDATE disputes SET status='resolved_seller', resolved_by=_caller, resolution_note=_note, resolved_at=now() WHERE trade_id=_trade_id;
  ELSIF _award_to = 'buyer' THEN
    -- Refund buyer's escrowed crypto
    UPDATE wallets SET escrow = escrow - v.crypto_amount, available = available + v.crypto_amount
      WHERE user_id = v.buyer_id AND asset = v.asset;
    UPDATE offers SET available_crypto = available_crypto + v.crypto_amount WHERE id = v.offer_id;
    UPDATE trades SET status='cancelled', cancelled_at=now() WHERE id=_trade_id;
    UPDATE disputes SET status='resolved_buyer', resolved_by=_caller, resolution_note=_note, resolved_at=now() WHERE trade_id=_trade_id;
  ELSE
    RAISE EXCEPTION 'award_to must be buyer or seller';
  END IF;

  INSERT INTO trade_messages(trade_id, sender_id, body, is_system)
  VALUES (_trade_id, _caller, 'Dispute resolved in favor of '||_award_to||'. '||COALESCE(_note,''), true);
END; $$;
