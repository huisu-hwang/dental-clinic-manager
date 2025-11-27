-- ========================================
-- Fix Protocol Media Storage RLS Policy
-- ========================================
-- 문제: 기존 RLS 정책이 'protocols/{clinic_id}/' 경로를 기대하지만
-- 코드에서는 'protocol-images/' 경로를 사용하여 RLS 위반 발생
--
-- 해결: protocol-images 폴더에 대한 RLS 정책 추가

-- 1. 기존 정책 삭제 (존재하는 경우)
DROP POLICY IF EXISTS "Users can upload protocol media for their clinic" ON storage.objects;
DROP POLICY IF EXISTS "Users can view protocol media from their clinic" ON storage.objects;
DROP POLICY IF EXISTS "Users can update protocol media for their clinic" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete protocol media for their clinic" ON storage.objects;

-- 2. 새로운 정책 생성: 인증된 사용자가 protocol-images 폴더에 업로드 가능
CREATE POLICY "Allow authenticated users to upload protocol images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'protocol-media' AND
  (storage.foldername(name))[1] = 'protocol-images'
);

-- 3. 새로운 정책 생성: 인증된 사용자가 protocol-images 폴더 파일 조회 가능
CREATE POLICY "Allow authenticated users to view protocol images"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'protocol-media' AND
  (storage.foldername(name))[1] = 'protocol-images'
);

-- 4. 새로운 정책 생성: 인증된 사용자가 protocol-images 폴더 파일 수정 가능
CREATE POLICY "Allow authenticated users to update protocol images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'protocol-media' AND
  (storage.foldername(name))[1] = 'protocol-images'
)
WITH CHECK (
  bucket_id = 'protocol-media' AND
  (storage.foldername(name))[1] = 'protocol-images'
);

-- 5. 새로운 정책 생성: 인증된 사용자가 protocol-images 폴더 파일 삭제 가능
CREATE POLICY "Allow authenticated users to delete protocol images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'protocol-media' AND
  (storage.foldername(name))[1] = 'protocol-images'
);

-- 6. Public 접근 정책 (버킷이 public으로 설정된 경우 이미지 조회 허용)
-- 버킷이 public인 경우 익명 사용자도 이미지 조회 가능
CREATE POLICY "Allow public access to protocol images"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'protocol-media' AND
  (storage.foldername(name))[1] = 'protocol-images'
);

-- ========================================
-- 적용 방법:
-- 1. Supabase Dashboard -> SQL Editor
-- 2. 위 SQL 실행
-- 3. Storage -> protocol-media 버킷이 존재하는지 확인
--    (없으면 생성: 이름 'protocol-media', Public bucket 체크)
-- ========================================
