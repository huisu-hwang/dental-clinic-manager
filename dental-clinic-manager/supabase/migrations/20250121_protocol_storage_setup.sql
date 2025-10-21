-- ========================================
-- Storage Bucket Setup for Protocol Media
-- ========================================

-- Note: Storage bucket creation must be done through Supabase Dashboard or API
-- This migration file contains the RLS policies for the storage bucket

-- Create storage policies for protocol-media bucket
-- These policies should be applied after creating the 'protocol-media' bucket in Supabase Dashboard

-- Allow authenticated users to upload files to their clinic's folder
CREATE POLICY "Users can upload protocol media for their clinic"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'protocol-media' AND
  (storage.foldername(name))[1] = 'protocols' AND
  (
    (storage.foldername(name))[2] = 'public' OR
    (storage.foldername(name))[2] = auth.jwt() ->> 'clinic_id'
  )
);

-- Allow users to view protocol media from their clinic
CREATE POLICY "Users can view protocol media from their clinic"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'protocol-media' AND
  (
    (storage.foldername(name))[2] = 'public' OR
    (storage.foldername(name))[2] = auth.jwt() ->> 'clinic_id'
  )
);

-- Allow users to update their own clinic's protocol media
CREATE POLICY "Users can update protocol media for their clinic"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'protocol-media' AND
  (storage.foldername(name))[2] = auth.jwt() ->> 'clinic_id'
)
WITH CHECK (
  bucket_id = 'protocol-media' AND
  (storage.foldername(name))[2] = auth.jwt() ->> 'clinic_id'
);

-- Allow users to delete their own clinic's protocol media
CREATE POLICY "Users can delete protocol media for their clinic"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'protocol-media' AND
  (storage.foldername(name))[2] = auth.jwt() ->> 'clinic_id'
);

-- ========================================
-- Instructions for Manual Storage Setup:
-- ========================================
-- 1. Go to Supabase Dashboard -> Storage
-- 2. Create a new bucket named 'protocol-media'
-- 3. Set the bucket to PUBLIC (for read access)
-- 4. Apply the above policies
-- ========================================