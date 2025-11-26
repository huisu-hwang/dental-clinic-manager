-- 기타 특이사항 수정 이력 테이블 생성
-- 이 테이블은 daily_reports의 special_notes 변경 이력을 추적합니다.

CREATE TABLE IF NOT EXISTS public.special_notes_history (
  id BIGSERIAL PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  content TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_special_notes_history_clinic_date
ON public.special_notes_history(clinic_id, report_date);

CREATE INDEX IF NOT EXISTS idx_special_notes_history_created_at
ON public.special_notes_history(created_at DESC);

-- RLS 활성화
ALTER TABLE public.special_notes_history ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 같은 클리닉의 사용자만 조회 가능
CREATE POLICY "Users can view their clinic's special notes history"
ON public.special_notes_history
FOR SELECT
USING (
  clinic_id IN (
    SELECT clinic_id FROM public.users WHERE id = auth.uid()
  )
);

-- RLS 정책: 인증된 사용자만 이력 추가 가능
CREATE POLICY "Authenticated users can insert special notes history"
ON public.special_notes_history
FOR INSERT
WITH CHECK (
  clinic_id IN (
    SELECT clinic_id FROM public.users WHERE id = auth.uid()
  )
);

-- 테이블 설명 추가
COMMENT ON TABLE public.special_notes_history IS '기타 특이사항 수정 이력';
COMMENT ON COLUMN public.special_notes_history.clinic_id IS '클리닉 ID';
COMMENT ON COLUMN public.special_notes_history.report_date IS '보고서 날짜';
COMMENT ON COLUMN public.special_notes_history.content IS '특이사항 내용';
COMMENT ON COLUMN public.special_notes_history.created_by IS '작성자 ID';
COMMENT ON COLUMN public.special_notes_history.created_by_name IS '작성자 이름';
COMMENT ON COLUMN public.special_notes_history.created_at IS '작성 시간';
