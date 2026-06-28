
-- 1. donations_anon_select: restrict SELECT to authenticated
DROP POLICY IF EXISTS donations_visibility_select ON public.donations;
CREATE POLICY donations_visibility_select ON public.donations
  FOR SELECT TO authenticated
  USING ((hidden = false) OR (auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));

-- 2. voice_donations_anon_read: owner/admin only, authenticated
DROP POLICY IF EXISTS voice_donations_public_read ON storage.objects;
CREATE POLICY voice_donations_authenticated_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'voice-donations'
    AND (
      (storage.foldername(name))[1] = (auth.uid())::text
      OR has_role(auth.uid(), 'admin'::app_role)
    )
  );

-- 3. avatars_any_authenticated_read: owner/admin only
DROP POLICY IF EXISTS avatars_auth_read ON storage.objects;
CREATE POLICY avatars_self_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR has_role(auth.uid(), 'admin'::app_role)
    )
  );

-- 4. contact_messages_self_select_missing: let submitters read their own rows
CREATE POLICY contact_messages_self_select ON public.contact_messages
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 5. SUPA_rls_policy_always_true: replace WITH CHECK (true) on contact_messages insert
DROP POLICY IF EXISTS contact_messages_anyone_insert ON public.contact_messages;
CREATE POLICY contact_messages_anon_insert ON public.contact_messages
  FOR INSERT TO anon
  WITH CHECK (user_id IS NULL);
CREATE POLICY contact_messages_auth_insert ON public.contact_messages
  FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());
