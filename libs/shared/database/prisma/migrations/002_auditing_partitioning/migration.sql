-- =====================================================
-- AUDITING TRIGGERS AND FUNCTIONS
-- =====================================================

-- Create a function to capture table changes for auditing
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
    old_data jsonb := '{}'::jsonb;
    new_data jsonb := '{}'::jsonb;
    changed_fields text[] := ARRAY[]::text[];
    field_name text;
    user_id text;
    user_agent text;
    ip_address text;
    session_id text;
BEGIN
    -- Get context information from application variables
    user_id := current_setting('app.current_user_id', true);
    user_agent := current_setting('app.user_agent', true);
    ip_address := current_setting('app.ip_address', true);
    session_id := current_setting('app.session_id', true);

    -- Handle different trigger operations
    IF TG_OP = 'DELETE' THEN
        old_data := row_to_json(OLD)::jsonb;
        new_data := null;
    ELSIF TG_OP = 'UPDATE' THEN
        old_data := row_to_json(OLD)::jsonb;
        new_data := row_to_json(NEW)::jsonb;
        
        -- Find changed fields
        FOR field_name IN SELECT jsonb_object_keys(old_data)
        LOOP
            IF old_data->field_name IS DISTINCT FROM new_data->field_name THEN
                changed_fields := array_append(changed_fields, field_name);
            END IF;
        END LOOP;
    ELSIF TG_OP = 'INSERT' THEN
        old_data := null;
        new_data := row_to_json(NEW)::jsonb;
    END IF;

    -- Insert audit record
    INSERT INTO audit_logs (
        table_name,
        record_id,
        operation,
        old_values,
        new_values,
        changed_fields,
        user_id,
        user_agent,
        ip_address,
        session_id,
        timestamp
    ) VALUES (
        TG_TABLE_NAME,
        COALESCE((new_data->>'id'), (old_data->>'id')),
        TG_OP,
        old_data,
        new_data,
        changed_fields,
        user_id,
        user_agent,
        ip_address,
        session_id,
        CURRENT_TIMESTAMP
    );

    -- Return appropriate record
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create audit triggers for all main tables
CREATE TRIGGER guests_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON guests
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER rooms_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON rooms
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER rate_plans_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON rate_plans
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER room_rate_plans_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON room_rate_plans
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER reservations_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON reservations
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER payments_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER ledger_entries_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON ledger_entries
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_function();

-- =====================================================
-- OPTIMISTIC LOCKING TRIGGERS
-- =====================================================

-- Create function to handle version incrementing for optimistic locking
CREATE OR REPLACE FUNCTION update_version_column()
RETURNS TRIGGER AS $$
BEGIN
    -- Increment version on update
    IF TG_OP = 'UPDATE' THEN
        NEW.version = OLD.version + 1;
        NEW.updated_at = CURRENT_TIMESTAMP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create version update triggers
CREATE TRIGGER guests_version_trigger
    BEFORE UPDATE ON guests
    FOR EACH ROW
    EXECUTE FUNCTION update_version_column();

CREATE TRIGGER rooms_version_trigger
    BEFORE UPDATE ON rooms
    FOR EACH ROW
    EXECUTE FUNCTION update_version_column();

CREATE TRIGGER rate_plans_version_trigger
    BEFORE UPDATE ON rate_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_version_column();

CREATE TRIGGER reservations_version_trigger
    BEFORE UPDATE ON reservations
    FOR EACH ROW
    EXECUTE FUNCTION update_version_column();

CREATE TRIGGER payments_version_trigger
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_version_column();

CREATE TRIGGER ledger_entries_version_trigger
    BEFORE UPDATE ON ledger_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_version_column();

-- =====================================================
-- LEDGER PARTITIONING SETUP
-- =====================================================

-- First, we need to convert the existing ledger_entries table to a partitioned table
-- This requires recreating the table as partitioned

-- Step 1: Rename existing table
ALTER TABLE ledger_entries RENAME TO ledger_entries_old;

-- Step 2: Create partitioned table
CREATE TABLE ledger_entries (
    LIKE ledger_entries_old INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES
) PARTITION BY RANGE (transaction_date);

