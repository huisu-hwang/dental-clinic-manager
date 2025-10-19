-- 사용자 테이블 생성
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(50) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  clinic_owner_name VARCHAR(100) NOT NULL,
  clinic_name VARCHAR(100) NOT NULL,
  clinic_address TEXT NOT NULL,
  clinic_phone VARCHAR(20) NOT NULL,
  clinic_email VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 기존 하얀치과 사용자 데이터 삽입
INSERT INTO users (
  user_id,
  password_hash,
  clinic_owner_name,
  clinic_name,
  clinic_address,
  clinic_phone,
  clinic_email
) VALUES (
  'whitedc0902',
  '$2b$10$example_hash_replace_this', -- 실제로는 bcrypt로 해시된 비밀번호를 넣어야 함
  '원장님', -- 실제 원장 이름으로 변경 필요
  '하얀치과',
  '서울시 송파구 풍납동 152-28 3층',
  '02-477-2878',
  'whitedc0902@gmail.com'
) ON CONFLICT (user_id) DO NOTHING;

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id);
CREATE INDEX IF NOT EXISTS idx_users_clinic_email ON users(clinic_email);