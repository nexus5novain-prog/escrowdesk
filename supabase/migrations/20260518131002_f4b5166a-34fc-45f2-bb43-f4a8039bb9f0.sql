
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_premium boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_trusted boolean NOT NULL DEFAULT false;

CREATE TYPE listing_kind AS ENUM ('selling','seeking');
CREATE TYPE listing_status AS ENUM ('active','inactive','sold');

CREATE TABLE public.listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind listing_kind NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  amount numeric(24,2),
  currency text DEFAULT 'USD',
  contact_telegram text,
  contact_website text,
  status listing_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_listings_status_kind ON public.listings(status, kind, created_at DESC);
CREATE INDEX idx_listings_user ON public.listings(user_id);

ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads active listings"
  ON public.listings FOR SELECT
  USING (status = 'active' OR auth.uid() = user_id OR is_staff(auth.uid()));

CREATE POLICY "Owner inserts own listing"
  ON public.listings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owner updates own listing"
  ON public.listings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Staff updates any listing"
  ON public.listings FOR UPDATE
  USING (is_staff(auth.uid()));

CREATE POLICY "Owner deletes own listing"
  ON public.listings FOR DELETE
  USING (auth.uid() = user_id OR is_staff(auth.uid()));

CREATE TRIGGER trg_listings_updated
  BEFORE UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
