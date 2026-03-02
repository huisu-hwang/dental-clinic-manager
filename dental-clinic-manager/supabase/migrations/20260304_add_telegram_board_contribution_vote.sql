-- ============================================
-- 텔레그램 게시판 기여도 투표 기능
-- Migration: 20260304_add_telegram_board_contribution_vote.sql
-- Created: 2026-03-04
--
-- 테이블: telegram_board_votes (투표 세션)
-- 테이블: telegram_board_vote_records (개별 투표 기록)
-- RPC: cast_contribution_votes, get_contribution_vote_results, close_contribution_vote
-- ============================================

-- ============================================
-- 1. telegram_board_votes (투표 세션)
-- ============================================
CREATE TABLE IF NOT EXISTS telegram_board_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES telegram_board_posts(id) ON DELETE CASCADE,
  telegram_group_id UUID NOT NULL REFERENCES telegram_groups(id) ON DELETE CASCADE,
  max_votes_per_person INTEGER NOT NULL DEFAULT 3 CHECK (max_votes_per_person BETWEEN 1 AND 10),
  is_anonymous BOOLEAN NOT NULL DEFAULT TRUE,
  show_top_n INTEGER DEFAULT NULL CHECK (show_top_n IS NULL OR show_top_n > 0),
  result_visibility VARCHAR(20) NOT NULL DEFAULT 'after_vote' CHECK (result_visibility IN ('realtime', 'after_vote', 'after_end')),
  allow_self_vote BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'cancelled')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ DEFAULT NULL,
  closed_at TIMESTAMPTZ DEFAULT NULL,
  closed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  total_voters INTEGER NOT NULL DEFAULT 0,
  total_votes_cast INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT telegram_board_votes_post_unique UNIQUE (post_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_board_votes_group ON telegram_board_votes(telegram_group_id);
CREATE INDEX IF NOT EXISTS idx_telegram_board_votes_status ON telegram_board_votes(status);

-- ============================================
-- 2. telegram_board_vote_records (개별 투표 기록)
-- ============================================
CREATE TABLE IF NOT EXISTS telegram_board_vote_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vote_id UUID NOT NULL REFERENCES telegram_board_votes(id) ON DELETE CASCADE,
  voter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT telegram_board_vote_records_unique UNIQUE (vote_id, voter_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_board_vote_records_vote ON telegram_board_vote_records(vote_id);
CREATE INDEX IF NOT EXISTS idx_telegram_board_vote_records_voter ON telegram_board_vote_records(voter_id);
CREATE INDEX IF NOT EXISTS idx_telegram_board_vote_records_candidate ON telegram_board_vote_records(candidate_id);

-- ============================================
-- 3. RLS 정책
-- ============================================
ALTER TABLE telegram_board_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_board_vote_records ENABLE ROW LEVEL SECURITY;

-- telegram_board_votes RLS
CREATE POLICY "telegram_board_votes_select" ON telegram_board_votes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "telegram_board_votes_insert" ON telegram_board_votes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "telegram_board_votes_update" ON telegram_board_votes
  FOR UPDATE TO authenticated USING (auth.uid() = created_by);

-- telegram_board_vote_records RLS
CREATE POLICY "telegram_board_vote_records_select" ON telegram_board_vote_records
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "telegram_board_vote_records_insert" ON telegram_board_vote_records
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = voter_id);

CREATE POLICY "telegram_board_vote_records_delete" ON telegram_board_vote_records
  FOR DELETE TO authenticated USING (auth.uid() = voter_id);

-- ============================================
-- 4. RPC: cast_contribution_votes (원자적 투표)
-- ============================================
CREATE OR REPLACE FUNCTION cast_contribution_votes(
  p_vote_id UUID,
  p_voter_id UUID,
  p_candidate_ids UUID[]
)
RETURNS JSON AS $$
DECLARE
  v_vote RECORD;
  v_member_exists BOOLEAN;
  v_candidate_id UUID;
  v_member_count INTEGER;
  v_voter_count INTEGER;
BEGIN
  -- 1. 투표 세션 조회
  SELECT * INTO v_vote FROM telegram_board_votes WHERE id = p_vote_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', '투표를 찾을 수 없습니다.');
  END IF;

  -- 2. 투표 상태 확인
  IF v_vote.status != 'active' THEN
    RETURN json_build_object('success', false, 'error', '종료된 투표입니다.');
  END IF;

  -- 3. 종료 시간 확인
  IF v_vote.ends_at IS NOT NULL AND v_vote.ends_at < NOW() THEN
    -- 자동 종료 처리
    UPDATE telegram_board_votes SET status = 'closed', closed_at = NOW() WHERE id = p_vote_id;
    RETURN json_build_object('success', false, 'error', '투표 기간이 종료되었습니다.');
  END IF;

  -- 4. 그룹 멤버 확인
  SELECT EXISTS(
    SELECT 1 FROM telegram_group_members
    WHERE telegram_group_id = v_vote.telegram_group_id AND user_id = p_voter_id
  ) INTO v_member_exists;
  IF NOT v_member_exists THEN
    RETURN json_build_object('success', false, 'error', '그룹 멤버만 투표할 수 있습니다.');
  END IF;

  -- 5. 투표 수 검증
  IF array_length(p_candidate_ids, 1) IS NULL OR array_length(p_candidate_ids, 1) = 0 THEN
    RETURN json_build_object('success', false, 'error', '최소 1명을 선택해주세요.');
  END IF;

  IF array_length(p_candidate_ids, 1) > v_vote.max_votes_per_person THEN
    RETURN json_build_object('success', false, 'error', '최대 ' || v_vote.max_votes_per_person || '명까지 선택할 수 있습니다.');
  END IF;

  -- 6. 본인 투표 방지 (allow_self_vote=false)
  IF NOT v_vote.allow_self_vote AND p_voter_id = ANY(p_candidate_ids) THEN
    RETURN json_build_object('success', false, 'error', '본인에게는 투표할 수 없습니다.');
  END IF;

  -- 7. 후보자가 모두 그룹 멤버인지 확인
  FOREACH v_candidate_id IN ARRAY p_candidate_ids
  LOOP
    SELECT EXISTS(
      SELECT 1 FROM telegram_group_members
      WHERE telegram_group_id = v_vote.telegram_group_id AND user_id = v_candidate_id
    ) INTO v_member_exists;
    IF NOT v_member_exists THEN
      RETURN json_build_object('success', false, 'error', '그룹 멤버가 아닌 사용자에게는 투표할 수 없습니다.');
    END IF;
  END LOOP;

  -- 8. 기존 투표 삭제 (재투표)
  DELETE FROM telegram_board_vote_records WHERE vote_id = p_vote_id AND voter_id = p_voter_id;

  -- 9. 새 투표 삽입
  FOREACH v_candidate_id IN ARRAY p_candidate_ids
  LOOP
    INSERT INTO telegram_board_vote_records (vote_id, voter_id, candidate_id)
    VALUES (p_vote_id, p_voter_id, v_candidate_id);
  END LOOP;

  -- 10. 캐시 카운터 업데이트
  SELECT COUNT(DISTINCT voter_id) INTO v_voter_count FROM telegram_board_vote_records WHERE vote_id = p_vote_id;
  UPDATE telegram_board_votes
  SET total_voters = v_voter_count,
      total_votes_cast = (SELECT COUNT(*) FROM telegram_board_vote_records WHERE vote_id = p_vote_id),
      updated_at = NOW()
  WHERE id = p_vote_id;

  -- 11. after_end 모드일 때 전원 투표 완료 체크
  IF v_vote.result_visibility = 'after_end' THEN
    SELECT COUNT(*) INTO v_member_count
    FROM telegram_group_members
    WHERE telegram_group_id = v_vote.telegram_group_id;

    IF v_voter_count >= v_member_count THEN
      UPDATE telegram_board_votes SET status = 'closed', closed_at = NOW() WHERE id = p_vote_id;
    END IF;
  END IF;

  RETURN json_build_object('success', true, 'total_voters', v_voter_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. RPC: get_contribution_vote_results (결과 조회)
-- ============================================
CREATE OR REPLACE FUNCTION get_contribution_vote_results(
  p_vote_id UUID,
  p_requester_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_vote RECORD;
  v_has_voted BOOLEAN;
  v_my_selections UUID[];
  v_results JSON;
  v_my_rank INTEGER;
  v_my_votes INTEGER;
  v_can_see_results BOOLEAN := FALSE;
  v_is_closed BOOLEAN;
BEGIN
  -- 1. 투표 세션 조회
  SELECT * INTO v_vote FROM telegram_board_votes WHERE id = p_vote_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', '투표를 찾을 수 없습니다.');
  END IF;

  -- 2. 종료 상태 확인
  v_is_closed := v_vote.status != 'active' OR (v_vote.ends_at IS NOT NULL AND v_vote.ends_at < NOW());

  -- 3. 본인 투표 여부 확인
  SELECT EXISTS(
    SELECT 1 FROM telegram_board_vote_records WHERE vote_id = p_vote_id AND voter_id = p_requester_id
  ) INTO v_has_voted;

  -- 4. 본인 선택 목록
  SELECT COALESCE(array_agg(candidate_id), ARRAY[]::UUID[])
  INTO v_my_selections
  FROM telegram_board_vote_records
  WHERE vote_id = p_vote_id AND voter_id = p_requester_id;

  -- 5. 결과 공개 여부 결정
  IF v_is_closed THEN
    v_can_see_results := TRUE;
  ELSIF v_vote.result_visibility = 'realtime' THEN
    v_can_see_results := TRUE;
  ELSIF v_vote.result_visibility = 'after_vote' AND v_has_voted THEN
    v_can_see_results := TRUE;
  ELSIF v_vote.result_visibility = 'after_end' THEN
    v_can_see_results := FALSE;
  END IF;

  -- 6. 결과 집계
  IF v_can_see_results THEN
    SELECT json_agg(row_to_json(r) ORDER BY r.vote_count DESC, r.user_name ASC)
    INTO v_results
    FROM (
      SELECT
        u.id AS user_id,
        u.name AS user_name,
        COALESCE(vc.cnt, 0) AS vote_count,
        ROW_NUMBER() OVER (ORDER BY COALESCE(vc.cnt, 0) DESC, u.name ASC) AS rank
      FROM telegram_group_members tgm
      JOIN users u ON u.id = tgm.user_id
      LEFT JOIN (
        SELECT candidate_id, COUNT(*) AS cnt
        FROM telegram_board_vote_records
        WHERE vote_id = p_vote_id
        GROUP BY candidate_id
      ) vc ON vc.candidate_id = u.id
      WHERE tgm.telegram_group_id = v_vote.telegram_group_id
    ) r;
  ELSE
    v_results := '[]'::JSON;
  END IF;

  -- 7. 본인 순위 (항상 계산, 투표했으면)
  IF v_has_voted THEN
    SELECT rank, vote_count INTO v_my_rank, v_my_votes
    FROM (
      SELECT
        u.id,
        COALESCE(vc.cnt, 0) AS vote_count,
        ROW_NUMBER() OVER (ORDER BY COALESCE(vc.cnt, 0) DESC, u.name ASC) AS rank
      FROM telegram_group_members tgm
      JOIN users u ON u.id = tgm.user_id
      LEFT JOIN (
        SELECT candidate_id, COUNT(*) AS cnt
        FROM telegram_board_vote_records
        WHERE vote_id = p_vote_id
        GROUP BY candidate_id
      ) vc ON vc.candidate_id = u.id
      WHERE tgm.telegram_group_id = v_vote.telegram_group_id
    ) ranked
    WHERE ranked.id = p_requester_id;
  END IF;

  RETURN json_build_object(
    'results', COALESCE(v_results, '[]'::JSON),
    'has_voted', v_has_voted,
    'my_selections', v_my_selections,
    'my_rank', v_my_rank,
    'my_votes', COALESCE(v_my_votes, 0),
    'is_closed', v_is_closed,
    'total_voters', v_vote.total_voters,
    'total_votes_cast', v_vote.total_votes_cast,
    'result_visibility', v_vote.result_visibility,
    'max_votes_per_person', v_vote.max_votes_per_person,
    'is_anonymous', v_vote.is_anonymous,
    'show_top_n', v_vote.show_top_n,
    'allow_self_vote', v_vote.allow_self_vote,
    'can_see_results', v_can_see_results
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. RPC: close_contribution_vote (투표 종료)
-- ============================================
CREATE OR REPLACE FUNCTION close_contribution_vote(
  p_vote_id UUID,
  p_user_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_vote RECORD;
  v_is_admin BOOLEAN;
BEGIN
  -- 1. 투표 세션 조회
  SELECT * INTO v_vote FROM telegram_board_votes WHERE id = p_vote_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', '투표를 찾을 수 없습니다.');
  END IF;

  -- 2. 이미 종료 확인
  IF v_vote.status != 'active' THEN
    RETURN json_build_object('success', false, 'error', '이미 종료된 투표입니다.');
  END IF;

  -- 3. 권한 확인 (작성자 또는 master_admin)
  SELECT EXISTS(
    SELECT 1 FROM users WHERE id = p_user_id AND role = 'master_admin'
  ) INTO v_is_admin;

  IF v_vote.created_by != p_user_id AND NOT v_is_admin THEN
    RETURN json_build_object('success', false, 'error', '투표를 종료할 권한이 없습니다.');
  END IF;

  -- 4. 종료 처리
  UPDATE telegram_board_votes
  SET status = 'closed',
      closed_at = NOW(),
      closed_by = p_user_id,
      updated_at = NOW()
  WHERE id = p_vote_id;

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Migration Complete
-- ============================================
