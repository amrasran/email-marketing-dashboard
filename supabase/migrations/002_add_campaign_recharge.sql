-- Add ReCharge subscription column to campaigns
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS total_subscription_recharge NUMERIC;
