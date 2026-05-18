
-- 1. Update badge recomputation so admins are always Premium (and Trusted)
CREATE OR REPLACE FUNCTION public.recompute_user_badges(_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_is_admin boolean;
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

  v_is_admin := public.has_role(_user, 'admin'::app_role);

  v_trusted := v_is_admin OR (v_trades >= 5 AND v_distinct_raters_4plus >= 5 AND v_max_repeat >= 3 AND v_btc_usd >= 500);
  v_premium := v_is_admin OR (v_trusted AND v_trades >= 25 AND v_five >= 15 AND v_btc_usd >= 5000);

  UPDATE profiles SET
    rating_sum = v_sum,
    rating_count = v_count,
    five_star_count = v_five,
    distinct_partners = v_partners,
    btc_volume_usd = v_btc_usd,
    is_trusted = v_trusted,
    is_premium = v_premium,
    updated_at = now()
  WHERE user_id = _user;
END; $function$;

-- 2. Trigger: when user_roles changes, recompute badges so admin → premium happens live
CREATE OR REPLACE FUNCTION public.tg_user_roles_recompute()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_user_badges(OLD.user_id);
    RETURN OLD;
  ELSE
    PERFORM public.recompute_user_badges(NEW.user_id);
    RETURN NEW;
  END IF;
END; $function$;

DROP TRIGGER IF EXISTS user_roles_recompute_badges ON public.user_roles;
CREATE TRIGGER user_roles_recompute_badges
AFTER INSERT OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.tg_user_roles_recompute();

-- 3. Backfill: mark existing admins as premium/trusted
UPDATE public.profiles p
SET is_premium = true, is_trusted = true, updated_at = now()
WHERE EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = p.user_id AND ur.role = 'admin'
) AND (p.is_premium = false OR p.is_trusted = false);

-- 4. Enable realtime so the UI receives live category/role updates
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.user_roles REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_roles;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
