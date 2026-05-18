ALTER TABLE public.escrow_group_members ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
ALTER TABLE public.escrow_group_members ADD COLUMN IF NOT EXISTS declined_at timestamptz;
ALTER TABLE public.escrow_groups ADD COLUMN IF NOT EXISTS deposit_verified_at timestamptz;

-- Pending invites for the buyer who created groups (seller not yet accepted) should keep status awaiting_counterparty
-- Backfill: any existing seller members get accepted_at=now() so they don't appear as pending
UPDATE public.escrow_group_members SET accepted_at = now() WHERE accepted_at IS NULL AND role IN ('seller','buyer','moderator');