
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;

DROP POLICY IF EXISTS "avatars_auth_read" ON storage.objects;
CREATE POLICY "avatars_auth_read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_self_insert" ON storage.objects;
CREATE POLICY "avatars_self_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "avatars_self_update" ON storage.objects;
CREATE POLICY "avatars_self_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "avatars_self_delete" ON storage.objects;
CREATE POLICY "avatars_self_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE OR REPLACE FUNCTION public.get_donor_level(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uploads int;
BEGIN
  SELECT count(*) INTO uploads FROM public.donations WHERE user_id = _user_id;
  IF uploads >= 50 THEN RETURN 'Platinum';
  ELSIF uploads >= 21 THEN RETURN 'Gold';
  ELSIF uploads >= 6 THEN RETURN 'Silver';
  ELSIF uploads >= 1 THEN RETURN 'Bronze';
  ELSE RETURN 'None';
  END IF;
END;
$$;
