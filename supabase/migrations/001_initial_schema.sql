-- Broc Shot Email Marketing Dashboard Schema
-- Run: psql $DATABASE_URL -f supabase/migrations/001_initial_schema.sql

-- Upload tracking
CREATE TABLE IF NOT EXISTS upload_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('campaigns', 'flows', 'benchmarks')),
  row_count INTEGER,
  uploaded_by UUID REFERENCES auth.users(id)
);

-- Campaign performance data
CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  batch_id UUID REFERENCES upload_batches(id) ON DELETE CASCADE,
  month_group TEXT,
  send_date TEXT,
  campaign_name TEXT,
  audience TEXT,
  subject_line TEXT,
  day_of_week TEXT,
  send_time TEXT,
  open_rate NUMERIC,
  ctr NUMERIC,
  placed_order NUMERIC,
  unsubscribe_rate NUMERIC,
  ab_test TEXT,
  ab_winner TEXT,
  is_subtotal BOOLEAN DEFAULT FALSE
);

-- Automated flow performance
CREATE TABLE IF NOT EXISTS flows (
  id SERIAL PRIMARY KEY,
  batch_id UUID REFERENCES upload_batches(id) ON DELETE CASCADE,
  report_month TEXT,
  report_day DATE,
  date_range TEXT,
  flow_id TEXT,
  flow_name TEXT,
  message_id TEXT,
  message_name TEXT,
  message_channel TEXT,
  status TEXT,
  total_recipients INTEGER,
  open_rate NUMERIC,
  click_rate NUMERIC,
  unsubscribe_rate NUMERIC,
  bounce_rate NUMERIC,
  spam_complaints_rate NUMERIC,
  sms_failed_delivery_rate NUMERIC,
  total_placed_order NUMERIC,
  unique_placed_order INTEGER,
  total_placed_order_value NUMERIC,
  placed_order_rate NUMERIC,
  total_recharge_subscription NUMERIC,
  unique_recharge_subscription INTEGER,
  total_recharge_value NUMERIC,
  recharge_rate NUMERIC,
  total_added_to_cart INTEGER,
  added_to_cart_rate NUMERIC,
  tags TEXT,
  message_status TEXT
);

-- Benchmark data
CREATE TABLE IF NOT EXISTS benchmarks (
  id SERIAL PRIMARY KEY,
  batch_id UUID REFERENCES upload_batches(id) ON DELETE CASCADE,
  report_month TEXT,
  benchmark_type TEXT,
  performance_indicator TEXT,
  month TEXT,
  status TEXT,
  your_value NUMERIC,
  your_percentile NUMERIC,
  peer_25th NUMERIC,
  peer_median NUMERIC,
  peer_75th NUMERIC,
  industry_25th NUMERIC,
  industry_median NUMERIC,
  industry_75th NUMERIC
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_campaigns_month ON campaigns(month_group);
CREATE INDEX IF NOT EXISTS idx_campaigns_batch ON campaigns(batch_id);
CREATE INDEX IF NOT EXISTS idx_flows_month ON flows(report_month);
CREATE INDEX IF NOT EXISTS idx_flows_flow_id ON flows(flow_id);
CREATE INDEX IF NOT EXISTS idx_flows_batch ON flows(batch_id);
CREATE INDEX IF NOT EXISTS idx_benchmarks_type ON benchmarks(benchmark_type);
CREATE INDEX IF NOT EXISTS idx_benchmarks_month ON benchmarks(report_month);
CREATE INDEX IF NOT EXISTS idx_benchmarks_batch ON benchmarks(batch_id);

-- RLS policies
ALTER TABLE upload_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE benchmarks ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated access upload_batches') THEN
    CREATE POLICY "Authenticated access upload_batches" ON upload_batches FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated access campaigns') THEN
    CREATE POLICY "Authenticated access campaigns" ON campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated access flows') THEN
    CREATE POLICY "Authenticated access flows" ON flows FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated access benchmarks') THEN
    CREATE POLICY "Authenticated access benchmarks" ON benchmarks FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Allow anon access (for development / pre-auth usage)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anon access upload_batches') THEN
    CREATE POLICY "Anon access upload_batches" ON upload_batches FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anon access campaigns') THEN
    CREATE POLICY "Anon access campaigns" ON campaigns FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anon access flows') THEN
    CREATE POLICY "Anon access flows" ON flows FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anon access benchmarks') THEN
    CREATE POLICY "Anon access benchmarks" ON benchmarks FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;
