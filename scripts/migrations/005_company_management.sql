-- Company profile, branches, and offices

CREATE TABLE IF NOT EXISTS company_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name VARCHAR(300) NOT NULL,
  legal_name VARCHAR(300) NOT NULL,
  registration_number VARCHAR(100),
  gst_number VARCHAR(50),
  pan_number VARCHAR(20),
  email VARCHAR(200) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  website VARCHAR(500),
  address TEXT NOT NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  pin_code VARCHAR(20),
  billing_address TEXT,
  billing_city VARCHAR(100),
  billing_state VARCHAR(100),
  billing_pin_code VARCHAR(20),
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System',
  updated_at TIMESTAMPTZ,
  updated_by VARCHAR(200),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by VARCHAR(200)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_company_profile_singleton
  ON company_profiles ((TRUE))
  WHERE NOT is_deleted;

CREATE TABLE IF NOT EXISTS company_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_code VARCHAR(50) NOT NULL UNIQUE,
  branch_name VARCHAR(200) NOT NULL,
  city VARCHAR(100),
  state VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System',
  updated_at TIMESTAMPTZ,
  updated_by VARCHAR(200),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by VARCHAR(200)
);

CREATE TABLE IF NOT EXISTS company_offices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_code VARCHAR(50) NOT NULL UNIQUE,
  office_name VARCHAR(200) NOT NULL,
  branch_id UUID NOT NULL REFERENCES company_branches(id),
  floor VARCHAR(50),
  capacity INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System',
  updated_at TIMESTAMPTZ,
  updated_by VARCHAR(200),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by VARCHAR(200)
);

INSERT INTO company_profiles (
  company_name, legal_name, registration_number, gst_number, pan_number,
  email, phone, website, address, city, state, pin_code,
  billing_address, billing_city, billing_state, billing_pin_code, created_by
)
SELECT
  'Signet Workforce Solutions Pvt. Ltd.',
  'Signet Workforce Solutions Private Limited',
  'U74999MH2018PTC312456',
  '27AABCS1234F1Z5',
  'AABCS1234F',
  'info@signetworkforce.com',
  '+91 22 4567 8900',
  'https://signetworkforce.com',
  '501, Business Park, Andheri East',
  'Mumbai',
  'Maharashtra',
  '400069',
  '501, Business Park, Andheri East',
  'Mumbai',
  'Maharashtra',
  '400069',
  'System'
WHERE NOT EXISTS (SELECT 1 FROM company_profiles WHERE NOT is_deleted);

INSERT INTO company_branches (branch_code, branch_name, city, state, is_active, created_by)
VALUES
  ('BR-MUM', 'Mumbai HQ', 'Mumbai', 'Maharashtra', TRUE, 'System'),
  ('BR-PUN', 'Pune Office', 'Pune', 'Maharashtra', TRUE, 'System'),
  ('BR-DEL', 'Delhi NCR', 'Gurgaon', 'Haryana', TRUE, 'System'),
  ('BR-BLR', 'Bangalore', 'Bangalore', 'Karnataka', FALSE, 'System')
ON CONFLICT (branch_code) DO NOTHING;

INSERT INTO company_offices (office_code, office_name, branch_id, floor, capacity, is_active, created_by)
SELECT 'OF-MUM-01', 'Corporate Office', b.id, '5th Floor', 80, TRUE, 'System'
FROM company_branches b WHERE b.branch_code = 'BR-MUM'
ON CONFLICT (office_code) DO NOTHING;

INSERT INTO company_offices (office_code, office_name, branch_id, floor, capacity, is_active, created_by)
SELECT 'OF-MUM-02', 'Operations Wing', b.id, '3rd Floor', 40, TRUE, 'System'
FROM company_branches b WHERE b.branch_code = 'BR-MUM'
ON CONFLICT (office_code) DO NOTHING;

INSERT INTO company_offices (office_code, office_name, branch_id, floor, capacity, is_active, created_by)
SELECT 'OF-PUN-01', 'Pune Main', b.id, '2nd Floor', 30, TRUE, 'System'
FROM company_branches b WHERE b.branch_code = 'BR-PUN'
ON CONFLICT (office_code) DO NOTHING;

INSERT INTO company_offices (office_code, office_name, branch_id, floor, capacity, is_active, created_by)
SELECT 'OF-DEL-01', 'NCR Hub', b.id, '1st Floor', 25, TRUE, 'System'
FROM company_branches b WHERE b.branch_code = 'BR-DEL'
ON CONFLICT (office_code) DO NOTHING;
