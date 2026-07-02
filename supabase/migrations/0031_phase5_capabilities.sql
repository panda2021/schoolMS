-- Migration 0031: Phase 5 capabilities
--
-- Two additions to the Phase 2 catalog (0027), both seeded to reproduce
-- current behavior or better — nothing is taken away from anyone:
--
--   1. children.attendance.view — the first child-scoped parent capability.
--      Parents' data access is already enforced by parent_students RLS; this
--      key only gates the UI surface (Attendance nav item + the parent branch
--      of the Attendance page). Seeded to parent, so parents now get a proper
--      "Attendance" nav item for their children's history instead of relying
--      on dashboard deep links.
--
--   2. users.manage_permissions — who may grant per-user additive overrides
--      (the D3/D4 mechanism, e.g. a homeroom-teacher bump). Seeded to
--      school_admin. The user_feature_overrides RLS from 0027 already limits
--      writes to same-school school_admins / super_admin; this key gates the
--      editor UI and rides the framework so it is itself toggleable.

INSERT INTO public.features (key, feature, action, label, sort_order) VALUES
  ('children.attendance.view', 'children', 'attendance_view',    'View own children''s attendance', 160),
  ('users.manage_permissions', 'users',    'manage_permissions', 'Grant extra permissions',         152)
ON CONFLICT (key) DO UPDATE
  SET feature = EXCLUDED.feature,
      action  = EXCLUDED.action,
      label   = EXCLUDED.label,
      sort_order = EXCLUDED.sort_order;

INSERT INTO public.role_features (role_key, feature_key) VALUES
  ('parent',       'children.attendance.view'),
  ('school_admin', 'users.manage_permissions')
ON CONFLICT DO NOTHING;

-- Seed correction: 0027 gave teachers classes.create / classes.edit, but the
-- Classes UI (and the wider product behavior) has always been admin-only for
-- those actions. Phase 5 wires the UI to these keys, so the matrix must match
-- reality or it would show teachers a capability they cannot exercise.
-- (A teacher can still be granted either key per-user via overrides once the
-- RLS refactor lands; today domain RLS would refuse the write.)
DELETE FROM public.role_features
WHERE role_key = 'teacher' AND feature_key IN ('classes.create', 'classes.edit');
