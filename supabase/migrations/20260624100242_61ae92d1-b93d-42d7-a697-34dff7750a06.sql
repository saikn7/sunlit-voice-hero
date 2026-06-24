-- Phase 1: ensure has_role is callable by signed-in users
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;

-- Phase 2: contact_messages table for the public Contact page
CREATE TABLE public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  message text NOT NULL,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.contact_messages TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.contact_messages TO authenticated;
GRANT ALL ON public.contact_messages TO service_role;

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- Anyone (including logged-out visitors) may submit a message.
CREATE POLICY contact_messages_anyone_insert ON public.contact_messages
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Only admins can read or moderate submissions.
CREATE POLICY contact_messages_admin_select ON public.contact_messages
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY contact_messages_admin_update ON public.contact_messages
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY contact_messages_admin_delete ON public.contact_messages
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));