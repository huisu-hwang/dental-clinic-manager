-- =====================================================
-- 병원 게시판 파일 저장소 설정
-- Bulletin Board Storage Setup
-- =====================================================

-- 버킷 생성 (이미 존재하면 업데이트)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bulletin-files',
  'bulletin-files',
  true,  -- public 접근 허용
  10485760,  -- 10MB 제한
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/zip',
    'application/x-hwp'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760;

-- 기존 정책 삭제 (있으면)
DROP POLICY IF EXISTS "Authenticated users can upload bulletin files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view bulletin files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete bulletin files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update bulletin files" ON storage.objects;
DROP POLICY IF EXISTS "bulletin_files_insert" ON storage.objects;
DROP POLICY IF EXISTS "bulletin_files_select" ON storage.objects;
DROP POLICY IF EXISTS "bulletin_files_delete" ON storage.objects;
DROP POLICY IF EXISTS "bulletin_files_update" ON storage.objects;

-- Storage 정책: 모든 사용자가 업로드 가능 (public bucket)
CREATE POLICY "bulletin_files_insert"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'bulletin-files');

-- Storage 정책: 모든 사용자가 파일 조회 가능 (public bucket)
CREATE POLICY "bulletin_files_select"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'bulletin-files');

-- Storage 정책: 모든 사용자가 파일 삭제 가능
CREATE POLICY "bulletin_files_delete"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'bulletin-files');

-- Storage 정책: 모든 사용자가 파일 업데이트 가능
CREATE POLICY "bulletin_files_update"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'bulletin-files');