-- Step 3: Recreate foreign key constraints for the partitioned table
ALTER TABLE ledger_entries 
    ADD CONSTRAINT ledger_entries_guest_id_fkey 
    FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE ledger_entries 
    ADD CONSTRAINT ledger_entries_reservation_id_fkey 
    FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE ledger_entries 
    ADD CONSTRAINT ledger_entries_payment_id_fkey 
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE ledger_entries 
    ADD CONSTRAINT ledger_entries_reversal_entry_id_fkey 
    FOREIGN KEY (reversal_entry_id) REFERENCES ledger_entries(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 4: Create initial partitions for current and future months
-- Current year partitions
CREATE TABLE ledger_entries_2024_01 PARTITION OF ledger_entries 
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE ledger_entries_2024_02 PARTITION OF ledger_entries 
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

CREATE TABLE ledger_entries_2024_03 PARTITION OF ledger_entries 
    FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');

CREATE TABLE ledger_entries_2024_04 PARTITION OF ledger_entries 
    FOR VALUES FROM ('2024-04-01') TO ('2024-05-01');

CREATE TABLE ledger_entries_2024_05 PARTITION OF ledger_entries 
    FOR VALUES FROM ('2024-05-01') TO ('2024-06-01');

CREATE TABLE ledger_entries_2024_06 PARTITION OF ledger_entries 
    FOR VALUES FROM ('2024-06-01') TO ('2024-07-01');

CREATE TABLE ledger_entries_2024_07 PARTITION OF ledger_entries 
    FOR VALUES FROM ('2024-07-01') TO ('2024-08-01');

CREATE TABLE ledger_entries_2024_08 PARTITION OF ledger_entries 
    FOR VALUES FROM ('2024-08-01') TO ('2024-09-01');

CREATE TABLE ledger_entries_2024_09 PARTITION OF ledger_entries 
    FOR VALUES FROM ('2024-09-01') TO ('2024-10-01');

CREATE TABLE ledger_entries_2024_10 PARTITION OF ledger_entries 
    FOR VALUES FROM ('2024-10-01') TO ('2024-11-01');

CREATE TABLE ledger_entries_2024_11 PARTITION OF ledger_entries 
    FOR VALUES FROM ('2024-11-01') TO ('2024-12-01');

CREATE TABLE ledger_entries_2024_12 PARTITION OF ledger_entries 
    FOR VALUES FROM ('2024-12-01') TO ('2025-01-01');

-- Next year partitions
CREATE TABLE ledger_entries_2025_01 PARTITION OF ledger_entries 
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE ledger_entries_2025_02 PARTITION OF ledger_entries 
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

CREATE TABLE ledger_entries_2025_03 PARTITION OF ledger_entries 
    FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

CREATE TABLE ledger_entries_2025_04 PARTITION OF ledger_entries 
    FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');

CREATE TABLE ledger_entries_2025_05 PARTITION OF ledger_entries 
    FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');

CREATE TABLE ledger_entries_2025_06 PARTITION OF ledger_entries 
    FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');

CREATE TABLE ledger_entries_2025_07 PARTITION OF ledger_entries 
    FOR VALUES FROM ('2025-07-01') TO ('2025-08-01');

CREATE TABLE ledger_entries_2025_08 PARTITION OF ledger_entries 
    FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');

CREATE TABLE ledger_entries_2025_09 PARTITION OF ledger_entries 
    FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');

CREATE TABLE ledger_entries_2025_10 PARTITION OF ledger_entries 
    FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');

CREATE TABLE ledger_entries_2025_11 PARTITION OF ledger_entries 
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

CREATE TABLE ledger_entries_2025_12 PARTITION OF ledger_entries 
    FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

-- Step 5: Copy data from old table to new partitioned table (if any exists)
INSERT INTO ledger_entries SELECT * FROM ledger_entries_old;

-- Step 6: Drop old table
DROP TABLE ledger_entries_old;

-- Step 7: Recreate the audit trigger for partitioned table
CREATE TRIGGER ledger_entries_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON ledger_entries
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_function();

-- Step 8: Recreate the version trigger for partitioned table
CREATE TRIGGER ledger_entries_version_trigger
    BEFORE UPDATE ON ledger_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_version_column();

-- =====================================================
-- PARTITION MANAGEMENT FUNCTIONS
-- =====================================================

-- Function to automatically create future partitions
CREATE OR REPLACE FUNCTION create_monthly_ledger_partition(
    partition_date date
) RETURNS void AS $$
DECLARE
    start_date date;
    end_date date;
    partition_name text;
BEGIN
    start_date := date_trunc('month', partition_date);
    end_date := start_date + interval '1 month';
    partition_name := 'ledger_entries_' || to_char(start_date, 'YYYY_MM');
    
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I PARTITION OF ledger_entries 
        FOR VALUES FROM (%L) TO (%L)',
        partition_name,
        start_date,
        end_date
    );
    
    RAISE NOTICE 'Created partition: %', partition_name;
END;
$$ LANGUAGE plpgsql;

