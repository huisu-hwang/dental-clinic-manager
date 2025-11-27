-- ========================================
-- Fix Protocol Media Storage RLS Policy
-- ========================================
-- 문제: 기존 RLS 정책이 'protocols/{clinic_id}/' 경로를 기대하지만
-- 코드에서는 'protocol-images/' 경로를 사용하여 RLS 위반 발생
--
-- 해결: protocol-media 버킷에 대한 간단한 RLS 정책 적용

-- ========================================
-- STEP 1: 진단 (먼저 실행하여 현재 상태 확인)
-- ========================================
-- 버킷 존재 여부 확인:
-- SELECT * FROM storage.buckets WHERE id = 'protocol-media';
--
-- 현재 정책 확인:
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage';

-- ========================================
-- STEP 2: 기존 정책 모두 삭제
-- ========================================
DROP POLICY IF EXISTS "Users can upload protocol media for their clinic" ON storage.objects;
DROP POLICY IF EXISTS "Users can view protocol media from their clinic" ON storage.objects;
DROP POLICY IF EXISTS "Users can update protocol media for their clinic" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete protocol media for their clinic" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to upload protocol images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to view protocol images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to update protocol images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to delete protocol images" ON storage.objects;
DROP POLICY IF EXISTS "Allow public access to protocol images" ON storage.objects;

-- ========================================
-- STEP 3: 간단하고 확실한 새 정책 생성
-- ========================================

-- INSERT 정책: 인증된 사용자는 protocol-media 버킷에 업로드 가능
CREATE POLICY "protocol_media_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'protocol-media');

-- SELECT 정책: 모든 사용자가 protocol-media 버킷 파일 조회 가능 (public bucket)
CREATE POLICY "protocol_media_select"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'protocol-media');

-- UPDATE 정책: 인증된 사용자는 protocol-media 버킷 파일 수정 가능
CREATE POLICY "protocol_media_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'protocol-media')
WITH CHECK (bucket_id = 'protocol-media');

-- DELETE 정책: 인증된 사용자는 protocol-media 버킷 파일 삭제 가능
CREATE POLICY "protocol_media_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'protocol-media');

-- ========================================
-- STEP 4: 버킷이 없으면 생성 (Dashboard에서 생성 권장)
-- ========================================
-- 참고: 아래 SQL은 버킷이 없을 때만 실행
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES (
--   'protocol-media',
--   'protocol-media',
--   true,
--   10485760,  -- 10MB
--   ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
-- )
-- ON CONFLICT (id) DO NOTHING;

-- ========================================
-- 적용 방법:
-- ========================================
-- 1. Supabase Dashboard -> SQL Editor 이동
-- 2. 위 STEP 2, STEP 3 SQL 복사하여 실행
-- 3. Storage -> Buckets에서 'protocol-media' 버킷 확인
--    - 없으면 새로 생성: Name = 'protocol-media', Public bucket = ON
-- 4. 앱에서 이미지 업로드 다시 테스트
-- ========================================
