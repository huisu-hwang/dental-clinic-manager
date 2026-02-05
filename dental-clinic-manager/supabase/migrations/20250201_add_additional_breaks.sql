-- 추가 휴게시간을 저장하기 위한 JSONB 컬럼 추가
-- 기존 break_start/break_end는 첫 번째 휴게시간용으로 유지
-- additional_breaks는 두 번째 이후 휴게시간을 JSON 배열로 저장

ALTER TABLE clinic_hours
ADD COLUMN IF NOT EXISTS additional_breaks JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN clinic_hours.additional_breaks IS '추가 휴게시간 배열 (예: [{"start": "15:00", "end": "15:30"}])';