-- Function to drop old partitions (for data retention)
CREATE OR REPLACE FUNCTION drop_old_ledger_partitions(
    retention_months integer DEFAULT 24
) RETURNS void AS $$
DECLARE
    cutoff_date date;
    partition_name text;
    partition_record record;
BEGIN
    cutoff_date := date_trunc('month', CURRENT_DATE - interval '1 month' * retention_months);
    
    FOR partition_record IN 
        SELECT schemaname, tablename 
        FROM pg_tables 
        WHERE schemaname = current_schema() 
          AND tablename LIKE 'ledger_entries_%'
          AND tablename ~ '^ledger_entries_\d{4}_\d{2}$'
    LOOP
        -- Extract date from partition name
        partition_name := partition_record.tablename;
        
        -- Check if partition is older than cutoff
        IF to_date(substring(partition_name from '\d{4}_\d{2}$'), 'YYYY_MM') < cutoff_date THEN
            EXECUTE format('DROP TABLE IF EXISTS %I', partition_name);
            RAISE NOTICE 'Dropped old partition: %', partition_name;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PERFORMANCE OPTIMIZATION INDEXES
-- =====================================================

-- Additional performance indexes for common queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_guests_search 
    ON guests USING GIN(to_tsvector('english', first_name || ' ' || last_name || ' ' || COALESCE(email, '')));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reservations_date_range 
    ON reservations (check_in_date, check_out_date) 
    WHERE status NOT IN ('CANCELLED', 'NO_SHOW');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_settlement 
    ON payments (settled_at, status) 
    WHERE status = 'COMPLETED';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ledger_entries_accounting 
    ON ledger_entries (business_date, debit_account, credit_account, amount) 
    WHERE is_reconciled = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_recent 
    ON audit_logs (timestamp DESC, table_name) 
    WHERE timestamp > CURRENT_DATE - interval '30 days';

-- =====================================================
-- UTILITY VIEWS FOR REPORTING
-- =====================================================

-- View for current room availability
CREATE OR REPLACE VIEW v_room_availability AS
SELECT 
    r.id,
    r.room_number,
    r.room_type,
    r.status,
    r.floor,
    r.max_occupancy,
    r.base_rate,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM reservations res 
            WHERE res.room_id = r.id 
              AND res.status IN ('CONFIRMED', 'CHECKED_IN')
              AND CURRENT_DATE BETWEEN res.check_in_date AND res.check_out_date
        ) THEN 'OCCUPIED'
        ELSE r.status::text
    END AS current_status,
    (SELECT res.check_out_date 
     FROM reservations res 
     WHERE res.room_id = r.id 
       AND res.status IN ('CONFIRMED', 'CHECKED_IN')
       AND CURRENT_DATE BETWEEN res.check_in_date AND res.check_out_date
     LIMIT 1) AS occupied_until
FROM rooms r
WHERE r.status != 'OUT_OF_ORDER';

-- View for financial summary
CREATE OR REPLACE VIEW v_financial_summary AS
SELECT 
    business_date,
    SUM(CASE WHEN type IN ('REVENUE', 'DEPOSIT') THEN amount ELSE 0 END) as total_revenue,
    SUM(CASE WHEN type IN ('EXPENSE', 'FEE') THEN amount ELSE 0 END) as total_expenses,
    SUM(CASE WHEN type = 'TAX' THEN amount ELSE 0 END) as total_taxes,
    SUM(CASE WHEN type = 'REFUND' THEN amount ELSE 0 END) as total_refunds,
    COUNT(*) as transaction_count
FROM ledger_entries
WHERE is_reversed = false
GROUP BY business_date
ORDER BY business_date DESC;

-- View for guest stay history
CREATE OR REPLACE VIEW v_guest_history AS
SELECT 
    g.id as guest_id,
    g.first_name,
    g.last_name,
    g.email,
    g.loyalty_number,
    COUNT(r.id) as total_stays,
    SUM(r.nights) as total_nights,
    SUM(r.total_amount) as total_spent,
    MAX(r.check_out_date) as last_stay_date,
    MIN(r.check_in_date) as first_stay_date
FROM guests g
LEFT JOIN reservations r ON g.id = r.guest_id 
    AND r.status = 'CHECKED_OUT'
GROUP BY g.id, g.first_name, g.last_name, g.email, g.loyalty_number;

COMMENT ON VIEW v_room_availability IS 'Real-time room availability with current occupancy status';
COMMENT ON VIEW v_financial_summary IS 'Daily financial summary from ledger entries';
COMMENT ON VIEW v_guest_history IS 'Guest stay history and statistics';
