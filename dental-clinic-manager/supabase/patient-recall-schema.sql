-- ========================================
-- 환자 리콜 시스템 데이터베이스 스키마
-- Patient Recall System Database Schema
-- ========================================

-- 환자 리콜 상태 ENUM 타입 (간소화)
DO $$ BEGIN
    CREATE TYPE patient_recall_status AS ENUM (
        'pending',              -- 대기 중
        'sms_sent',             -- 문자 발송 (자동)
        'appointment_made',     -- 예약 완료
        'no_answer',            -- 부재중
        'call_rejected',        -- 통화 거부
        'visit_refused',        -- 내원 거부
        'invalid_number'        -- 없는 번호
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 연락 유형 ENUM 타입
DO $$ BEGIN
    CREATE TYPE contact_type AS ENUM (
        'sms',      -- 문자 메시지
        'call'      -- 전화
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 성별 ENUM 타입
DO $$ BEGIN
    CREATE TYPE gender_type AS ENUM (
        'male',     -- 남성
        'female',   -- 여성
        'other'     -- 기타
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ========================================
-- 1. 리콜 캠페인 테이블 (환자 목록 업로드 세션)
-- ========================================
CREATE TABLE IF NOT EXISTS recall_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,

    -- 캠페인 정보
    name VARCHAR(200) NOT NULL,                    -- 캠페인 이름 (예: "2024년 1월 정기검진 리콜")
    description TEXT,                              -- 설명

    -- 파일 업로드 정보
    original_filename VARCHAR(255),                -- 원본 파일명
    total_patients INT DEFAULT 0,                  -- 총 환자 수

    -- 통계
    sms_sent_count INT DEFAULT 0,                  -- 문자 발송 수
    call_attempted_count INT DEFAULT 0,            -- 전화 시도 수
    appointment_count INT DEFAULT 0,               -- 예약 성공 수

    -- 상태
    status VARCHAR(20) DEFAULT 'active',           -- active, completed, archived

    -- 메타데이터
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================
-- 2. 리콜 환자 테이블 (업로드된 환자 목록)
-- ========================================
CREATE TABLE IF NOT EXISTS recall_patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES recall_campaigns(id) ON DELETE CASCADE,

    -- 환자 정보
    patient_name VARCHAR(100) NOT NULL,            -- 환자명
    phone_number VARCHAR(20) NOT NULL,             -- 전화번호
    chart_number VARCHAR(50),                      -- 차트 번호
    birth_date DATE,                               -- 생년월일
    gender gender_type,                            -- 성별

    -- 추가 정보 (선택)
    last_visit_date DATE,                          -- 마지막 내원일
    treatment_type VARCHAR(100),                   -- 시술 종류
    notes TEXT,                                    -- 비고

    -- 리콜 상태
    status patient_recall_status DEFAULT 'pending',

    -- 예약 정보
    appointment_date DATE,                         -- 예약 날짜
    appointment_time TIME,                         -- 예약 시간
    appointment_notes TEXT,                        -- 예약 관련 메모

    -- 연락 이력 요약
    last_contact_date TIMESTAMPTZ,                 -- 마지막 연락 일시
    last_contact_type contact_type,                -- 마지막 연락 유형
    contact_count INT DEFAULT 0,                   -- 총 연락 횟수

    -- 메타데이터
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================
-- 3. 연락 이력 테이블 (문자/전화 기록)
-- ========================================
CREATE TABLE IF NOT EXISTS recall_contact_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES recall_patients(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES recall_campaigns(id) ON DELETE CASCADE,

    -- 연락 정보
    contact_type contact_type NOT NULL,            -- 문자 or 전화
    contact_date TIMESTAMPTZ DEFAULT NOW(),        -- 연락 일시

    -- 문자 메시지 관련
    sms_content TEXT,                              -- 문자 내용
    sms_api_response TEXT,                         -- API 응답 (JSON)
    sms_message_id VARCHAR(100),                   -- 알리고 메시지 ID

    -- 전화 관련
    call_duration INT,                             -- 통화 시간 (초)
    call_result VARCHAR(50),                       -- 통화 결과

    -- 결과
    result_status patient_recall_status,           -- 결과 상태
    result_notes TEXT,                             -- 결과 메모

    -- 담당자
    contacted_by UUID REFERENCES users(id),
    contacted_by_name VARCHAR(100),

    -- 메타데이터
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================
-- 4. 문자 템플릿 테이블
-- ========================================
CREATE TABLE IF NOT EXISTS recall_sms_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,

    -- 템플릿 정보
    name VARCHAR(100) NOT NULL,                    -- 템플릿 이름
    content TEXT NOT NULL,                         -- 템플릿 내용
    -- 치환 변수: {환자명}, {병원명}, {전화번호} 등

    -- 상태
    is_default BOOLEAN DEFAULT false,              -- 기본 템플릿 여부
    is_active BOOLEAN DEFAULT true,                -- 활성화 여부

    -- 메타데이터
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================
-- 5. 알리고 API 설정 테이블
-- ========================================
CREATE TABLE IF NOT EXISTS aligo_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID UNIQUE NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,

    -- API 설정
    api_key VARCHAR(255),                          -- 알리고 API 키
    user_id VARCHAR(100),                          -- 알리고 사용자 ID
    sender_number VARCHAR(20),                     -- 발신 번호

    -- 상태
    is_active BOOLEAN DEFAULT true,
    last_test_date TIMESTAMPTZ,                    -- 마지막 테스트 일시
    last_test_result BOOLEAN,                      -- 마지막 테스트 결과

    -- 메타데이터
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================
-- 인덱스 생성
-- ========================================

-- recall_campaigns 인덱스
CREATE INDEX IF NOT EXISTS idx_recall_campaigns_clinic ON recall_campaigns(clinic_id);
CREATE INDEX IF NOT EXISTS idx_recall_campaigns_status ON recall_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_recall_campaigns_created ON recall_campaigns(created_at DESC);

-- recall_patients 인덱스
CREATE INDEX IF NOT EXISTS idx_recall_patients_clinic ON recall_patients(clinic_id);
CREATE INDEX IF NOT EXISTS idx_recall_patients_campaign ON recall_patients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_recall_patients_status ON recall_patients(status);
CREATE INDEX IF NOT EXISTS idx_recall_patients_phone ON recall_patients(phone_number);
CREATE INDEX IF NOT EXISTS idx_recall_patients_name ON recall_patients(patient_name);

-- recall_contact_logs 인덱스
CREATE INDEX IF NOT EXISTS idx_recall_contact_logs_clinic ON recall_contact_logs(clinic_id);
CREATE INDEX IF NOT EXISTS idx_recall_contact_logs_patient ON recall_contact_logs(patient_id);
CREATE INDEX IF NOT EXISTS idx_recall_contact_logs_campaign ON recall_contact_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_recall_contact_logs_date ON recall_contact_logs(contact_date DESC);
CREATE INDEX IF NOT EXISTS idx_recall_contact_logs_type ON recall_contact_logs(contact_type);

-- recall_sms_templates 인덱스
CREATE INDEX IF NOT EXISTS idx_recall_sms_templates_clinic ON recall_sms_templates(clinic_id);

-- ========================================
-- RLS (Row Level Security) 정책
-- ========================================

-- recall_campaigns RLS
ALTER TABLE recall_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own clinic campaigns" ON recall_campaigns
    FOR SELECT USING (
        clinic_id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own clinic campaigns" ON recall_campaigns
    FOR INSERT WITH CHECK (
        clinic_id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can update own clinic campaigns" ON recall_campaigns
    FOR UPDATE USING (
        clinic_id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        )
    );

-- recall_patients RLS
ALTER TABLE recall_patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own clinic patients" ON recall_patients
    FOR SELECT USING (
        clinic_id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own clinic patients" ON recall_patients
    FOR INSERT WITH CHECK (
        clinic_id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can update own clinic patients" ON recall_patients
    FOR UPDATE USING (
        clinic_id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can delete own clinic patients" ON recall_patients
    FOR DELETE USING (
        clinic_id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        )
    );

-- recall_contact_logs RLS
ALTER TABLE recall_contact_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own clinic contact logs" ON recall_contact_logs
    FOR SELECT USING (
        clinic_id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own clinic contact logs" ON recall_contact_logs
    FOR INSERT WITH CHECK (
        clinic_id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        )
    );

-- recall_sms_templates RLS
ALTER TABLE recall_sms_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own clinic templates" ON recall_sms_templates
    FOR SELECT USING (
        clinic_id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can manage own clinic templates" ON recall_sms_templates
    FOR ALL USING (
        clinic_id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        )
    );

-- aligo_settings RLS
ALTER TABLE aligo_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own clinic aligo settings" ON aligo_settings
    FOR SELECT USING (
        clinic_id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can manage own clinic aligo settings" ON aligo_settings
    FOR ALL USING (
        clinic_id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        )
    );

-- ========================================
-- 트리거: updated_at 자동 업데이트
-- ========================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_recall_campaigns_updated_at ON recall_campaigns;
CREATE TRIGGER update_recall_campaigns_updated_at
    BEFORE UPDATE ON recall_campaigns
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_recall_patients_updated_at ON recall_patients;
CREATE TRIGGER update_recall_patients_updated_at
    BEFORE UPDATE ON recall_patients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_recall_sms_templates_updated_at ON recall_sms_templates;
CREATE TRIGGER update_recall_sms_templates_updated_at
    BEFORE UPDATE ON recall_sms_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_aligo_settings_updated_at ON aligo_settings;
CREATE TRIGGER update_aligo_settings_updated_at
    BEFORE UPDATE ON aligo_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
