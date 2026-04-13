-- Add daily reporting support for flow imports
ALTER TABLE flows ADD COLUMN IF NOT EXISTS report_day DATE;

CREATE INDEX IF NOT EXISTS idx_flows_day ON flows(report_day);
