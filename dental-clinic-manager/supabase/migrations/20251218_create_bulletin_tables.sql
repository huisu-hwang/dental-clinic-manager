-- 병원 게시판 테이블 생성
-- 2025-12-18
-- 공지사항, 문서 모음, 업무 할당 기능

-- =============================================
-- 1. 공지사항 테이블 (announcements)
-- =============================================
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'schedule',     -- 일정 (휴가, 회식 등)
    'holiday',      -- 연휴/휴진 일정
    'policy',       -- 취업규칙, 정책
    'welfare',      -- 복지 내용
    'general'       -- 일반 공지
  )),
  is_pinned BOOLEAN DEFAULT FALSE,
  is_important BOOLEAN DEFAULT FALSE,
  start_date DATE,            -- 일정 시작일 (schedule, holiday 카테고리용)
  end_date DATE,              -- 일정 종료일
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 공지사항 인덱스
CREATE INDEX IF NOT EXISTS idx_announcements_clinic_id ON announcements(clinic_id);
CREATE INDEX IF NOT EXISTS idx_announcements_category ON announcements(category);
CREATE INDEX IF NOT EXISTS idx_announcements_is_pinned ON announcements(is_pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON announcements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_start_date ON announcements(start_date);

-- 공지사항 RLS 활성화
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- 공지사항 RLS 정책: 같은 clinic의 사용자만 조회 가능
CREATE POLICY "Users can view clinic announcements"
  ON announcements FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

-- 공지사항 RLS 정책: 관리자만 생성 가능
CREATE POLICY "Admins can create announcements"
  ON announcements FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND clinic_id = announcements.clinic_id
        AND role IN ('master_admin', 'owner', 'vice_director', 'manager')
    )
  );

-- 공지사항 RLS 정책: 관리자만 수정 가능
CREATE POLICY "Admins can update announcements"
  ON announcements FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND clinic_id = announcements.clinic_id
        AND role IN ('master_admin', 'owner', 'vice_director', 'manager')
    )
  );

-- 공지사항 RLS 정책: 관리자만 삭제 가능
CREATE POLICY "Admins can delete announcements"
  ON announcements FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND clinic_id = announcements.clinic_id
        AND role IN ('master_admin', 'owner', 'vice_director', 'manager')
    )
  );

-- =============================================
-- 2. 문서 테이블 (documents)
-- =============================================
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN (
    'manual',       -- 업무 매뉴얼
    'form',         -- 서식/양식
    'guideline',    -- 가이드라인
    'reference',    -- 참고자료
    'other'         -- 기타
  )),
  file_url TEXT,              -- 첨부파일 URL (Supabase Storage)
  file_name TEXT,             -- 첨부파일명
  file_size INTEGER,          -- 파일 크기 (bytes)
  content TEXT,               -- 텍스트 콘텐츠 (에디터로 작성한 경우)
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  view_count INTEGER DEFAULT 0,
  download_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 문서 인덱스
CREATE INDEX IF NOT EXISTS idx_documents_clinic_id ON documents(clinic_id);
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);

-- 문서 RLS 활성화
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- 문서 RLS 정책: 같은 clinic의 사용자만 조회 가능
CREATE POLICY "Users can view clinic documents"
  ON documents FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

-- 문서 RLS 정책: 관리자만 생성 가능
CREATE POLICY "Admins can create documents"
  ON documents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND clinic_id = documents.clinic_id
        AND role IN ('master_admin', 'owner', 'vice_director', 'manager', 'team_leader')
    )
  );

-- 문서 RLS 정책: 관리자만 수정 가능
CREATE POLICY "Admins can update documents"
  ON documents FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND clinic_id = documents.clinic_id
        AND role IN ('master_admin', 'owner', 'vice_director', 'manager', 'team_leader')
    )
  );

-- 문서 RLS 정책: 관리자만 삭제 가능
CREATE POLICY "Admins can delete documents"
  ON documents FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND clinic_id = documents.clinic_id
        AND role IN ('master_admin', 'owner', 'vice_director', 'manager', 'team_leader')
    )
  );

-- =============================================
-- 3. 업무 할당 테이블 (tasks)
-- =============================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',       -- 대기
    'in_progress',   -- 진행 중
    'completed',     -- 완료
    'on_hold',       -- 보류
    'cancelled'      -- 취소
  )),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN (
    'low',           -- 낮음
    'medium',        -- 보통
    'high',          -- 높음
    'urgent'         -- 긴급
  )),
  assignee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 업무 인덱스
CREATE INDEX IF NOT EXISTS idx_tasks_clinic_id ON tasks(clinic_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigner_id ON tasks(assigner_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);

-- 업무 RLS 활성화
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- 업무 RLS 정책: 같은 clinic의 사용자만 조회 가능
CREATE POLICY "Users can view clinic tasks"
  ON tasks FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

-- 업무 RLS 정책: 관리자와 팀장만 생성 가능
CREATE POLICY "Admins can create tasks"
  ON tasks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND clinic_id = tasks.clinic_id
        AND role IN ('master_admin', 'owner', 'vice_director', 'manager', 'team_leader')
    )
  );

