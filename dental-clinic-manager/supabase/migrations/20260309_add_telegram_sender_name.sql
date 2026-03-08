-- telegram_board_posts에 작성자 표시용 이름 컬럼 추가
-- created_by가 NULL인 경우 (AI 요약, 시스템 생성 등) 이 이름을 표시
ALTER TABLE telegram_board_posts
  ADD COLUMN IF NOT EXISTS telegram_sender_name TEXT DEFAULT NULL;

-- 기존 AI 요약 게시글의 sender_name 업데이트
UPDATE telegram_board_posts
SET telegram_sender_name = 'AI 요약'
WHERE post_type = 'summary' AND created_by IS NULL AND telegram_sender_name IS NULL;
