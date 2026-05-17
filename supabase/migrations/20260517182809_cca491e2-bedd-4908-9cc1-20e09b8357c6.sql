
-- start_trade: buyer initiates trade against an offer.
create or replace function public.start_trade(
  _offer_id uuid,
  _buyer uuid,
  _fiat_amount numeric,
  _payment_method_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer offers%rowtype;
  v_seller uuid;
  v_buyer uuid;
  v_crypto numeric(24,8);
  v_fee numeric(24,8);
  v_fee_bps int;
  v_trade_id uuid;
begin
  select * into v_offer from offers where id = _offer_id for update;
  if not found then raise exception 'Offer not found'; end if;
  if v_offer.status <> 'active' then raise exception 'Offer not active'; end if;
  if _fiat_amount < v_offer.min_amount or _fiat_amount > v_offer.max_amount then
    raise exception 'Amount out of bounds';
  end if;
  if v_offer.maker_id = _buyer then raise exception 'Cannot trade with yourself'; end if;

  v_crypto := round(_fiat_amount / v_offer.price, 8);
  if v_crypto > v_offer.available_crypto then raise exception 'Not enough liquidity'; end if;

  -- Determine sides
  if v_offer.side = 'sell' then
    -- maker is selling crypto -> taker (buyer) buys crypto
    v_seller := v_offer.maker_id;
    v_buyer := _buyer;
  else
    -- maker wants to buy crypto -> taker sells crypto
    v_seller := _buyer;
    v_buyer := v_offer.maker_id;
  end if;

  select coalesce((value)::int, 100) into v_fee_bps from platform_settings where key='fee_bps';
  v_fee := round(v_crypto * v_fee_bps / 10000.0, 8);

  -- Lock crypto from seller's available -> escrow
  update wallets
    set available = available - v_crypto,
        escrow = escrow + v_crypto
    where user_id = v_seller and asset = v_offer.asset and available >= v_crypto;
  if not found then raise exception 'Seller has insufficient balance'; end if;

  -- Decrement offer availability
  update offers set available_crypto = available_crypto - v_crypto where id = _offer_id;

  insert into trades(offer_id, buyer_id, seller_id, asset, fiat_currency, price, crypto_amount, fiat_amount, fee_amount, payment_method_id, status)
  values (_offer_id, v_buyer, v_seller, v_offer.asset, v_offer.fiat_currency, v_offer.price, v_crypto, _fiat_amount, v_fee, _payment_method_id, 'pending_payment')
  returning id into v_trade_id;

  insert into wallet_transactions(user_id, asset, kind, amount, trade_id, note)
  values (v_seller, v_offer.asset, 'escrow_lock', v_crypto, v_trade_id, 'Locked into escrow');

  insert into trade_messages(trade_id, sender_id, body, is_system)
  values (v_trade_id, _buyer, 'Trade started. Buyer must send fiat then mark paid.', true);

  return v_trade_id;
end;
$$;

revoke execute on function public.start_trade(uuid, uuid, numeric, uuid) from public, anon, authenticated;

-- mark_trade_paid: buyer marks paid
create or replace function public.mark_trade_paid(_trade_id uuid, _caller uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v trades%rowtype;
begin
  select * into v from trades where id = _trade_id for update;
  if not found then raise exception 'Trade not found'; end if;
  if v.buyer_id <> _caller then raise exception 'Only buyer can mark paid'; end if;
  if v.status <> 'pending_payment' then raise exception 'Trade not awaiting payment'; end if;
  update trades set status='paid', paid_at=now() where id=_trade_id;
  insert into trade_messages(trade_id, sender_id, body, is_system) values (_trade_id, _caller, 'Buyer marked fiat as sent. Seller, please verify and release.', true);
end; $$;
revoke execute on function public.mark_trade_paid(uuid, uuid) from public, anon, authenticated;

-- release_trade: seller releases crypto to buyer
create or replace function public.release_trade(_trade_id uuid, _caller uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v trades%rowtype; v_net numeric(24,8);
begin
  select * into v from trades where id = _trade_id for update;
  if not found then raise exception 'Trade not found'; end if;
  if v.seller_id <> _caller and not public.is_staff(_caller) then raise exception 'Only seller can release'; end if;
  if v.status not in ('paid','disputed') then raise exception 'Trade not releasable'; end if;

  -- Remove from seller escrow
  update wallets set escrow = escrow - v.crypto_amount
    where user_id = v.seller_id and asset = v.asset;

  v_net := v.crypto_amount - v.fee_amount;
  -- Credit buyer
  insert into wallets(user_id, asset, available) values (v.buyer_id, v.asset, v_net)
    on conflict (user_id, asset) do update set available = wallets.available + v_net;

  update trades set status='released', released_at=now() where id=_trade_id;

  insert into wallet_transactions(user_id, asset, kind, amount, trade_id, note) values
    (v.seller_id, v.asset, 'escrow_release', v.crypto_amount, _trade_id, 'Released from escrow'),
    (v.buyer_id, v.asset, 'escrow_release', v_net, _trade_id, 'Received from escrow'),
    (v.seller_id, v.asset, 'fee', v.fee_amount, _trade_id, 'Platform fee');

  update profiles set trades_completed = trades_completed + 1 where user_id in (v.buyer_id, v.seller_id);
  insert into trade_messages(trade_id, sender_id, body, is_system) values (_trade_id, _caller, 'Crypto released to buyer. Trade complete.', true);
end; $$;
revoke execute on function public.release_trade(uuid, uuid) from public, anon, authenticated;

-- cancel_trade: only before payment, by either party; refunds escrow
create or replace function public.cancel_trade(_trade_id uuid, _caller uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v trades%rowtype;
begin
  select * into v from trades where id = _trade_id for update;
  if not found then raise exception 'Trade not found'; end if;
  if v.buyer_id <> _caller and v.seller_id <> _caller and not public.is_staff(_caller) then raise exception 'Not a participant'; end if;
  if v.status not in ('pending_payment') then raise exception 'Trade cannot be cancelled now'; end if;

  update wallets set escrow = escrow - v.crypto_amount, available = available + v.crypto_amount
    where user_id = v.seller_id and asset = v.asset;
  update offers set available_crypto = available_crypto + v.crypto_amount where id = v.offer_id;
  update trades set status='cancelled', cancelled_at=now() where id=_trade_id;
  insert into wallet_transactions(user_id, asset, kind, amount, trade_id, note)
    values (v.seller_id, v.asset, 'escrow_refund', v.crypto_amount, _trade_id, 'Refunded from cancelled trade');
  insert into trade_messages(trade_id, sender_id, body, is_system) values (_trade_id, _caller, 'Trade cancelled.', true);
end; $$;
revoke execute on function public.cancel_trade(uuid, uuid) from public, anon, authenticated;

-- open_dispute
create or replace function public.open_dispute(_trade_id uuid, _caller uuid, _reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v trades%rowtype; v_id uuid;
begin
  select * into v from trades where id = _trade_id for update;
  if not found then raise exception 'Trade not found'; end if;
  if v.buyer_id <> _caller and v.seller_id <> _caller then raise exception 'Not a participant'; end if;
  if v.status not in ('pending_payment','paid') then raise exception 'Cannot dispute this trade'; end if;
  update trades set status='disputed' where id=_trade_id;
  insert into disputes(trade_id, opened_by, reason) values (_trade_id, _caller, _reason) returning id into v_id;
  insert into trade_messages(trade_id, sender_id, body, is_system) values (_trade_id, _caller, 'Dispute opened: '||_reason, true);
  return v_id;
end; $$;
revoke execute on function public.open_dispute(uuid, uuid, text) from public, anon, authenticated;

-- resolve_dispute: staff only
create or replace function public.resolve_dispute(_trade_id uuid, _caller uuid, _award_to text, _note text)
returns void language plpgsql security definer set search_path = public as $$
declare v trades%rowtype; v_net numeric(24,8);
begin
  if not public.is_staff(_caller) then raise exception 'Only staff can resolve'; end if;
  select * into v from trades where id = _trade_id for update;
  if v.status <> 'disputed' then raise exception 'Trade not disputed'; end if;

  if _award_to = 'buyer' then
    update wallets set escrow = escrow - v.crypto_amount where user_id = v.seller_id and asset = v.asset;
    v_net := v.crypto_amount - v.fee_amount;
    insert into wallets(user_id, asset, available) values (v.buyer_id, v.asset, v_net)
      on conflict (user_id, asset) do update set available = wallets.available + v_net;
    update trades set status='released', released_at=now() where id=_trade_id;
    update disputes set status='resolved_buyer', resolved_by=_caller, resolution_note=_note, resolved_at=now() where trade_id=_trade_id;
  elsif _award_to = 'seller' then
    update wallets set escrow = escrow - v.crypto_amount, available = available + v.crypto_amount where user_id = v.seller_id and asset = v.asset;
    update offers set available_crypto = available_crypto + v.crypto_amount where id = v.offer_id;
    update trades set status='cancelled', cancelled_at=now() where id=_trade_id;
    update disputes set status='resolved_seller', resolved_by=_caller, resolution_note=_note, resolved_at=now() where trade_id=_trade_id;
  else
    raise exception 'award_to must be buyer or seller';
  end if;

  insert into trade_messages(trade_id, sender_id, body, is_system) values (_trade_id, _caller, 'Dispute resolved in favor of '||_award_to||'. '||coalesce(_note,''), true);
end; $$;
revoke execute on function public.resolve_dispute(uuid, uuid, text, text) from public, anon, authenticated;

-- credit_wallet / debit_wallet for admin adjustments and simulated deposits
create or replace function public.credit_wallet(_user uuid, _asset asset_type, _amount numeric, _note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into wallets(user_id, asset, available) values (_user, _asset, _amount)
    on conflict (user_id, asset) do update set available = wallets.available + _amount;
  insert into wallet_transactions(user_id, asset, kind, amount, note) values (_user, _asset, 'adjustment', _amount, _note);
end; $$;
revoke execute on function public.credit_wallet(uuid, asset_type, numeric, text) from public, anon, authenticated;

create or replace function public.debit_wallet(_user uuid, _asset asset_type, _amount numeric, _note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update wallets set available = available - _amount where user_id=_user and asset=_asset and available >= _amount;
  if not found then raise exception 'Insufficient balance'; end if;
  insert into wallet_transactions(user_id, asset, kind, amount, note) values (_user, _asset, 'adjustment', -_amount, _note);
end; $$;
revoke execute on function public.debit_wallet(uuid, asset_type, numeric, text) from public, anon, authenticated;
