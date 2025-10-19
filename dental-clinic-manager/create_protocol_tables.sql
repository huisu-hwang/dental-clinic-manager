-- ========================================
-- 진료 프로토콜 관리 기능 - 데이터베이스 스키마
-- ========================================
-- 실행 위치: Supabase SQL Editor
-- 작성일: 2025-10-16

-- 1. protocol_categories (프로토콜 카테고리)
CREATE TABLE IF NOT EXISTS public.protocol_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(7) DEFAULT '#3B82F6', -- Hex color code
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- 병원 내에서 카테고리 이름 중복 방지
    UNIQUE(clinic_id, name)
);

-- 2. protocols (프로토콜 메인 테이블)
CREATE TABLE IF NOT EXISTS public.protocols (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    category_id UUID REFERENCES public.protocol_categories(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'active', -- 'draft', 'active', 'archived'
    current_version_id UUID, -- protocol_versions 테이블과 연결 (나중에 외래키 추가)
    tags TEXT[], -- 검색용 태그 배열
    created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE, -- Soft delete

    -- 제약 조건
    CONSTRAINT protocols_title_check CHECK (char_length(title) > 0),
    CONSTRAINT protocols_status_check CHECK (status IN ('draft', 'active', 'archived'))
);

-- 3. protocol_versions (버전 히스토리)
CREATE TABLE IF NOT EXISTS public.protocol_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    protocol_id UUID NOT NULL REFERENCES public.protocols(id) ON DELETE CASCADE,
    version_number VARCHAR(20) NOT NULL, -- '1.0', '1.1', '2.0' 등
    content TEXT NOT NULL, -- 프로토콜 본문 (HTML 또는 JSON)
    change_summary TEXT, -- 변경 사유/요약
    change_type VARCHAR(20) DEFAULT 'minor', -- 'major' or 'minor'
    created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- 복합 유니크 제약: 같은 프로토콜에 같은 버전 번호 불가
    UNIQUE(protocol_id, version_number),

    -- 제약 조건
    CONSTRAINT protocol_versions_change_type_check CHECK (change_type IN ('major', 'minor'))
);

-- 4. protocols 테이블에 current_version_id 외래키 추가
-- (순환 참조를 피하기 위해 별도로 추가)
-- 제약 조건이 존재하면 먼저 삭제
ALTER TABLE public.protocols DROP CONSTRAINT IF EXISTS protocols_current_version_fk;

ALTER TABLE public.protocols
ADD CONSTRAINT protocols_current_version_fk
FOREIGN KEY (current_version_id) REFERENCES public.protocol_versions(id) ON DELETE SET NULL;

-- 5. 인덱스 생성 (성능 최적화)
-- protocol_categories 인덱스
CREATE INDEX IF NOT EXISTS idx_protocol_categories_clinic_id
ON public.protocol_categories(clinic_id);

CREATE INDEX IF NOT EXISTS idx_protocol_categories_display_order
ON public.protocol_categories(display_order);

-- protocols 인덱스
CREATE INDEX IF NOT EXISTS idx_protocols_clinic_id
ON public.protocols(clinic_id);

CREATE INDEX IF NOT EXISTS idx_protocols_category_id
ON public.protocols(category_id);

CREATE INDEX IF NOT EXISTS idx_protocols_status
ON public.protocols(status);

CREATE INDEX IF NOT EXISTS idx_protocols_created_by
ON public.protocols(created_by);

CREATE INDEX IF NOT EXISTS idx_protocols_deleted_at
ON public.protocols(deleted_at);

CREATE INDEX IF NOT EXISTS idx_protocols_tags
ON public.protocols USING GIN(tags);

-- protocol_versions 인덱스
CREATE INDEX IF NOT EXISTS idx_protocol_versions_protocol_id
ON public.protocol_versions(protocol_id);

CREATE INDEX IF NOT EXISTS idx_protocol_versions_created_at
ON public.protocol_versions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_protocol_versions_created_by
ON public.protocol_versions(created_by);

-- 6. Row Level Security (RLS) 활성화
ALTER TABLE public.protocol_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.protocol_versions ENABLE ROW LEVEL SECURITY;

-- 7. RLS 정책 생성

-- protocol_categories 정책
DROP POLICY IF EXISTS "Enable read for authenticated users" ON public.protocol_categories;
CREATE POLICY "Enable read for authenticated users"
ON public.protocol_categories FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Enable insert for owner and vice_director" ON public.protocol_categories;
CREATE POLICY "Enable insert for owner and vice_director"
ON public.protocol_categories FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid()
        AND users.clinic_id = protocol_categories.clinic_id
        AND users.role IN ('owner', 'vice_director')
        AND users.status = 'active'
    )
);

DROP POLICY IF EXISTS "Enable update for owner and vice_director" ON public.protocol_categories;
CREATE POLICY "Enable update for owner and vice_director"
ON public.protocol_categories FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid()
        AND users.clinic_id = protocol_categories.clinic_id
        AND users.role IN ('owner', 'vice_director')
        AND users.status = 'active'
    )
);

DROP POLICY IF EXISTS "Enable delete for owner only" ON public.protocol_categories;
CREATE POLICY "Enable delete for owner only"
ON public.protocol_categories FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid()
        AND users.clinic_id = protocol_categories.clinic_id
        AND users.role = 'owner'
        AND users.status = 'active'
    )
);

