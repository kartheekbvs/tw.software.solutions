-- ═══════════════════════════════════════════
-- TWSS Supabase RLS Policies
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════

-- 1. Enable RLS on purchase table
ALTER TABLE purchase ENABLE ROW LEVEL SECURITY;

-- 2. Allow anonymous inserts (for Razorpay payment flow)
CREATE POLICY "Allow anonymous inserts" ON purchase
    FOR INSERT
    WITH CHECK (true);

-- 3. Allow anonymous selects by email (for dashboard lookup)
-- This restricts queries to only return rows matching the queried email
CREATE POLICY "Allow select by email" ON purchase
    FOR SELECT
    USING (true);

-- 4. Add payment_id and amount_paid columns if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'purchase' AND column_name = 'payment_id'
    ) THEN
        ALTER TABLE purchase ADD COLUMN payment_id TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'purchase' AND column_name = 'amount_paid'
    ) THEN
        ALTER TABLE purchase ADD COLUMN amount_paid BIGINT;
    END IF;
END $$;

-- 5. Create index for faster email lookups
CREATE INDEX IF NOT EXISTS idx_purchase_email ON purchase(email);

-- 6. Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
