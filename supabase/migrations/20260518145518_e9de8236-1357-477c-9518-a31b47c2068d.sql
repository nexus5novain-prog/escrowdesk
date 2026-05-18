-- Extend asset enum
ALTER TYPE asset_type ADD VALUE IF NOT EXISTS 'USDC';
ALTER TYPE asset_type ADD VALUE IF NOT EXISTS 'ETH';

-- Profile payout addresses
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS wallet_address_usdc text,
  ADD COLUMN IF NOT EXISTS wallet_address_usdc_chain text DEFAULT 'ERC20',
  ADD COLUMN IF NOT EXISTS wallet_address_eth text;

-- Trade deposit proof
ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS deposit_tx_hash text,
  ADD COLUMN IF NOT EXISTS buyer_payout_address text,
  ADD COLUMN IF NOT EXISTS seller_payout_address text;

-- Escrow group status enum
DO $$ BEGIN
  CREATE TYPE escrow_group_status AS ENUM
    ('awaiting_counterparty','active','funded','released','cancelled','disputed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE escrow_member_role AS ENUM ('buyer','seller','moderator');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Escrow groups
CREATE TABLE IF NOT EXISTS public.escrow_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL,
  counterparty_id uuid,
  invited_telegram text,
  invited_username text,
  listing_id uuid,
  trade_id uuid,
  asset asset_type NOT NULL,
  amount numeric(24,8) NOT NULL,
  fiat_amount numeric(24,2),
  fiat_currency text NOT NULL DEFAULT 'USD',
  escrow_address text,
  escrow_address_chain text,
  deposit_tx_hash text,
  status escrow_group_status NOT NULL DEFAULT 'awaiting_counterparty',
  telegram_chat_id bigint,
  telegram_link_token text UNIQUE DEFAULT encode(gen_random_bytes(12),'hex'),
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.escrow_group_members (
  group_id uuid NOT NULL REFERENCES public.escrow_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role escrow_member_role NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.escrow_group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.escrow_groups(id) ON DELETE CASCADE,
  sender_id uuid,
  body text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  from_telegram boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_egm_group ON public.escrow_group_messages(group_id, created_at);
CREATE INDEX IF NOT EXISTS idx_eg_creator ON public.escrow_groups(creator_id);
CREATE INDEX IF NOT EXISTS idx_eg_counterparty ON public.escrow_groups(counterparty_id);
CREATE INDEX IF NOT EXISTS idx_egmem_user ON public.escrow_group_members(user_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.escrow_group_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.escrow_groups;

-- Helper: is current user a member of group?
CREATE OR REPLACE FUNCTION public.is_group_member(_group uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM escrow_group_members WHERE group_id=_group AND user_id=_user)
$$;

-- RLS
ALTER TABLE public.escrow_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escrow_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escrow_group_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Group readable by members or staff" ON public.escrow_groups;
CREATE POLICY "Group readable by members or staff" ON public.escrow_groups
  FOR SELECT USING (
    creator_id = auth.uid()
    OR counterparty_id = auth.uid()
    OR public.is_group_member(id, auth.uid())
    OR public.is_staff(auth.uid())
  );

DROP POLICY IF EXISTS "Members read membership" ON public.escrow_group_members;
CREATE POLICY "Members read membership" ON public.escrow_group_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_group_member(group_id, auth.uid())
    OR public.is_staff(auth.uid())
  );

DROP POLICY IF EXISTS "Members read messages" ON public.escrow_group_messages;
CREATE POLICY "Members read messages" ON public.escrow_group_messages
  FOR SELECT USING (
    public.is_group_member(group_id, auth.uid())
    OR public.is_staff(auth.uid())
  );

DROP POLICY IF EXISTS "Members send messages" ON public.escrow_group_messages;
CREATE POLICY "Members send messages" ON public.escrow_group_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND public.is_group_member(group_id, auth.uid())
  );

-- Mutations go through server functions (supabaseAdmin), so we omit INSERT/UPDATE policies on groups.

-- Touch updated_at on escrow_groups
DROP TRIGGER IF EXISTS trg_escrow_groups_touch ON public.escrow_groups;
CREATE TRIGGER trg_escrow_groups_touch BEFORE UPDATE ON public.escrow_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
