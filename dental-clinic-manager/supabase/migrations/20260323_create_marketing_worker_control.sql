-- 마케팅 워커 제어 테이블
-- Vercel에서 DB 시그널링으로 Mac mini의 워커를 원격 시작/중지
CREATE TABLE IF NOT EXISTS marketing_worker_control (
  id VARCHAR(50) PRIMARY KEY DEFAULT 'main',
  start_requested BOOLEAN DEFAULT false,
  stop_requested BOOLEAN DEFAULT false,
  watchdog_online BOOLEAN DEFAULT false,
  worker_running BOOLEAN DEFAULT false,
  last_updated TIMESTAMPTZ DEFAULT now()
);

-- 초기 행 삽입
INSERT INTO marketing_worker_control (id) VALUES ('main')
ON CONFLICT (id) DO NOTHING;
