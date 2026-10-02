-- Create the automations table
CREATE TABLE IF NOT EXISTS automations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    automation_name TEXT NOT NULL,
    curl_content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to insert their own automations
CREATE POLICY "Users can insert their own automations" 
ON automations 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create policy to allow users to select/read their own automations
CREATE POLICY "Users can view their own automations" 
ON automations 
FOR SELECT 
USING (auth.uid() = user_id);

-- Create policy to allow users to update their own automations
CREATE POLICY "Users can update their own automations" 
ON automations 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create policy to allow users to delete their own automations
CREATE POLICY "Users can delete their own automations" 
ON automations 
FOR DELETE 
USING (auth.uid() = user_id);
