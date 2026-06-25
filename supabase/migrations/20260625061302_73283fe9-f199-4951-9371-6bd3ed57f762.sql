DROP POLICY IF EXISTS "voice_donations_authenticated_read" ON storage.objects;
DROP POLICY IF EXISTS "voice_donations_public_read" ON storage.objects;
CREATE POLICY "voice_donations_public_read" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'voice-donations');