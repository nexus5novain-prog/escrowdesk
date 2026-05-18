
-- 1. Profile extensions
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS wallet_address_btc text,
  ADD COLUMN IF NOT EXISTS wallet_address_usdt text,
  ADD COLUMN IF NOT EXISTS btc_volume_usd numeric(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS distinct_partners integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS five_star_count integer NOT NULL DEFAULT 0;

-- 2. Ratings table
CREATE TABLE IF NOT EXISTS public.trade_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL,
  rater_id uuid NOT NULL,
  ratee_id uuid NOT NULL,
  stars smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trade_id, rater_id)
);

ALTER TABLE public.trade_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ratings publicly readable"
  ON public.trade_ratings FOR SELECT USING (true);

CREATE POLICY "Participants insert ratings"
  ON public.trade_ratings FOR INSERT
  WITH CHECK (
    rater_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.trades t
      WHERE t.id = trade_ratings.trade_id
        AND t.status = 'released'
        AND ((t.buyer_id = auth.uid() AND t.seller_id = ratee_id)
          OR (t.seller_id = auth.uid() AND t.buyer_id = ratee_id))
    )
  );

CREATE INDEX IF NOT EXISTS idx_trade_ratings_ratee ON public.trade_ratings(ratee_id);

-- 3. Recompute badge stats for a user
CREATE OR REPLACE FUNCTION public.recompute_user_badges(_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trades int;
  v_sum int;
  v_count int;
  v_five int;
  v_distinct_raters_4plus int;
  v_max_repeat int;
  v_partners int;
  v_btc_usd numeric;
  v_trusted boolean;
  v_premium boolean;
BEGIN
  SELECT COUNT(*) INTO v_trades
    FROM trades WHERE status='released' AND (buyer_id=_user OR seller_id=_user);

  SELECT COALESCE(SUM(stars),0), COUNT(*), COALESCE(SUM(CASE WHEN stars=5 THEN 1 ELSE 0 END),0)
    INTO v_sum, v_count, v_five
    FROM trade_ratings WHERE ratee_id=_user;

  SELECT COUNT(DISTINCT rater_id) INTO v_distinct_raters_4plus
    FROM trade_ratings WHERE ratee_id=_user AND stars >= 4;

  SELECT COALESCE(MAX(c),0) INTO v_max_repeat FROM (
    SELECT COUNT(*) AS c FROM trades
    WHERE status='released' AND (buyer_id=_user OR seller_id=_user)
    GROUP BY CASE WHEN buyer_id=_user THEN seller_id ELSE buyer_id END
  ) s;

  SELECT COUNT(DISTINCT CASE WHEN buyer_id=_user THEN seller_id ELSE buyer_id END)
    INTO v_partners
    FROM trades WHERE status='released' AND (buyer_id=_user OR seller_id=_user);

  SELECT COALESCE(SUM(
    CASE WHEN asset='BTC' THEN fiat_amount ELSE 0 END
  ),0) INTO v_btc_usd
    FROM trades WHERE status='released' AND (buyer_id=_user OR seller_id=_user);

  v_trusted := (v_trades >= 5 AND v_distinct_raters_4plus >= 5 AND v_max_repeat >= 3 AND v_btc_usd >= 500);
  v_premium := (v_trusted AND v_trades >= 25 AND v_five >= 15 AND v_btc_usd >= 5000);

  UPDATE profiles SET
    rating_sum = v_sum,
    rating_count = v_count,
    five_star_count = v_five,
    distinct_partners = v_partners,
    btc_volume_usd = v_btc_usd,
    is_trusted = v_trusted,
    is_premium = v_premium
  WHERE user_id = _user;
END; $$;

-- 4. Trigger after rating insert
CREATE OR REPLACE FUNCTION public.tg_trade_ratings_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.recompute_user_badges(NEW.ratee_id);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trade_ratings_recompute ON public.trade_ratings;
CREATE TRIGGER trade_ratings_recompute
AFTER INSERT ON public.trade_ratings
FOR EACH ROW EXECUTE FUNCTION public.tg_trade_ratings_after_insert();

-- 5. Patch release_trade to also recompute for both parties
CREATE OR REPLACE FUNCTION public.release_trade(_trade_id uuid, _caller uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v trades%rowtype; v_net numeric(24,8);
BEGIN
  SELECT * INTO v FROM trades WHERE id = _trade_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trade not found'; END IF;
  IF v.buyer_id <> _caller AND NOT public.is_staff(_caller) THEN
    RAISE EXCEPTION 'Only buyer can release';
  END IF;
  IF v.status NOT IN ('paid','disputed') THEN RAISE EXCEPTION 'Trade not releasable'; END IF;

  UPDATE wallets SET escrow = escrow - v.crypto_amount
    WHERE user_id = v.buyer_id AND asset = v.asset;

  v_net := v.crypto_amount - v.fee_amount;

  INSERT INTO wallets(user_id, asset, available) VALUES (v.seller_id, v.asset, v_net)
    ON CONFLICT (user_id, asset) DO UPDATE SET available = wallets.available + v_net;

  UPDATE trades SET status='released', released_at=now() WHERE id=_trade_id;

  INSERT INTO wallet_transactions(user_id, asset, kind, amount, trade_id, note) VALUES
    (v.buyer_id, v.asset, 'escrow_release', v.crypto_amount, _trade_id, 'Released from escrow to seller'),
    (v.seller_id, v.asset, 'escrow_release', v_net, _trade_id, 'Received from escrow'),
    (v.buyer_id, v.asset, 'fee', v.fee_amount, _trade_id, 'Platform fee');

  UPDATE profiles SET trades_completed = trades_completed + 1 WHERE user_id IN (v.buyer_id, v.seller_id);

  PERFORM public.recompute_user_badges(v.buyer_id);
  PERFORM public.recompute_user_badges(v.seller_id);

  INSERT INTO trade_messages(trade_id, sender_id, body, is_system)
  VALUES (_trade_id, _caller, 'Crypto released to seller. Trade complete.', true);
END; $function$;