-- protocols 정책
DROP POLICY IF EXISTS "Enable read for clinic members" ON public.protocols;
CREATE POLICY "Enable read for clinic members"
ON public.protocols FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid()
        AND users.clinic_id = protocols.clinic_id
        AND users.status = 'active'
    )
);

DROP POLICY IF EXISTS "Enable insert for owner and vice_director" ON public.protocols;
CREATE POLICY "Enable insert for owner and vice_director"
ON public.protocols FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid()
        AND users.clinic_id = protocols.clinic_id
        AND users.role IN ('owner', 'vice_director')
        AND users.status = 'active'
    )
);

DROP POLICY IF EXISTS "Enable update for owner and vice_director" ON public.protocols;
CREATE POLICY "Enable update for owner and vice_director"
ON public.protocols FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid()
        AND users.clinic_id = protocols.clinic_id
        AND users.role IN ('owner', 'vice_director')
        AND users.status = 'active'
    )
);

DROP POLICY IF EXISTS "Enable delete for owner only" ON public.protocols;
CREATE POLICY "Enable delete for owner only"
ON public.protocols FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid()
        AND users.clinic_id = protocols.clinic_id
        AND users.role = 'owner'
        AND users.status = 'active'
    )
);

-- protocol_versions 정책
DROP POLICY IF EXISTS "Enable read for clinic members" ON public.protocol_versions;
CREATE POLICY "Enable read for clinic members"
ON public.protocol_versions FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users
        JOIN public.protocols ON protocols.id = protocol_versions.protocol_id
        WHERE users.id = auth.uid()
        AND users.clinic_id = protocols.clinic_id
        AND users.status = 'active'
    )
);

DROP POLICY IF EXISTS "Enable insert for owner and vice_director" ON public.protocol_versions;
CREATE POLICY "Enable insert for owner and vice_director"
ON public.protocol_versions FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.users
        JOIN public.protocols ON protocols.id = protocol_versions.protocol_id
        WHERE users.id = auth.uid()
        AND users.clinic_id = protocols.clinic_id
        AND users.role IN ('owner', 'vice_director')
        AND users.status = 'active'
    )
);

-- 8. 기본 카테고리 데이터 삽입 함수
CREATE OR REPLACE FUNCTION public.insert_default_protocol_categories(p_clinic_id UUID)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.protocol_categories (clinic_id, name, description, color, display_order)
    VALUES
        (p_clinic_id, '임플란트', '임플란트 관련 프로토콜', '#3B82F6', 1),
        (p_clinic_id, '교정', '교정 치료 관련 프로토콜', '#8B5CF6', 2),
        (p_clinic_id, '보철', '보철 치료 관련 프로토콜', '#EC4899', 3),
        (p_clinic_id, '보존', '보존 치료 관련 프로토콜', '#10B981', 4),
        (p_clinic_id, '치주', '치주 치료 관련 프로토콜', '#F59E0B', 5),
        (p_clinic_id, '구강외과', '구강외과 관련 프로토콜', '#EF4444', 6),
        (p_clinic_id, '예방', '예방 치료 관련 프로토콜', '#06B6D4', 7),
        (p_clinic_id, '기타', '기타 프로토콜', '#6B7280', 8)
    ON CONFLICT (clinic_id, name) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- 9. 버전 번호 자동 계산 함수
CREATE OR REPLACE FUNCTION public.calculate_next_protocol_version(
    p_protocol_id UUID,
    p_change_type VARCHAR(20)
)
RETURNS VARCHAR(20) AS $$
DECLARE
    v_current_version VARCHAR(20);
    v_major INTEGER;
    v_minor INTEGER;
BEGIN
    -- 현재 최신 버전 가져오기
    SELECT version_number INTO v_current_version
    FROM public.protocol_versions
    WHERE protocol_id = p_protocol_id
    ORDER BY created_at DESC
    LIMIT 1;

    -- 버전이 없으면 1.0으로 시작
    IF v_current_version IS NULL THEN
        RETURN '1.0';
    END IF;

    -- 버전 번호 파싱
    v_major := SPLIT_PART(v_current_version, '.', 1)::INTEGER;
    v_minor := SPLIT_PART(v_current_version, '.', 2)::INTEGER;

    -- 변경 타입에 따라 버전 증가
    IF p_change_type = 'major' THEN
        RETURN (v_major + 1)::TEXT || '.0';
    ELSE
        RETURN v_major::TEXT || '.' || (v_minor + 1)::TEXT;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 10. updated_at 자동 업데이트 트리거 함수
CREATE OR REPLACE FUNCTION public.update_protocol_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성
DROP TRIGGER IF EXISTS trigger_update_protocol_updated_at ON public.protocols;
CREATE TRIGGER trigger_update_protocol_updated_at
BEFORE UPDATE ON public.protocols
FOR EACH ROW
EXECUTE FUNCTION public.update_protocol_updated_at();

DROP TRIGGER IF EXISTS trigger_update_protocol_category_updated_at ON public.protocol_categories;
CREATE TRIGGER trigger_update_protocol_category_updated_at
BEFORE UPDATE ON public.protocol_categories
FOR EACH ROW
EXECUTE FUNCTION public.update_protocol_updated_at();

-- 성공 메시지
SELECT '진료 프로토콜 관리 기능 데이터베이스 스키마가 성공적으로 생성되었습니다!' as message;
