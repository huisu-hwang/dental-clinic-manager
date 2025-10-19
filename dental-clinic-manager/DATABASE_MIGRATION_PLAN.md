# 멀티테넌트 데이터베이스 마이그레이션 계획

## 1. 사용자 및 권한 구조

### 계정 유형
1. **마스터 관리자** (Master Admin)
   - 전체 시스템 관리
   - 병원 가입/탈퇴 관리
   - 결제 및 구독 관리

2. **병원 계정**
   - **원장** (Clinic Owner)
     - 병원 정보 관리
     - 직원 계정 생성/승인
     - 모든 병원 데이터 접근

   - **부원장** (Vice Director)
     - 원장 권한 일부 위임
     - 직원 관리 보조

   - **실장** (Manager)
     - 일일 운영 관리
     - 보고서 작성/수정

   - **진료팀장** (Team Leader)
     - 팀 데이터 관리
     - 팀원 업무 감독

   - **진료실 팀원** (Staff)
     - 기본 데이터 입력
     - 제한된 조회 권한

## 2. 데이터베이스 스키마

### users 테이블
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  role VARCHAR(50) NOT NULL, -- 'master_admin', 'owner', 'vice_director', 'manager', 'team_leader', 'staff'
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'active', 'suspended'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login_at TIMESTAMP WITH TIME ZONE,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP WITH TIME ZONE
);
```

### clinics 테이블
```sql
CREATE TABLE clinics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL,
  owner_name VARCHAR(100) NOT NULL,
  address TEXT NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255) NOT NULL,
  business_number VARCHAR(50),
  subscription_tier VARCHAR(50) DEFAULT 'basic', -- 'basic', 'professional', 'enterprise'
  subscription_expires_at TIMESTAMP WITH TIME ZONE,
  max_users INTEGER DEFAULT 5,
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'suspended', 'cancelled'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### user_invitations 테이블
```sql
CREATE TABLE user_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  token VARCHAR(255) UNIQUE NOT NULL,
  invited_by UUID REFERENCES users(id),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### role_permissions 테이블
```sql
CREATE TABLE role_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role VARCHAR(50) NOT NULL,
  resource VARCHAR(100) NOT NULL, -- 'daily_reports', 'inventory', 'staff_management', etc.
  can_create BOOLEAN DEFAULT FALSE,
  can_read BOOLEAN DEFAULT FALSE,
  can_update BOOLEAN DEFAULT FALSE,
  can_delete BOOLEAN DEFAULT FALSE,
  UNIQUE(role, resource)
);
```

### audit_logs 테이블
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  clinic_id UUID REFERENCES clinics(id),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100),
  resource_id UUID,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 3. 기존 테이블 수정

### daily_reports 테이블 수정
```sql
ALTER TABLE daily_reports
ADD COLUMN clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
ADD COLUMN created_by UUID REFERENCES users(id),
ADD COLUMN updated_by UUID REFERENCES users(id);
```

### consult_logs 테이블 수정
```sql
ALTER TABLE consult_logs
ADD COLUMN clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;
```

### gift_logs 테이블 수정
```sql
ALTER TABLE gift_logs
ADD COLUMN clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;
```

### gift_inventory 테이블 수정
```sql
ALTER TABLE gift_inventory
ADD COLUMN clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;
```

### inventory_logs 테이블 수정
```sql
ALTER TABLE inventory_logs
ADD COLUMN clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
ADD COLUMN performed_by UUID REFERENCES users(id);
```

## 4. RLS (Row Level Security) 정책

```sql
-- Enable RLS on all tables
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE consult_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;

-- Policy for clinic data isolation
CREATE POLICY "Users can only see their clinic's data" ON daily_reports
  FOR ALL USING (clinic_id = auth.jwt() ->> 'clinic_id');

-- Similar policies for other tables...
```

## 5. 초기 권한 설정

```sql
-- Master Admin permissions
INSERT INTO role_permissions (role, resource, can_create, can_read, can_update, can_delete) VALUES
('master_admin', 'clinics', true, true, true, true),
('master_admin', 'users', true, true, true, true),
('master_admin', 'system_settings', true, true, true, true);

-- Clinic Owner permissions
INSERT INTO role_permissions (role, resource, can_create, can_read, can_update, can_delete) VALUES
('owner', 'daily_reports', true, true, true, true),
('owner', 'inventory', true, true, true, true),
('owner', 'staff_management', true, true, true, true),
('owner', 'clinic_settings', true, true, true, false);

-- Manager permissions
INSERT INTO role_permissions (role, resource, can_create, can_read, can_update, can_delete) VALUES
('manager', 'daily_reports', true, true, true, false),
('manager', 'inventory', true, true, true, false),
('manager', 'staff_management', false, true, false, false);

-- Staff permissions
INSERT INTO role_permissions (role, resource, can_create, can_read, can_update, can_delete) VALUES
('staff', 'daily_reports', true, true, false, false),
('staff', 'inventory', false, true, false, false);
```

## 6. 구현 순서

1. **Phase 1: 데이터베이스 준비**
   - 새 테이블 생성
   - 기존 테이블 수정
   - RLS 정책 설정

2. **Phase 2: 인증 시스템 업그레이드**
   - Supabase Auth 설정
   - JWT 토큰 관리
   - 세션 관리

3. **Phase 3: 마스터 관리 대시보드**
   - 병원 관리 인터페이스
   - 구독 관리
   - 시스템 모니터링

4. **Phase 4: 병원 관리자 기능**
   - 직원 초대/승인 시스템
   - 권한 관리
   - 병원 설정

5. **Phase 5: 기존 기능 업데이트**
   - clinic_id 기반 데이터 필터링
   - 권한 체크 미들웨어
   - UI 권한별 표시/숨김

6. **Phase 6: 마이그레이션**
   - 기존 데이터 마이그레이션
   - 테스트 및 검증
   - 배포