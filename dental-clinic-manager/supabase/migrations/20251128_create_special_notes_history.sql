-- ============================================================================
-- Migration: Create Special Notes History Table
-- Created: 2025-11-28
-- Purpose:
--   1. Create special_notes_history table to track all changes to special notes
--   2. Track author information and edit history
--   3. Support searching and filtering by date/content
-- ============================================================================

-- ====================
-- 1. Create special_notes_history table
-- ====================

CREATE TABLE IF NOT EXISTS special_notes_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE NOT NULL,
  report_date DATE NOT NULL,                    -- 보고서 날짜 (특이사항이 속한 날짜)
  content TEXT NOT NULL,                        -- 특이사항 내용
  author_id UUID REFERENCES users(id),          -- 작성자 ID
  author_name VARCHAR(100) NOT NULL,            -- 작성자 이름 (사용자가 삭제되어도 이름 유지)
  is_past_date_edit BOOLEAN DEFAULT false,      -- 과거 날짜 수정 여부
  edited_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(), -- 실제 수정/작성 시점
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ====================
-- 2. Create indexes for performance
-- ====================

CREATE INDEX idx_special_notes_history_clinic_id ON special_notes_history(clinic_id);
CREATE INDEX idx_special_notes_history_report_date ON special_notes_history(report_date);
CREATE INDEX idx_special_notes_history_clinic_date ON special_notes_history(clinic_id, report_date);
CREATE INDEX idx_special_notes_history_edited_at ON special_notes_history(edited_at);
CREATE INDEX idx_special_notes_history_author_id ON special_notes_history(author_id);

-- Full-text search index for content (Korean support)
CREATE INDEX idx_special_notes_history_content ON special_notes_history USING gin(to_tsvector('simple', content));

-- ====================
-- 3. Enable Row Level Security
-- ====================

ALTER TABLE special_notes_history ENABLE ROW LEVEL SECURITY;

-- ====================
-- 4. Create RLS policies
-- ====================

-- Users can view special notes history for their own clinic
CREATE POLICY "Clinic data isolation for special_notes_history" ON special_notes_history
    FOR ALL USING (
        clinic_id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        ) OR
        auth.uid() IN (
            SELECT id FROM users WHERE role = 'master_admin'
        )
    );

-- ====================
-- 5. Grant permissions
-- ====================

GRANT SELECT, INSERT ON special_notes_history TO authenticated;

-- ====================
-- 6. Comments
-- ====================

COMMENT ON TABLE special_notes_history IS '기타 특이사항 수정 히스토리 테이블';
COMMENT ON COLUMN special_notes_history.report_date IS '보고서 날짜 (특이사항이 속한 날짜)';
COMMENT ON COLUMN special_notes_history.content IS '특이사항 내용';
COMMENT ON COLUMN special_notes_history.author_id IS '작성/수정자 ID';
COMMENT ON COLUMN special_notes_history.author_name IS '작성/수정자 이름 (이력 보존용)';
COMMENT ON COLUMN special_notes_history.is_past_date_edit IS '과거 날짜 보고서 수정 여부';
COMMENT ON COLUMN special_notes_history.edited_at IS '실제 수정/작성 시점';

-- ============================================================================
-- Migration complete
-- ============================================================================
