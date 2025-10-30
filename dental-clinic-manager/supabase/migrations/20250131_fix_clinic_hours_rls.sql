-- RLS 정책 수정: WITH CHECK 절 추가
-- 기존 정책 삭제
DROP POLICY IF EXISTS "Owners can manage clinic hours" ON clinic_hours;
DROP POLICY IF EXISTS "Owners can manage clinic holidays" ON clinic_holidays;

-- clinic_hours RLS 정책 재생성
CREATE POLICY "Owners can manage clinic hours"
  ON clinic_hours FOR ALL
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

-- clinic_holidays RLS 정책 재생성
CREATE POLICY "Owners can manage clinic holidays"
  ON clinic_holidays FOR ALL
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
