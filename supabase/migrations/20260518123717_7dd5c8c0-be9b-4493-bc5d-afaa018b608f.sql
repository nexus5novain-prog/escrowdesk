-- Profiles: ban metadata
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ban_reason text,
  ADD COLUMN IF NOT EXISTS banned_at timestamptz,
  ADD COLUMN IF NOT EXISTS banned_by uuid;

-- Warnings table
CREATE TABLE IF NOT EXISTS public.user_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  issued_by uuid NOT NULL,
  reason text NOT NULL,
  severity text NOT NULL DEFAULT 'minor',
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_warnings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own warnings" ON public.user_warnings;
CREATE POLICY "Users view own warnings"
  ON public.user_warnings FOR SELECT
  USING (auth.uid() = user_id OR is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff issue warnings" ON public.user_warnings;
CREATE POLICY "Staff issue warnings"
  ON public.user_warnings FOR INSERT
  WITH CHECK (
    issued_by = auth.uid() AND (
      has_role(auth.uid(), 'admin') OR
      has_role(auth.uid(), 'moderator') OR
      has_role(auth.uid(), 'judge')
    )
  );

DROP POLICY IF EXISTS "Admins manage warnings" ON public.user_warnings;
CREATE POLICY "Admins manage warnings"
  ON public.user_warnings FOR UPDATE
  USING (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins delete warnings" ON public.user_warnings;
CREATE POLICY "Admins delete warnings"
  ON public.user_warnings FOR DELETE
  USING (has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_user_warnings_user ON public.user_warnings(user_id, created_at DESC);

-- Update is_staff to include judge/finance/support
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin','moderator','judge','finance','support')
  );
$$;

-- warn user
CREATE OR REPLACE FUNCTION public.warn_user(_target uuid, _caller uuid, _reason text, _severity text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT (has_role(_caller,'admin') OR has_role(_caller,'moderator') OR has_role(_caller,'judge')) THEN
    RAISE EXCEPTION 'Not authorized to warn users';
  END IF;
  IF _severity NOT IN ('minor','major','final') THEN
    RAISE EXCEPTION 'Invalid severity (minor|major|final)';
  END IF;
  INSERT INTO user_warnings(user_id, issued_by, reason, severity)
    VALUES (_target, _caller, _reason, _severity) RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- ban user
CREATE OR REPLACE FUNCTION public.ban_user(_target uuid, _caller uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (has_role(_caller,'admin') OR has_role(_caller,'moderator')) THEN
    RAISE EXCEPTION 'Not authorized to ban users';
  END IF;
  UPDATE profiles SET is_banned=true, ban_reason=_reason, banned_at=now(), banned_by=_caller
    WHERE user_id=_target;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
END; $$;

-- unban
CREATE OR REPLACE FUNCTION public.unban_user(_target uuid, _caller uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(_caller,'admin') THEN RAISE EXCEPTION 'Only admins can unban'; END IF;
  UPDATE profiles SET is_banned=false, ban_reason=NULL, banned_at=NULL, banned_by=NULL
    WHERE user_id=_target;
END; $$;

-- assign role
CREATE OR REPLACE FUNCTION public.assign_role(_target uuid, _caller uuid, _role app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(_caller,'admin') THEN RAISE EXCEPTION 'Only admins can assign roles'; END IF;
  INSERT INTO user_roles(user_id, role) VALUES (_target, _role)
    ON CONFLICT (user_id, role) DO NOTHING;
END; $$;

-- revoke role
CREATE OR REPLACE FUNCTION public.revoke_role(_target uuid, _caller uuid, _role app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(_caller,'admin') THEN RAISE EXCEPTION 'Only admins can revoke roles'; END IF;
  DELETE FROM user_roles WHERE user_id=_target AND role=_role;
END; $$;