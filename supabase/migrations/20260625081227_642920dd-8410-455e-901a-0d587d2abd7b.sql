
-- 1. Extend donations
ALTER TABLE public.donations
  ADD COLUMN IF NOT EXISTS report_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS risk_flag text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS risk_categories text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS copyright_confirmed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;

-- 2. Extend reports
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'other';

-- Prevent duplicate reports from the same user on the same donation
CREATE UNIQUE INDEX IF NOT EXISTS reports_unique_reporter_donation
  ON public.reports(donation_id, reporter_id);

-- 3. Trigger: recompute report_count + thresholds whenever a report changes
CREATE OR REPLACE FUNCTION public.recompute_donation_report_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_id uuid;
  cnt integer;
BEGIN
  target_id := COALESCE(NEW.donation_id, OLD.donation_id);
  SELECT count(*) INTO cnt FROM public.reports WHERE donation_id = target_id;
  UPDATE public.donations
  SET
    report_count = cnt,
    hidden = CASE WHEN cnt > 15 THEN true ELSE hidden END,
    risk_flag = CASE
      WHEN cnt > 15 THEN 'hidden'
      WHEN cnt > 5  THEN 'under_review'
      ELSE risk_flag
    END
  WHERE id = target_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reports_recompute ON public.reports;
CREATE TRIGGER trg_reports_recompute
AFTER INSERT OR DELETE ON public.reports
FOR EACH ROW EXECUTE FUNCTION public.recompute_donation_report_state();

-- 4. Donor score (0..5 stars)
CREATE OR REPLACE FUNCTION public.get_donor_score(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uploads int;
  reports_total int;
  risky int;
  score numeric;
BEGIN
  SELECT count(*) INTO uploads FROM public.donations WHERE user_id = _user_id;
  IF uploads = 0 THEN RETURN 0; END IF;
  SELECT COALESCE(sum(report_count),0), COALESCE(sum(CASE WHEN risk_flag <> 'normal' THEN 1 ELSE 0 END),0)
    INTO reports_total, risky
  FROM public.donations WHERE user_id = _user_id;
  -- base 3 stars, +1 for ≥5 clean uploads, +1 for ≥20 clean uploads, -reports impact
  score := 3
    + LEAST(2, GREATEST(0, (uploads - reports_total - risky)) / 5.0)
    - LEAST(3, (reports_total * 0.5) + risky);
  RETURN GREATEST(0, LEAST(5, round(score)::int));
END;
$$;

-- 5. Replace donations SELECT policy: hide auto-hidden audio from the public
DROP POLICY IF EXISTS donations_public_select ON public.donations;
CREATE POLICY donations_visibility_select
  ON public.donations FOR SELECT
  USING (
    hidden = false
    OR auth.uid() = user_id
    OR has_role(auth.uid(), 'admin'::app_role)
  );

GRANT EXECUTE ON FUNCTION public.get_donor_score(uuid) TO anon, authenticated;
