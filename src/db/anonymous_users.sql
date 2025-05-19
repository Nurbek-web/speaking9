-- Migration to add anonymous users support
-- This allows the app to work without authentication

-- Create anonymous_users table
CREATE TABLE IF NOT EXISTS anonymous_users (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create temp_responses table for anonymous users
CREATE TABLE IF NOT EXISTS temp_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT REFERENCES anonymous_users(id) NOT NULL,
  test_id UUID REFERENCES tests(id) NOT NULL,
  part_number INTEGER NOT NULL,
  audio_url TEXT NOT NULL,
  transcript TEXT,
  band_score DECIMAL(3,1),
  feedback JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Enable RLS on both tables
ALTER TABLE anonymous_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE temp_responses ENABLE ROW LEVEL SECURITY;

-- Create policies for anonymous_users
-- Allow any client to create an anonymous user
CREATE POLICY "Anyone can create an anonymous user" ON anonymous_users
  FOR INSERT WITH CHECK (true);

-- Allow viewing anonymous users by ID
CREATE POLICY "Anonymous users can be retrieved by ID" ON anonymous_users
  FOR SELECT USING (true);

-- Create special policy for "temp-" and "emergency-" prefixed IDs
CREATE POLICY "Allow anonymous users to update their data" ON anonymous_users
  FOR UPDATE USING (
    id = auth.uid() OR
    id LIKE 'temp-%' OR
    id LIKE 'emergency-%'
  );

-- Create policies for temp_responses
-- Allow viewing temp_responses that match the user's ID
CREATE POLICY "Users can view their own temp responses" ON temp_responses
  FOR SELECT USING (
    user_id = auth.uid() OR
    user_id LIKE 'temp-%' OR
    user_id LIKE 'emergency-%'
  );

-- Allow inserting temp_responses for anonymous users
CREATE POLICY "Users can insert their own temp responses" ON temp_responses
  FOR INSERT WITH CHECK (
    user_id = auth.uid() OR
    user_id LIKE 'temp-%' OR
    user_id LIKE 'emergency-%'
  );

-- Allow updating temp_responses for anonymous users
CREATE POLICY "Users can update their own temp responses" ON temp_responses
  FOR UPDATE USING (
    user_id = auth.uid() OR
    user_id LIKE 'temp-%' OR
    user_id LIKE 'emergency-%'
  );

-- Allow deleting temp_responses for anonymous users
CREATE POLICY "Users can delete their own temp responses" ON temp_responses
  FOR DELETE USING (
    user_id = auth.uid() OR
    user_id LIKE 'temp-%' OR
    user_id LIKE 'emergency-%'
  );

-- Update storage policy for anonymous users
-- This must be applied manually to the storage bucket to allow anonymous uploads
-- Using the following policy from the Supabase dashboard:
/*
CREATE POLICY "Allow anonymous uploads for temp IDs" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'recordings' AND
    (auth.uid() IS NOT NULL OR
     request.get_header('user_id')::text LIKE 'temp-%' OR
     request.get_header('user_id')::text LIKE 'emergency-%')
  );
*/ 