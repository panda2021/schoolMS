-- Migration 0027: Feature-permission framework (fine-grained capabilities)
-- Implements the RBAC "features matrix" from the personalization plan (Phase 2).
--
-- Model (locked decisions D3, D4, D6):
--   * Capabilities are fine-grained: '<feature>.<action>' (e.g. 'attendance.record'). [D6]
--   * A user's EFFECTIVE capabilities =
--         role defaults (role_features)  UNION  per-user additive grants (user_feature_overrides).
--   * Overrides can only ADD, never remove (no deny rows). [D3]
--   * super_admin implicitly has ALL capabilities (never stored, always allowed).
--   * Homeroom-teacher privilege bumps are just user_feature_overrides rows. [D4]
--
-- This migration is ADDITIVE and NON-BREAKING: existing role-based RLS on domain
-- tables is untouched. The seeded role defaults reproduce today's behavior exactly,
-- so gating the UI on capabilities changes nothing until an admin edits the matrix.
-- A later phase (5) moves domain-table RLS onto user_can().

-- ---------------------------------------------------------------------------
-- 1. Catalog of capabilities
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.features (
  key         text PRIMARY KEY,          -- '<feature>.<action>', e.g. 'attendance.record'
  feature     text NOT NULL,             -- group key, e.g. 'attendance'
  action      text NOT NULL,             -- 'view' | 'create' | 'edit' | 'delete' | 'export' | ...
  label       text NOT NULL,             -- human label for the matrix UI
  description text,
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. Role default matrix (edited by super_admin, applies platform-wide)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.role_features (
  role_key    text NOT NULL REFERENCES public.roles(key)     ON DELETE CASCADE,
  feature_key text NOT NULL REFERENCES public.features(key)  ON DELETE CASCADE,
  PRIMARY KEY (role_key, feature_key)
);

-- ---------------------------------------------------------------------------
-- 3. Per-user additive grants (never subtractive) [D3]
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_feature_overrides (
  user_id     uuid NOT NULL REFERENCES public.users(id)      ON DELETE CASCADE,
  feature_key text NOT NULL REFERENCES public.features(key)  ON DELETE CASCADE,
  granted_by  uuid REFERENCES public.users(id)               ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, feature_key)
);
CREATE INDEX IF NOT EXISTS idx_user_feature_overrides_user ON public.user_feature_overrides(user_id);

-- ---------------------------------------------------------------------------
-- 4. Capability check helper: user_can('feature.action')
--    SECURITY DEFINER so it can read role_features / users regardless of the
--    caller's RLS. Safe: it only ever returns a boolean about the caller.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_can(p_feature_key text, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.is_super_admin(p_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.role_features rf
      JOIN public.users u ON u.id = p_user_id
      WHERE rf.role_key = u.role_key
        AND rf.feature_key = p_feature_key
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_feature_overrides o
      WHERE o.user_id = p_user_id
        AND o.feature_key = p_feature_key
    );
$$;

-- ---------------------------------------------------------------------------
-- 5. Effective capability set for the current user (drives the useFeature hook)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_features()
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  -- super_admin: the entire catalog
  SELECT f.key
  FROM public.features f
  WHERE public.is_super_admin(auth.uid())
  UNION
  -- role defaults
  SELECT rf.feature_key
  FROM public.role_features rf
  JOIN public.users u ON u.id = auth.uid()
  WHERE rf.role_key = u.role_key
  UNION
  -- per-user additive grants
  SELECT o.feature_key
  FROM public.user_feature_overrides o
  WHERE o.user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.user_can(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_features() TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.features               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_features          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_feature_overrides ENABLE ROW LEVEL SECURITY;

-- features catalog: any authenticated user may read; only super_admin writes.
DROP POLICY IF EXISTS features_select_all ON public.features;
CREATE POLICY features_select_all ON public.features
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS features_write_super ON public.features;
CREATE POLICY features_write_super ON public.features
  FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- role default matrix: readable by all authenticated; only super_admin edits.
DROP POLICY IF EXISTS role_features_select_all ON public.role_features;
CREATE POLICY role_features_select_all ON public.role_features
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS role_features_write_super ON public.role_features;
CREATE POLICY role_features_write_super ON public.role_features
  FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- per-user overrides:
--   SELECT: self, a same-school school_admin, or super_admin
--   INSERT/DELETE: a same-school school_admin, or super_admin (add-only model; no UPDATE) [D3]
DROP POLICY IF EXISTS ufo_select_scope ON public.user_feature_overrides;
CREATE POLICY ufo_select_scope ON public.user_feature_overrides
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_super_admin()
    OR (public.is_school_admin() AND public.is_in_same_school(user_id))
  );
DROP POLICY IF EXISTS ufo_insert_admin ON public.user_feature_overrides;
CREATE POLICY ufo_insert_admin ON public.user_feature_overrides
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (public.is_school_admin() AND public.is_in_same_school(user_id))
  );
DROP POLICY IF EXISTS ufo_delete_admin ON public.user_feature_overrides;
CREATE POLICY ufo_delete_admin ON public.user_feature_overrides
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin()
    OR (public.is_school_admin() AND public.is_in_same_school(user_id))
  );

