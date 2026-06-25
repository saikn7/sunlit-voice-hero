GRANT SELECT ON public.donations TO anon;
DROP POLICY IF EXISTS "donations_signed_in_select" ON public.donations;
DROP POLICY IF EXISTS "donations_public_select" ON public.donations;
CREATE POLICY "donations_public_select" ON public.donations FOR SELECT TO anon, authenticated USING (true);