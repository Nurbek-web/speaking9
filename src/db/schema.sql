-- Create schema for our IELTS speaking app

-- Enable RLS (Row Level Security)
ALTER DATABASE postgres SET "app.settings.app_id" TO 'speaking9';

-- Create tables
CREATE TABLE IF NOT EXISTS users (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS tests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  book_number INTEGER NOT NULL,
  test_number INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) NOT NULL,
  test_id UUID REFERENCES tests(id) NOT NULL,
  part_number INTEGER NOT NULL,
  audio_url TEXT NOT NULL,
  transcript TEXT,
  band_score DECIMAL(3,1),
  feedback JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Set up Row Level Security policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses ENABLE ROW LEVEL SECURITY;

-- Create policies for users
CREATE POLICY "Users can view their own data" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own data" ON users
  FOR UPDATE USING (auth.uid() = id);

-- Create policies for tests (public, anyone can view)
CREATE POLICY "Tests are viewable by all users" ON tests
  FOR SELECT USING (true);

-- Create policies for responses
CREATE POLICY "Users can view their own responses" ON responses
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own responses" ON responses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own responses" ON responses
  FOR UPDATE USING (auth.uid() = user_id);

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Insert sample tests
INSERT INTO tests (name, book_number, test_number) VALUES
  ('Cambridge 17 - Test 1', 17, 1),
  ('Cambridge 17 - Test 2', 17, 2),
  ('Cambridge 17 - Test 3', 17, 3),
  ('Cambridge 18 - Test 1', 18, 1),
  ('Cambridge 18 - Test 2', 18, 2),
  ('Cambridge 18 - Test 3', 18, 3)
ON CONFLICT DO NOTHING; 