-- ---------------------------------------------------------------------------
-- 7. Seed the capability catalog [D6 fine-grained]
-- ---------------------------------------------------------------------------
INSERT INTO public.features (key, feature, action, label, sort_order) VALUES
  ('classes.view',        'classes',      'view',   'View classes',              10),
  ('classes.create',      'classes',      'create', 'Create classes',            11),
  ('classes.edit',        'classes',      'edit',   'Edit classes',              12),
  ('classes.delete',      'classes',      'delete', 'Delete classes',            13),

  ('students.view',       'students',     'view',   'View students',             20),
  ('students.create',     'students',     'create', 'Add students',              21),
  ('students.edit',       'students',     'edit',   'Edit students',             22),
  ('students.delete',     'students',     'delete', 'Delete students',           23),

  ('teachers.view',       'teachers',     'view',   'View teachers',             30),
  ('teachers.invite',     'teachers',     'invite', 'Invite teachers',           31),
  ('teachers.edit',       'teachers',     'edit',   'Edit teachers',             32),
  ('teachers.delete',     'teachers',     'delete', 'Remove teachers',           33),

  ('attendance.view',     'attendance',   'view',   'View attendance',           40),
  ('attendance.record',   'attendance',   'record', 'Take/record attendance',    41),
  ('attendance.export',   'attendance',   'export', 'Export attendance',         42),

  ('grades.view',         'grades',       'view',   'View grades',               50),
  ('grades.edit',         'grades',       'edit',   'Enter/edit grades',         51),

  ('report_cards.view',   'report_cards', 'view',   'View report cards',         60),
  ('report_cards.export', 'report_cards', 'export', 'Export report cards',       61),

  ('updates.view',        'updates',      'view',   'View daily updates',        70),
  ('updates.post',        'updates',      'post',   'Post daily updates',        71),
  ('updates.delete',      'updates',      'delete', 'Delete daily updates',      72),

  ('announcements.view',  'announcements','view',   'View announcements',        80),
  ('announcements.post',  'announcements','post',   'Post announcements',        81),
  ('announcements.delete','announcements','delete', 'Delete announcements',      82),

  ('messages.view',       'messages',     'view',   'View messages',             90),
  ('messages.send',       'messages',     'send',   'Send messages',             91),

  ('reports.view',        'reports',      'view',   'View progress reports',    100),
  ('reports.create',      'reports',      'create', 'Create progress reports',  101),
  ('reports.delete',      'reports',      'delete', 'Delete progress reports',  102),

  ('search.use',          'search',       'use',    'Use search',               110),

  ('import.use',          'import',       'use',    'Bulk import',              120),

  ('helpdesk.use',        'helpdesk',     'use',    'Open helpdesk tickets',    130),
  ('helpdesk.manage',     'helpdesk',     'manage', 'Manage all helpdesk tickets',131),

  ('curriculum.view',     'curriculum',   'view',   'View curriculum/subjects', 140),
  ('curriculum.edit',     'curriculum',   'edit',   'Edit curriculum/subjects', 141)
ON CONFLICT (key) DO UPDATE
  SET feature = EXCLUDED.feature,
      action  = EXCLUDED.action,
      label   = EXCLUDED.label,
      sort_order = EXCLUDED.sort_order;

-- ---------------------------------------------------------------------------
-- 8. Seed role defaults to match CURRENT behavior (non-breaking baseline)
--    super_admin is intentionally NOT seeded — it is implicitly all-capable.
-- ---------------------------------------------------------------------------
INSERT INTO public.role_features (role_key, feature_key) VALUES
  -- school_admin: full school management (everything except helpdesk.manage)
  ('school_admin','classes.view'),  ('school_admin','classes.create'), ('school_admin','classes.edit'), ('school_admin','classes.delete'),
  ('school_admin','students.view'), ('school_admin','students.create'),('school_admin','students.edit'),('school_admin','students.delete'),
  ('school_admin','teachers.view'), ('school_admin','teachers.invite'),('school_admin','teachers.edit'),('school_admin','teachers.delete'),
  ('school_admin','attendance.view'),('school_admin','attendance.record'),('school_admin','attendance.export'),
  ('school_admin','grades.view'),   ('school_admin','grades.edit'),
  ('school_admin','report_cards.view'),('school_admin','report_cards.export'),
  ('school_admin','updates.view'),  ('school_admin','updates.post'),   ('school_admin','updates.delete'),
  ('school_admin','announcements.view'),('school_admin','announcements.post'),('school_admin','announcements.delete'),
  ('school_admin','messages.view'), ('school_admin','messages.send'),
  ('school_admin','reports.view'),  ('school_admin','reports.create'), ('school_admin','reports.delete'),
  ('school_admin','search.use'),
  ('school_admin','import.use'),
  ('school_admin','helpdesk.use'),
  ('school_admin','curriculum.view'),('school_admin','curriculum.edit'),

  -- teacher: manage own classes/students, take attendance, grade, post, message
  ('teacher','classes.view'),   ('teacher','classes.create'), ('teacher','classes.edit'),
  ('teacher','students.view'),
  ('teacher','attendance.view'),('teacher','attendance.record'),
  ('teacher','grades.view'),    ('teacher','grades.edit'),
  ('teacher','updates.view'),   ('teacher','updates.post'),
  ('teacher','announcements.view'),('teacher','announcements.post'),
  ('teacher','messages.view'),  ('teacher','messages.send'),
  ('teacher','reports.view'),   ('teacher','reports.create'),
  ('teacher','search.use'),
  ('teacher','helpdesk.use'),
  ('teacher','curriculum.view'),

  -- parent: communication surfaces only. Their read-only, child-scoped access
  -- to students/attendance/grades is enforced today by existing RLS (via
  -- parent_students) and reached from the parent dashboard, not the nav. Phase 5
  -- will introduce dedicated child-scoped capabilities when it gates those pages;
  -- until then, seeding parent with those *.view keys would surface new nav items.
  ('parent','updates.view'),
  ('parent','announcements.view'),
  ('parent','messages.view'),   ('parent','messages.send'),
  ('parent','reports.view'),
  ('parent','helpdesk.use')
ON CONFLICT (role_key, feature_key) DO NOTHING;
