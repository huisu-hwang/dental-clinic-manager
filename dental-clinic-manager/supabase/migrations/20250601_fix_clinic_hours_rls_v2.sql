-- =====================================================
-- clinic_hours RLS 정책 수정 및 RPC 함수 생성
-- 문제: INSERT 시 WITH CHECK 절 누락으로 RLS 정책 위반 오류 발생
-- 해결: RLS 정책 수정 + SECURITY DEFINER RPC 함수 추가
-- =====================================================

-- 1. 기존 RLS 정책 삭제 및 재생성 (WITH CHECK 포함)
-- =====================================================

-- clinic_hours 정책 삭제
DROP POLICY IF EXISTS "Users can view their clinic hours" ON clinic_hours;
DROP POLICY IF EXISTS "Owners can manage clinic hours" ON clinic_hours;

-- clinic_holidays 정책 삭제
DROP POLICY IF EXISTS "Users can view their clinic holidays" ON clinic_holidays;
DROP POLICY IF EXISTS "Owners can manage clinic holidays" ON clinic_holidays;

-- clinic_hours: SELECT 정책
CREATE POLICY "Users can view their clinic hours"
  ON clinic_hours FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

-- clinic_hours: INSERT 정책 (WITH CHECK 필수)
CREATE POLICY "Owners can insert clinic hours"
  ON clinic_hours FOR INSERT
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('owner', 'manager')
    )
  );

-- clinic_hours: UPDATE 정책 (USING + WITH CHECK)
CREATE POLICY "Owners can update clinic hours"
  ON clinic_hours FOR UPDATE
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('owner', 'manager')
    )
  );

-- clinic_hours: DELETE 정책
CREATE POLICY "Owners can delete clinic hours"
  ON clinic_hours FOR DELETE
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('owner', 'manager')
    )
  );

-- clinic_holidays: SELECT 정책
CREATE POLICY "Users can view their clinic holidays"
  ON clinic_holidays FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

-- clinic_holidays: INSERT 정책
CREATE POLICY "Owners can insert clinic holidays"
  ON clinic_holidays FOR INSERT
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('owner', 'manager')
    )
  );

-- clinic_holidays: UPDATE 정책
CREATE POLICY "Owners can update clinic holidays"
  ON clinic_holidays FOR UPDATE
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('owner', 'manager')
    )
  );

-- clinic_holidays: DELETE 정책
CREATE POLICY "Owners can delete clinic holidays"
  ON clinic_holidays FOR DELETE
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('owner', 'manager')
    )
  );

-- 2. SECURITY DEFINER RPC 함수 생성 (RLS 우회)
-- =====================================================

-- 진료시간 업데이트 RPC 함수
CREATE OR REPLACE FUNCTION update_clinic_hours(
  p_clinic_id UUID,
  p_hours_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_clinic_id UUID;
  v_user_role TEXT;
  v_hour JSONB;
  v_result JSONB;
BEGIN
  -- 사용자 권한 확인
  SELECT clinic_id, role INTO v_user_clinic_id, v_user_role
  FROM users
  WHERE id = auth.uid();

  -- 권한 검증
  IF v_user_clinic_id IS NULL OR v_user_clinic_id != p_clinic_id THEN
    RAISE EXCEPTION 'Access denied: User does not belong to this clinic';
  END IF;

  IF v_user_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Access denied: Insufficient permissions';
  END IF;

  -- 기존 데이터 삭제
  DELETE FROM clinic_hours WHERE clinic_id = p_clinic_id;

  -- 새 데이터 삽입
  FOR v_hour IN SELECT * FROM jsonb_array_elements(p_hours_data)
  LOOP
    INSERT INTO clinic_hours (
      clinic_id,
      day_of_week,
      is_open,
      open_time,
      close_time,
      break_start,
      break_end
    ) VALUES (
      p_clinic_id,
      (v_hour->>'day_of_week')::INTEGER,
      (v_hour->>'is_open')::BOOLEAN,
      CASE WHEN v_hour->>'open_time' = '' THEN NULL ELSE (v_hour->>'open_time')::TIME END,
      CASE WHEN v_hour->>'close_time' = '' THEN NULL ELSE (v_hour->>'close_time')::TIME END,
      CASE WHEN v_hour->>'break_start' = '' OR v_hour->>'break_start' IS NULL THEN NULL ELSE (v_hour->>'break_start')::TIME END,
      CASE WHEN v_hour->>'break_end' = '' OR v_hour->>'break_end' IS NULL THEN NULL ELSE (v_hour->>'break_end')::TIME END
    );
  END LOOP;

  -- 결과 조회
  SELECT jsonb_agg(row_to_json(ch)::jsonb)
  INTO v_result
  FROM clinic_hours ch
  WHERE ch.clinic_id = p_clinic_id
  ORDER BY ch.day_of_week;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- 함수에 대한 권한 부여
GRANT EXECUTE ON FUNCTION update_clinic_hours(UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION update_clinic_hours IS '병원 진료시간을 업데이트하는 RPC 함수 (SECURITY DEFINER로 RLS 우회)';
