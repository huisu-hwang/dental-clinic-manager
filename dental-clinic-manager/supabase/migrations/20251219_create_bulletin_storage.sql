-- =====================================================
-- 병원 게시판 파일 저장소 설정
-- Bulletin Board Storage Setup
-- =====================================================

-- 버킷 생성 (이미 존재하면 무시)
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

-- Storage 정책: 인증된 사용자는 자신의 클리닉 폴더에 업로드 가능
CREATE POLICY "Authenticated users can upload bulletin files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'bulletin-files'
);

-- Storage 정책: 모든 사용자가 파일 조회 가능 (public bucket)
CREATE POLICY "Anyone can view bulletin files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'bulletin-files');

-- Storage 정책: 인증된 사용자는 파일 삭제 가능
CREATE POLICY "Authenticated users can delete bulletin files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'bulletin-files');

-- Storage 정책: 인증된 사용자는 파일 업데이트 가능
CREATE POLICY "Authenticated users can update bulletin files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'bulletin-files');
