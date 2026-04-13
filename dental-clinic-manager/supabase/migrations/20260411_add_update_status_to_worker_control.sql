-- marketing_worker_control 테이블에 update_status 컬럼 추가
-- 워커 업데이트 다운로드 완료 시 대시보드에서 재시작 안내 표시용
ALTER TABLE marketing_worker_control
  ADD COLUMN IF NOT EXISTS update_status VARCHAR(20) DEFAULT 'up-to-date';

COMMENT ON COLUMN marketing_worker_control.update_status IS '업데이트 상태: up-to-date, downloading, downloaded';
