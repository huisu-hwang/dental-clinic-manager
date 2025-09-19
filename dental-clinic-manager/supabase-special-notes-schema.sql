-- daily_reports 테이블에 special_notes 컬럼 추가
-- 이 스크립트를 Supabase Dashboard의 SQL Editor에서 실행하세요

ALTER TABLE public.daily_reports 
ADD COLUMN IF NOT EXISTS special_notes text;

-- 컬럼 설명 추가
COMMENT ON COLUMN public.daily_reports.special_notes IS '기타 특이사항 (선택사항)';