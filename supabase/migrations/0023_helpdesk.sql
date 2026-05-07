-- Migration 0023: Helpdesk — ticketing channel between school users and the super_admin
--
-- Tables:
--   helpdesk_tickets   — one ticket per issue, owned by the user who filed it
--   helpdesk_messages  — replies on a ticket (creator + super_admin)
--
-- Visibility:
--   - Ticket creator and super_admin can see and write on a ticket
--   - No-one else (other admins, teachers, parents in the same school)

-- ============================================================
-- 1. Tables
-- ============================================================
CREATE TABLE IF NOT EXISTS public.helpdesk_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_at_creation text NOT NULL,
  category text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_helpdesk_tickets_user ON public.helpdesk_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_helpdesk_tickets_school ON public.helpdesk_tickets(school_id);
CREATE INDEX IF NOT EXISTS idx_helpdesk_tickets_status ON public.helpdesk_tickets(status);

CREATE TABLE IF NOT EXISTS public.helpdesk_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.helpdesk_tickets(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  is_staff_reply boolean NOT NULL DEFAULT false,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_helpdesk_messages_ticket ON public.helpdesk_messages(ticket_id);

CREATE TRIGGER set_helpdesk_tickets_updated_at BEFORE UPDATE ON public.helpdesk_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 2. Optional: media_assets.helpdesk_message_id for attachments
-- ============================================================
ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS helpdesk_message_id uuid REFERENCES public.helpdesk_messages(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_media_assets_helpdesk ON public.media_assets(helpdesk_message_id);

-- ============================================================
-- 3. RLS
-- ============================================================
ALTER TABLE public.helpdesk_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.helpdesk_messages ENABLE ROW LEVEL SECURITY;

-- TICKETS: creator + super_admin
CREATE POLICY hd_tickets_select ON public.helpdesk_tickets FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin());

CREATE POLICY hd_tickets_insert ON public.helpdesk_tickets FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- creator can edit subject/body (e.g. add details), super_admin can update status
CREATE POLICY hd_tickets_update ON public.helpdesk_tickets FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_super_admin());

-- MESSAGES: visible to ticket creator + super_admin
CREATE POLICY hd_messages_select ON public.helpdesk_messages FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.helpdesk_tickets t
      WHERE t.id = helpdesk_messages.ticket_id
        AND t.user_id = auth.uid()
    )
  );

CREATE POLICY hd_messages_insert ON public.helpdesk_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      public.is_super_admin()
      OR EXISTS (
        SELECT 1 FROM public.helpdesk_tickets t
        WHERE t.id = helpdesk_messages.ticket_id
          AND t.user_id = auth.uid()
      )
    )
  );
