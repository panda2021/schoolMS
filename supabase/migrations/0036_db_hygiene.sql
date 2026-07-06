-- Migration 0036: DB hygiene (audit 2026-07-06). Low-risk perf/hardening only.

-- Pin search_path on the 4 functions flagged with mutable search_path.
ALTER FUNCTION public.set_updated_at()               SET search_path = public;
ALTER FUNCTION public.add_updated_at_trigger(regclass) SET search_path = public;
ALTER FUNCTION public.current_user_id()              SET search_path = public;
ALTER FUNCTION public.media_asset_for_object(storage.objects) SET search_path = public, storage;

-- Drop exactly-duplicate unique constraints (identical columns to an existing
-- PK / unique key). ON CONFLICT still resolves against the remaining index.
ALTER TABLE public.parent_students DROP CONSTRAINT IF EXISTS parent_students_unique;   -- dup of PK (parent_id, student_id)
ALTER TABLE public.attendance      DROP CONSTRAINT IF EXISTS attendance_unique_per_day; -- dup of attendance_class_id_student_id_date_key

-- Covering indexes for hot foreign keys (perf).
CREATE INDEX IF NOT EXISTS idx_grades_subject_id           ON public.grades(subject_id);
CREATE INDEX IF NOT EXISTS idx_grades_assessment_type_id   ON public.grades(assessment_type_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id          ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_helpdesk_messages_sender_id ON public.helpdesk_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_parent_students_student_id  ON public.parent_students(student_id);
CREATE INDEX IF NOT EXISTS idx_announcements_created_by     ON public.announcements(created_by);
