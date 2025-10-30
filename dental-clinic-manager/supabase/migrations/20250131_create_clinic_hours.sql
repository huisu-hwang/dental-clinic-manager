-- 병원 진료시간 테이블
CREATE TABLE IF NOT EXISTS clinic_hours (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  is_open BOOLEAN DEFAULT true,
  open_time TIME,
  close_time TIME,
  break_start TIME,
  break_end TIME,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_clinic_day UNIQUE(clinic_id, day_of_week),
  CONSTRAINT valid_hours CHECK (
    (is_open = false) OR
    (open_time IS NOT NULL AND close_time IS NOT NULL AND open_time < close_time)
  ),
  CONSTRAINT valid_break CHECK (
    (break_start IS NULL AND break_end IS NULL) OR
    (break_start IS NOT NULL AND break_end IS NOT NULL AND break_start < break_end)
  )
);

-- 병원 휴진일 테이블
CREATE TABLE IF NOT EXISTS clinic_holidays (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  holiday_date DATE NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_clinic_holiday UNIQUE(clinic_id, holiday_date)
);

-- RLS 정책 활성화
ALTER TABLE clinic_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_holidays ENABLE ROW LEVEL SECURITY;

-- clinic_hours RLS 정책
CREATE POLICY "Users can view their clinic hours"
  ON clinic_hours FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Owners can manage clinic hours"
  ON clinic_hours FOR ALL
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('owner', 'manager')
    )
  );

-- clinic_holidays RLS 정책
CREATE POLICY "Users can view their clinic holidays"
  ON clinic_holidays FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Owners can manage clinic holidays"
  ON clinic_holidays FOR ALL
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('owner', 'manager')
    )
  );

-- 인덱스 생성
CREATE INDEX idx_clinic_hours_clinic ON clinic_hours(clinic_id);
CREATE INDEX idx_clinic_holidays_clinic ON clinic_holidays(clinic_id);
CREATE INDEX idx_clinic_holidays_date ON clinic_holidays(holiday_date);

-- 업데이트 트리거
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_clinic_hours_updated_at
  BEFORE UPDATE ON clinic_hours
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 기본 진료시간 데이터 생성 함수
CREATE OR REPLACE FUNCTION create_default_clinic_hours(p_clinic_id UUID)
RETURNS VOID AS $$
BEGIN
  -- 월~금: 09:00-18:00, 점심 12:00-13:00
  INSERT INTO clinic_hours (clinic_id, day_of_week, is_open, open_time, close_time, break_start, break_end)
  VALUES
    (p_clinic_id, 1, true, '09:00', '18:00', '12:00', '13:00'),
    (p_clinic_id, 2, true, '09:00', '18:00', '12:00', '13:00'),
    (p_clinic_id, 3, true, '09:00', '18:00', '12:00', '13:00'),
    (p_clinic_id, 4, true, '09:00', '18:00', '12:00', '13:00'),
    (p_clinic_id, 5, true, '09:00', '18:00', '12:00', '13:00'),
    (p_clinic_id, 6, true, '09:00', '14:00', NULL, NULL),
    (p_clinic_id, 0, false, NULL, NULL, NULL, NULL)
  ON CONFLICT (clinic_id, day_of_week) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE clinic_hours IS '병원 요일별 진료시간 설정';
COMMENT ON TABLE clinic_holidays IS '병원 특정 날짜 휴진일 설정';
COMMENT ON COLUMN clinic_hours.day_of_week IS '요일: 0=일요일, 1=월요일, ..., 6=토요일';