-- 업무 RLS 정책: 담당자와 관리자만 수정 가능
CREATE POLICY "Assignee and admins can update tasks"
  ON tasks FOR UPDATE
  USING (
    auth.uid() = assignee_id
    OR EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND clinic_id = tasks.clinic_id
        AND role IN ('master_admin', 'owner', 'vice_director', 'manager', 'team_leader')
    )
  );

-- 업무 RLS 정책: 관리자만 삭제 가능
CREATE POLICY "Admins can delete tasks"
  ON tasks FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND clinic_id = tasks.clinic_id
        AND role IN ('master_admin', 'owner', 'vice_director', 'manager', 'team_leader')
    )
  );

-- =============================================
-- 4. 업무 댓글 테이블 (task_comments)
-- =============================================
CREATE TABLE IF NOT EXISTS task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 댓글 인덱스
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_author_id ON task_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_created_at ON task_comments(created_at ASC);

-- 댓글 RLS 활성화
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;

-- 댓글 RLS 정책: 업무를 볼 수 있는 사용자는 댓글도 볼 수 있음
CREATE POLICY "Users can view task comments"
  ON task_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN users u ON u.clinic_id = t.clinic_id
      WHERE t.id = task_comments.task_id
        AND u.id = auth.uid()
    )
  );

-- 댓글 RLS 정책: 같은 clinic의 사용자는 댓글 작성 가능
CREATE POLICY "Users can create task comments"
  ON task_comments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN users u ON u.clinic_id = t.clinic_id
      WHERE t.id = task_comments.task_id
        AND u.id = auth.uid()
    )
  );

-- 댓글 RLS 정책: 본인 댓글만 수정 가능
CREATE POLICY "Users can update own comments"
  ON task_comments FOR UPDATE
  USING (auth.uid() = author_id);

-- 댓글 RLS 정책: 본인 댓글만 삭제 가능
CREATE POLICY "Users can delete own comments"
  ON task_comments FOR DELETE
  USING (auth.uid() = author_id);

-- =============================================
-- 5. updated_at 자동 업데이트 트리거
-- =============================================

-- 공지사항 updated_at 트리거
CREATE OR REPLACE FUNCTION update_announcements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_announcements_updated_at
  BEFORE UPDATE ON announcements
  FOR EACH ROW
  EXECUTE FUNCTION update_announcements_updated_at();

-- 문서 updated_at 트리거
CREATE OR REPLACE FUNCTION update_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_documents_updated_at();

-- 업무 updated_at 트리거
CREATE OR REPLACE FUNCTION update_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_tasks_updated_at();

-- 댓글 updated_at 트리거
CREATE OR REPLACE FUNCTION update_task_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_task_comments_updated_at
  BEFORE UPDATE ON task_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_task_comments_updated_at();

-- =============================================
-- 6. 댓글 수 업데이트 함수
-- =============================================
CREATE OR REPLACE FUNCTION get_task_comments_count(p_task_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO v_count
  FROM task_comments
  WHERE task_id = p_task_id;

  RETURN v_count;
END;
$$;

-- =============================================
-- 7. 조회수 증가 함수들
-- =============================================

-- 공지사항 조회수 증가
CREATE OR REPLACE FUNCTION increment_announcement_view_count(p_announcement_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE announcements
  SET view_count = view_count + 1
  WHERE id = p_announcement_id;
END;
$$;

-- 문서 조회수 증가
CREATE OR REPLACE FUNCTION increment_document_view_count(p_document_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE documents
  SET view_count = view_count + 1
  WHERE id = p_document_id;
END;
$$;

-- 문서 다운로드수 증가
CREATE OR REPLACE FUNCTION increment_document_download_count(p_document_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE documents
  SET download_count = download_count + 1
  WHERE id = p_document_id;
END;
$$;

-- =============================================
-- 8. 코멘트 추가
-- =============================================
COMMENT ON TABLE announcements IS '병원 공지사항 (일정, 휴진, 규칙, 복지 등)';
COMMENT ON TABLE documents IS '병원 업무 관련 문서 모음';
COMMENT ON TABLE tasks IS '직원 업무 할당 및 진행 상황';
COMMENT ON TABLE task_comments IS '업무 댓글/피드백';

COMMENT ON COLUMN announcements.category IS 'schedule: 일정, holiday: 휴진/연휴, policy: 취업규칙, welfare: 복지, general: 일반';
COMMENT ON COLUMN documents.category IS 'manual: 업무 매뉴얼, form: 서식/양식, guideline: 가이드라인, reference: 참고자료, other: 기타';
COMMENT ON COLUMN tasks.status IS 'pending: 대기, in_progress: 진행 중, completed: 완료, on_hold: 보류, cancelled: 취소';
COMMENT ON COLUMN tasks.priority IS 'low: 낮음, medium: 보통, high: 높음, urgent: 긴급';
