-- Migration: Add Policy Store and Anti-Abuse tables
-- Description: Phase 3 implementation for Notion-synced configuration and policy rules

BEGIN;

-- Configuration Parameters Table
-- Stores system configuration parameters synced from Notion
CREATE TABLE configuration_parameters (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  key VARCHAR(255) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  data_type VARCHAR(20) DEFAULT 'string' NOT NULL,
  category VARCHAR(100) NOT NULL,
  description TEXT,
  
  -- Source tracking
  source VARCHAR(50) DEFAULT 'manual' NOT NULL,
  source_id VARCHAR(255),
  last_sync_at TIMESTAMPTZ,
  
  -- Validation
  is_active BOOLEAN DEFAULT true NOT NULL,
  validation_rule TEXT,
  
  -- Metadata
  metadata JSONB,
  tags VARCHAR(50)[] DEFAULT ARRAY[]::VARCHAR(50)[],
  
  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by VARCHAR(100),
  updated_by VARCHAR(100),
  version INTEGER DEFAULT 1 NOT NULL
);

-- Policy Rules Table
-- Stores anti-abuse and policy rules synced from Notion
CREATE TABLE policy_rules (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(100) UNIQUE NOT NULL,
  rule_type VARCHAR(50) NOT NULL,
  
  -- Rule Definition
  condition JSONB NOT NULL,
  action JSONB NOT NULL,
  priority INTEGER DEFAULT 100 NOT NULL,
  
  -- Thresholds and Limits
  thresholds JSONB,
  cooldown_minutes INTEGER,
  max_violations INTEGER,
  
  -- Status and Configuration
  is_active BOOLEAN DEFAULT true NOT NULL,
  is_test_mode BOOLEAN DEFAULT false NOT NULL,
  
  -- Source tracking (synced from Notion)
  source VARCHAR(50) DEFAULT 'notion' NOT NULL,
  source_id VARCHAR(255),
  last_sync_at TIMESTAMPTZ,
  
  -- Metadata
  description TEXT,
  metadata JSONB,
  tags VARCHAR(50)[] DEFAULT ARRAY[]::VARCHAR(50)[],
  
  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by VARCHAR(100),
  updated_by VARCHAR(100),
  version INTEGER DEFAULT 1 NOT NULL
);

-- Policy Violations Table
-- Tracks policy violations and actions taken
CREATE TABLE policy_violations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  policy_rule_id TEXT NOT NULL REFERENCES policy_rules(id),
  
  -- Violation Details
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(50) NOT NULL,
  violation_type VARCHAR(100) NOT NULL,
  severity VARCHAR(20) DEFAULT 'medium' NOT NULL,
  
  -- Violation Data
  violation_data JSONB NOT NULL,
  context JSONB,
  
  -- Action Taken
  action_taken VARCHAR(255),
  action_result JSONB,
  is_resolved BOOLEAN DEFAULT false NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by VARCHAR(100),
  
  -- Metadata
  ip_address VARCHAR(45),
  user_agent VARCHAR(500),
  session_id VARCHAR(100),
  
  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for Configuration Parameters
CREATE INDEX idx_configuration_parameters_key ON configuration_parameters(key);
CREATE INDEX idx_configuration_parameters_category ON configuration_parameters(category);
CREATE INDEX idx_configuration_parameters_source ON configuration_parameters(source);
CREATE INDEX idx_configuration_parameters_is_active ON configuration_parameters(is_active);
CREATE INDEX idx_configuration_parameters_last_sync_at ON configuration_parameters(last_sync_at);

-- Indexes for Policy Rules
CREATE INDEX idx_policy_rules_code ON policy_rules(code);
CREATE INDEX idx_policy_rules_rule_type ON policy_rules(rule_type);
CREATE INDEX idx_policy_rules_is_active ON policy_rules(is_active);
CREATE INDEX idx_policy_rules_priority ON policy_rules(priority);
CREATE INDEX idx_policy_rules_last_sync_at ON policy_rules(last_sync_at);

-- Indexes for Policy Violations
CREATE INDEX idx_policy_violations_policy_rule_id ON policy_violations(policy_rule_id);
CREATE INDEX idx_policy_violations_entity_type_id ON policy_violations(entity_type, entity_id);
CREATE INDEX idx_policy_violations_violation_type ON policy_violations(violation_type);
CREATE INDEX idx_policy_violations_severity ON policy_violations(severity);
CREATE INDEX idx_policy_violations_created_at ON policy_violations(created_at);
CREATE INDEX idx_policy_violations_is_resolved ON policy_violations(is_resolved);

-- Add updated_at trigger for configuration_parameters
CREATE OR REPLACE FUNCTION update_configuration_parameters_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER configuration_parameters_updated_at_trigger
  BEFORE UPDATE ON configuration_parameters
  FOR EACH ROW
  EXECUTE FUNCTION update_configuration_parameters_updated_at();

-- Add updated_at trigger for policy_rules
CREATE OR REPLACE FUNCTION update_policy_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER policy_rules_updated_at_trigger
  BEFORE UPDATE ON policy_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_policy_rules_updated_at();

-- Add updated_at trigger for policy_violations
CREATE OR REPLACE FUNCTION update_policy_violations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER policy_violations_updated_at_trigger
  BEFORE UPDATE ON policy_violations
  FOR EACH ROW
  EXECUTE FUNCTION update_policy_violations_updated_at();

-- Insert default ghost booking policy rule
INSERT INTO policy_rules (
  name,
  code,
  rule_type,
  condition,
  action,
  priority,
  thresholds,
  is_active,
  is_test_mode,
  source,
  description,
  created_by
) VALUES (
  'Ghost Booking Detector',
  'ghost_booking_detector',
  'ghost_booking',
  '{"type": "automated_detection", "description": "Detects bookings held without payment beyond thresholds"}',
  '{"type": "auto_cancel_or_flag", "description": "Automatically cancel or flag suspicious bookings"}',
  50,
  '{"holdTimeMinutes": 30, "maxSameGuestHolds": 5, "suspiciousPatternWindow": 24}',
  true,
  false,
  'system',
  'System rule for detecting and handling ghost bookings',
  'migration'
);

-- Insert default configuration parameters for ghost booking detection
INSERT INTO configuration_parameters (key, value, data_type, category, description, source, created_by) VALUES
  ('ghost_booking.hold_time_minutes', '30', 'number', 'ghost_booking', 'Maximum time in minutes a booking can be held without payment', 'system', 'migration'),
  ('ghost_booking.max_unpaid_reservations', '3', 'number', 'ghost_booking', 'Maximum number of unpaid reservations allowed per guest', 'system', 'migration'),
  ('ghost_booking.suspicious_pattern_window', '24', 'number', 'ghost_booking', 'Time window in hours for detecting suspicious booking patterns', 'system', 'migration'),
  ('ghost_booking.max_same_guest_holds', '5', 'number', 'ghost_booking', 'Maximum number of holds allowed per guest in the pattern window', 'system', 'migration'),
  ('ghost_booking.max_same_ip_holds', '10', 'number', 'ghost_booking', 'Maximum number of holds allowed per IP address in the pattern window', 'system', 'migration');

COMMIT;
