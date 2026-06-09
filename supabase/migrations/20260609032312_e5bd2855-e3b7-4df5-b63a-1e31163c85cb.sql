-- Ad Banners
CREATE TABLE public.ad_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('image','video','html')),
  media_url text,
  html_content text,
  link_url text,
  placements text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  priority int NOT NULL DEFAULT 0,
  starts_at timestamptz,
  ends_at timestamptz,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ad_banners TO anon, authenticated;
GRANT ALL ON public.ad_banners TO service_role;
ALTER TABLE public.ad_banners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active ads" ON public.ad_banners FOR SELECT USING (is_active = true);
CREATE POLICY "Admins manage ads" ON public.ad_banners FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_ad_banners_updated BEFORE UPDATE ON public.ad_banners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_ad_banners_active ON public.ad_banners(is_active, priority DESC);

-- Marketplace Products (admin-curated e-commerce)
CREATE TABLE public.marketplace_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  price numeric(18,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  image_url text,
  stock int NOT NULL DEFAULT -1,
  seller_wallet_address text,
  seller_wallet_asset text DEFAULT 'USDT',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','sold_out')),
  is_featured boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.marketplace_products TO anon, authenticated;
GRANT ALL ON public.marketplace_products TO service_role;
ALTER TABLE public.marketplace_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active products" ON public.marketplace_products FOR SELECT USING (status = 'active');
CREATE POLICY "Admins manage products" ON public.marketplace_products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_marketplace_products_updated BEFORE UPDATE ON public.marketplace_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_marketplace_products_status ON public.marketplace_products(status, is_featured DESC, created_at DESC);

-- Realtime so banner and product changes propagate instantly
ALTER PUBLICATION supabase_realtime ADD TABLE public.ad_banners;
ALTER PUBLICATION supabase_realtime ADD TABLE public.marketplace_products;