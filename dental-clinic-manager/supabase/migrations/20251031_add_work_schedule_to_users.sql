-- Migration: Add work_schedule to users table
-- Date: 2025-10-31
-- Description: Add work_schedule JSONB column to store individual employee work schedules

-- =====================================================================
-- 1. Add work_schedule column to users table
-- =====================================================================
ALTER TABLE users
ADD COLUMN IF NOT EXISTS work_schedule JSONB DEFAULT NULL;

-- =====================================================================
-- 2. Add comment for documentation
-- =====================================================================
COMMENT ON COLUMN users.work_schedule IS '개인 근무 스케줄 (요일별 근무시간)
구조: {
  "monday": {"start": "09:00", "end": "18:00", "breakStart": "12:00", "breakEnd": "13:00", "isWorking": true},
  "tuesday": {"start": "09:00", "end": "18:00", "breakStart": "12:00", "breakEnd": "13:00", "isWorking": true},
  ...
  "sunday": {"start": null, "end": null, "breakStart": null, "breakEnd": null, "isWorking": false}
}';

-- =====================================================================
-- 3. Create function to initialize work schedule from clinic hours
-- =====================================================================
CREATE OR REPLACE FUNCTION initialize_work_schedule_from_clinic(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_clinic_id UUID;
  v_clinic_hours RECORD;
  v_work_schedule JSONB := '{}'::jsonb;
  v_day_names TEXT[] := ARRAY['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  v_day_name TEXT;
BEGIN
  -- Get user's clinic_id
  SELECT clinic_id INTO v_clinic_id
  FROM users
  WHERE id = p_user_id;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'User does not have a clinic_id';
  END IF;

  -- Loop through each day of week (0-6)
  FOR i IN 0..6 LOOP
    v_day_name := v_day_names[i + 1];

    -- Get clinic hours for this day
    SELECT * INTO v_clinic_hours
    FROM clinic_hours
    WHERE clinic_id = v_clinic_id AND day_of_week = i;

    -- Build work schedule for this day
    IF FOUND AND v_clinic_hours.is_open THEN
      v_work_schedule := v_work_schedule || jsonb_build_object(
        v_day_name,
        jsonb_build_object(
          'start', v_clinic_hours.open_time::text,
          'end', v_clinic_hours.close_time::text,
          'breakStart', v_clinic_hours.break_start::text,
          'breakEnd', v_clinic_hours.break_end::text,
          'isWorking', true
        )
      );
    ELSE
      -- Day is closed or no data
      v_work_schedule := v_work_schedule || jsonb_build_object(
        v_day_name,
        jsonb_build_object(
          'start', null,
          'end', null,
          'breakStart', null,
          'breakEnd', null,
          'isWorking', false
        )
      );
    END IF;
  END LOOP;

  RETURN v_work_schedule;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 4. Create function to auto-initialize work schedule on user creation
-- =====================================================================
CREATE OR REPLACE FUNCTION auto_initialize_work_schedule()
RETURNS TRIGGER AS $$
BEGIN
  -- Only initialize if:
  -- 1. work_schedule is NULL
  -- 2. User has a clinic_id
  -- 3. User is not master_admin or owner
  IF NEW.work_schedule IS NULL
     AND NEW.clinic_id IS NOT NULL
     AND NEW.role NOT IN ('master_admin', 'owner') THEN

    BEGIN
      NEW.work_schedule := initialize_work_schedule_from_clinic(NEW.id);
      RAISE NOTICE 'Auto-initialized work_schedule for user %', NEW.id;
    EXCEPTION WHEN OTHERS THEN
      -- If clinic hours don't exist, leave work_schedule as NULL
      RAISE NOTICE 'Could not auto-initialize work_schedule for user %: %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 5. Create trigger to auto-initialize work schedule
-- =====================================================================
DROP TRIGGER IF EXISTS trigger_auto_initialize_work_schedule ON users;

CREATE TRIGGER trigger_auto_initialize_work_schedule
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION auto_initialize_work_schedule();

-- =====================================================================
-- 6. Create helper function to get work schedule with fallback
-- =====================================================================
CREATE OR REPLACE FUNCTION get_user_work_schedule(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_work_schedule JSONB;
BEGIN
  -- Get work schedule from users table
  SELECT work_schedule INTO v_work_schedule
  FROM users
  WHERE id = p_user_id;

  -- If work_schedule is NULL, try to initialize from clinic hours
  IF v_work_schedule IS NULL THEN
    BEGIN
      v_work_schedule := initialize_work_schedule_from_clinic(p_user_id);

      -- Update user's work_schedule
      UPDATE users
      SET work_schedule = v_work_schedule
      WHERE id = p_user_id;

      RAISE NOTICE 'Initialized work_schedule for user %', p_user_id;
    EXCEPTION WHEN OTHERS THEN
      -- Return default schedule if clinic hours don't exist
      v_work_schedule := '{
        "monday": {"start": "09:00", "end": "18:00", "breakStart": "12:00", "breakEnd": "13:00", "isWorking": true},
        "tuesday": {"start": "09:00", "end": "18:00", "breakStart": "12:00", "breakEnd": "13:00", "isWorking": true},
        "wednesday": {"start": "09:00", "end": "18:00", "breakStart": "12:00", "breakEnd": "13:00", "isWorking": true},
        "thursday": {"start": "09:00", "end": "18:00", "breakStart": "12:00", "breakEnd": "13:00", "isWorking": true},
        "friday": {"start": "09:00", "end": "18:00", "breakStart": "12:00", "breakEnd": "13:00", "isWorking": true},
        "saturday": {"start": "09:00", "end": "14:00", "breakStart": null, "breakEnd": null, "isWorking": true},
        "sunday": {"start": null, "end": null, "breakStart": null, "breakEnd": null, "isWorking": false}
      }'::jsonb;

      RAISE NOTICE 'Using default work_schedule for user %', p_user_id;
    END;
  END IF;

  RETURN v_work_schedule;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 7. Add index for better performance
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_users_work_schedule ON users USING gin (work_schedule);

-- =====================================================================
-- Migration Complete
-- =====================================================================
COMMENT ON FUNCTION initialize_work_schedule_from_clinic IS '병원 진료시간을 기반으로 개인 근무 스케줄 초기화';
COMMENT ON FUNCTION get_user_work_schedule IS '사용자 근무 스케줄 조회 (없으면 자동 생성)';
COMMENT ON FUNCTION auto_initialize_work_schedule IS '신규 사용자 등록 시 근무 스케줄 자동 초기화';
