-- ============================================
-- LIVE DATA / BATCH PROCESSING TABLES
-- Run this SQL in Supabase SQL Editor
-- ============================================

-- 1. send_jobs table
CREATE TABLE IF NOT EXISTS send_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    automation_id UUID NOT NULL REFERENCES automations(id),
    automation_name TEXT NOT NULL,
    total_rows INTEGER NOT NULL DEFAULT 0,
    total_batches INTEGER NOT NULL DEFAULT 0,
    current_batch INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'QUEUED',
    template_json JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- 2. send_batches table
CREATE TABLE IF NOT EXISTS send_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES send_jobs(id) ON DELETE CASCADE,
    batch_number INTEGER NOT NULL,
    total_rows INTEGER NOT NULL DEFAULT 0,
    processed_rows INTEGER NOT NULL DEFAULT 0,
    sent_rows INTEGER NOT NULL DEFAULT 0,
    failed_rows INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    next_batch_at TIMESTAMPTZ
);

-- 3. send_rows table
CREATE TABLE IF NOT EXISTS send_rows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES send_jobs(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES send_batches(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    whatsapp_number TEXT NOT NULL,
    mapped_data JSONB DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'PENDING',
    error_message TEXT,
    processed_at TIMESTAMPTZ
);

-- ============================================
-- INDEXES for performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_send_jobs_user_id ON send_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_send_jobs_status ON send_jobs(status);
CREATE INDEX IF NOT EXISTS idx_send_batches_job_id ON send_batches(job_id);
CREATE INDEX IF NOT EXISTS idx_send_rows_job_id ON send_rows(job_id);
CREATE INDEX IF NOT EXISTS idx_send_rows_batch_id ON send_rows(batch_id);
CREATE INDEX IF NOT EXISTS idx_send_rows_row_number ON send_rows(row_number);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- send_jobs RLS
ALTER TABLE send_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own send_jobs"
ON send_jobs FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own send_jobs"
ON send_jobs FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own send_jobs"
ON send_jobs FOR UPDATE
USING (auth.uid() = user_id);

-- send_batches RLS
ALTER TABLE send_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage send_batches via job ownership"
ON send_batches FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM send_jobs
        WHERE send_jobs.id = send_batches.job_id
        AND send_jobs.user_id = auth.uid()
    )
);

-- send_rows RLS
ALTER TABLE send_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage send_rows via job ownership"
ON send_rows FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM send_jobs
        WHERE send_jobs.id = send_rows.job_id
        AND send_jobs.user_id = auth.uid()
    )
);
