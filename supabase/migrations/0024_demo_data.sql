-- Migration 0024: Demo data — seed/wipe RPCs callable from Super Admin dashboard
--
-- One-click "Populate demo data" creates 3 Ethiopian schools, 5 classes each,
-- and 10 students per class (150 students total). Each school gets a few
-- school-wide announcements written by the calling super_admin.
--
-- The schools are flagged with `is_demo = true`; "Wipe demo data" removes
-- them and ON DELETE CASCADE on all child tables takes care of classes,
-- students, enrollments and announcements.

-- ============================================================
-- 1. Add is_demo flag to schools
-- ============================================================
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_schools_is_demo ON public.schools(is_demo) WHERE is_demo;

-- ============================================================
-- 2. seed_demo_data — creates schools, classes, students, enrollments
--    and a few announcements. Returns a small JSON summary.
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_demo_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_school_names text[] := ARRAY[
    '[DEMO] Addis Ababa Academy',
    '[DEMO] Bahir Dar Heritage School',
    '[DEMO] Hawassa Hope Primary'
  ];
  v_school_addrs text[] := ARRAY[
    'Bole Sub-City, Addis Ababa',
    'Bahir Dar, Amhara Region',
    'Hawassa, Sidama Region'
  ];
  v_school_phones text[] := ARRAY['+251911000001', '+251911000002', '+251911000003'];
  v_class_names text[] := ARRAY['KG 1', 'KG 2', 'Grade 1', 'Grade 2', 'Grade 3'];
  v_class_grade text[] := ARRAY['KG', 'KG', '1', '2', '3'];

  v_first_boys text[] := ARRAY['Abel','Yonas','Dawit','Mikael','Daniel','Bereket','Henok','Tewodros','Samuel','Yared','Filmon','Kaleb','Robel','Solomon','Nathan'];
  v_first_girls text[] := ARRAY['Hanna','Saba','Helen','Tigist','Meron','Selamawit','Hiwot','Aster','Genet','Marta','Selam','Liya','Mahlet','Tsion','Bethel'];
  v_last_names text[] := ARRAY['Tesfaye','Bekele','Alemu','Gebremedhin','Haile','Mekonnen','Getachew','Solomon','Wolde','Lemma','Demissie','Tadesse','Abate','Kidane','Worku','Hailu'];

  v_school_id uuid;
  v_class_id uuid;
  v_student_id uuid;
  v_dob_base int;

  s_idx int;
  c_idx int;
  st_idx int;
  v_first text;
  v_last text;
  v_gender text;

  v_schools_created int := 0;
  v_classes_created int := 0;
  v_students_created int := 0;
  v_announcements_created int := 0;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only super_admin can seed demo data';
  END IF;

  FOR s_idx IN 1..array_length(v_school_names, 1) LOOP
    -- Create the school (idempotent: skip if already exists)
    SELECT id INTO v_school_id
    FROM public.schools
    WHERE name = v_school_names[s_idx] AND is_demo = true
    LIMIT 1;

    IF v_school_id IS NULL THEN
      INSERT INTO public.schools (name, address, phone, subscription_status, subscription_plan, is_demo)
      VALUES (v_school_names[s_idx], v_school_addrs[s_idx], v_school_phones[s_idx], 'active', 'standard', true)
      RETURNING id INTO v_school_id;
      v_schools_created := v_schools_created + 1;
    END IF;

    -- 5 classes
    FOR c_idx IN 1..array_length(v_class_names, 1) LOOP
      SELECT id INTO v_class_id
      FROM public.classes
      WHERE school_id = v_school_id AND name = v_class_names[c_idx]
      LIMIT 1;

      IF v_class_id IS NULL THEN
        INSERT INTO public.classes (school_id, name, grade_level)
        VALUES (v_school_id, v_class_names[c_idx], v_class_grade[c_idx])
        RETURNING id INTO v_class_id;
        v_classes_created := v_classes_created + 1;
      END IF;

      -- 10 students per class
      FOR st_idx IN 1..10 LOOP
        IF (st_idx % 2) = 0 THEN
          v_first := v_first_girls[1 + ((s_idx*7 + c_idx*3 + st_idx) % array_length(v_first_girls,1))];
          v_gender := 'female';
        ELSE
          v_first := v_first_boys[1 + ((s_idx*7 + c_idx*3 + st_idx) % array_length(v_first_boys,1))];
          v_gender := 'male';
        END IF;
        v_last := v_last_names[1 + ((s_idx*11 + c_idx*5 + st_idx*2) % array_length(v_last_names,1))];

        -- Realistic DOB: KG ~5yo, Gr1 ~7, Gr2 ~8, Gr3 ~9. KG2 ~6.
        v_dob_base := CASE v_class_grade[c_idx]
          WHEN 'KG' THEN 5 + (c_idx % 2)  -- 5 or 6
          WHEN '1' THEN 7
          WHEN '2' THEN 8
          WHEN '3' THEN 9
          ELSE 8
        END;

        INSERT INTO public.students (
          school_id, first_name, last_name, gender,
          date_of_birth, guardian_name, guardian_phone
        )
        VALUES (
          v_school_id,
          v_first,
          v_last,
          v_gender,
          (CURRENT_DATE - ((v_dob_base*365) + ((s_idx*c_idx*st_idx) % 200)) * INTERVAL '1 day')::date,
          v_last || ' ' || (CASE WHEN (st_idx % 3) = 0 THEN 'Senior' ELSE 'Sr.' END),
          '+2519' || lpad(((s_idx*100 + c_idx*10 + st_idx) % 100000000)::text, 8, '0')
        )
        RETURNING id INTO v_student_id;
        v_students_created := v_students_created + 1;

        INSERT INTO public.enrollments (school_id, class_id, student_id)
        VALUES (v_school_id, v_class_id, v_student_id);
      END LOOP;
    END LOOP;

    -- Sample announcements (only if v_uid exists in users)
    IF v_uid IS NOT NULL AND EXISTS (SELECT 1 FROM public.users WHERE id = v_uid) THEN
      INSERT INTO public.announcements (school_id, title, body, created_by)
      VALUES
        (v_school_id, 'Welcome to ' || replace(v_school_names[s_idx], '[DEMO] ', '') || '!',
         'A warm welcome to the new academic year. Classes start at 8:00 AM. Please review the dress code in the parent handbook.', v_uid),
        (v_school_id, 'Parent-Teacher Conference',
         'Parent-teacher conferences will be held next Friday from 2:00 to 5:00 PM. Please book your slot through the messages section.', v_uid),
        (v_school_id, 'School Holiday — Adwa Victory Day',
         'The school will be closed in observance of Adwa Victory Day. Classes resume the following day.', v_uid);
      v_announcements_created := v_announcements_created + 3;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'schools_created', v_schools_created,
    'classes_created', v_classes_created,
    'students_created', v_students_created,
    'announcements_created', v_announcements_created
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_demo_data() TO authenticated;

-- ============================================================
-- 3. wipe_demo_data — deletes all demo schools (cascades to children)
-- ============================================================
CREATE OR REPLACE FUNCTION public.wipe_demo_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only super_admin can wipe demo data';
  END IF;

  WITH del AS (
    DELETE FROM public.schools WHERE is_demo = true RETURNING 1
  )
  SELECT count(*) INTO v_count FROM del;

  RETURN jsonb_build_object('schools_deleted', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.wipe_demo_data() TO authenticated;

-- ============================================================
-- 4. demo_data_status — returns counts for the UI to show
-- ============================================================
CREATE OR REPLACE FUNCTION public.demo_data_status()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'schools', (SELECT count(*) FROM public.schools WHERE is_demo = true),
    'classes', (SELECT count(*) FROM public.classes c JOIN public.schools s ON s.id = c.school_id WHERE s.is_demo = true),
    'students', (SELECT count(*) FROM public.students st JOIN public.schools s ON s.id = st.school_id WHERE s.is_demo = true)
  );
$$;

GRANT EXECUTE ON FUNCTION public.demo_data_status() TO authenticated;
