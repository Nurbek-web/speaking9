-- Migration for storage bucket policies
-- This enables anonymous uploads for recordings

-- Create storage bucket if not exists
INSERT INTO storage.buckets (id, name) 
VALUES ('recordings', 'recordings')
ON CONFLICT DO NOTHING;

-- Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read recordings (public access)
CREATE POLICY "Recordings are publicly accessible" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'recordings');

-- Allow authenticated users to upload recordings
CREATE POLICY "Authenticated users can upload recordings" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'recordings' AND
    auth.uid() IS NOT NULL
  );

-- Allow anonymous users with temp IDs to upload recordings
-- This policy handles users with temporary IDs in the user_id header
CREATE POLICY "Anonymous users can upload recordings" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'recordings' AND
    (
      COALESCE(request.get_header('user_id'),'') LIKE 'temp-%' OR
      COALESCE(request.get_header('user_id'),'') LIKE 'emergency-%'
    )
  );

-- Allow users to update and delete their own recordings
CREATE POLICY "Users can update their own recordings" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'recordings' AND
    (
      auth.uid()::text = SPLIT_PART(name, '/', 1) OR
      SPLIT_PART(name, '/', 1) LIKE 'temp-%' OR
      SPLIT_PART(name, '/', 1) LIKE 'emergency-%' 
    )
  );

CREATE POLICY "Users can delete their own recordings" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'recordings' AND
    (
      auth.uid()::text = SPLIT_PART(name, '/', 1) OR
      SPLIT_PART(name, '/', 1) LIKE 'temp-%' OR
      SPLIT_PART(name, '/', 1) LIKE 'emergency-%'
    )
  ); 