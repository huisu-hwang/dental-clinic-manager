-- ============================================
-- codef_connections 테이블에 공동인증서 관련 컬럼 추가
-- login_type: '0' = 공동인증서, '1' = ID/PW (기본값)
-- encrypted_cert_der: 암호화된 인증서 DER (base64)
-- encrypted_key_der: 암호화된 개인키 DER (base64)
-- Created: 2026-02-26
-- ============================================

ALTER TABLE codef_connections
  ADD COLUMN IF NOT EXISTS login_type VARCHAR(1) DEFAULT '1',
  ADD COLUMN IF NOT EXISTS encrypted_cert_der TEXT,
  ADD COLUMN IF NOT EXISTS encrypted_key_der TEXT;

COMMENT ON COLUMN codef_connections.login_type IS '인증 방식: 0=공동인증서, 1=ID/PW';
COMMENT ON COLUMN codef_connections.encrypted_cert_der IS 'AES-256-GCM 암호화된 signCert.der (base64)';
COMMENT ON COLUMN codef_connections.encrypted_key_der IS 'AES-256-GCM 암호화된 signPri.key (base64)';
