-- LifeSaver-Care PostgreSQL Normalized Database Schema
-- Single Source of Truth for Application Data

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(128) PRIMARY KEY,
    name VARCHAR(255),
    full_name VARCHAR(255),
    email VARCHAR(255) UNIQUE,
    password VARCHAR(255),
    phone VARCHAR(50),
    dob VARCHAR(50),
    blood_group VARCHAR(10),
    city VARCHAR(100),
    location VARCHAR(100),
    account_type VARCHAR(50) DEFAULT 'public',
    is_blood_donor BOOLEAN DEFAULT FALSE,
    referral_code VARCHAR(100),
    referred_by VARCHAR(100),
    referral_count INTEGER DEFAULT 0,
    role VARCHAR(50) DEFAULT 'user',
    instagram VARCHAR(100),
    social_profiles JSONB DEFAULT '{}'::jsonb,
    visibility_settings JSONB DEFAULT '{}'::jsonb,
    donor_privacy JSONB DEFAULT '{}'::jsonb,
    timestamp BIGINT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_blood_group ON users(blood_group);

CREATE TABLE IF NOT EXISTS admins (
    id VARCHAR(128) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    password VARCHAR(255) DEFAULT 'admin123',
    role VARCHAR(50) DEFAULT 'SUPER_ADMIN',
    is_admin BOOLEAN DEFAULT TRUE,
    login_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE admins ADD COLUMN IF NOT EXISTS password VARCHAR(255) DEFAULT 'admin123';

CREATE TABLE IF NOT EXISTS sub_admins (
    id VARCHAR(128) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'SUB_ADMIN',
    status VARCHAR(50) DEFAULT 'Active',
    permissions JSONB DEFAULT '["blood", "requests", "organ", "logs"]'::jsonb,
    timestamp BIGINT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS blood_donors (
    id VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(128),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    blood_group VARCHAR(10) NOT NULL,
    city VARCHAR(100),
    dob VARCHAR(50),
    status VARCHAR(50) DEFAULT 'Available',
    phone_visibility VARCHAR(50) DEFAULT 'public',
    allow_emergency_contact BOOLEAN DEFAULT TRUE,
    alcohol_last_24h VARCHAR(10) DEFAULT 'No',
    times_donated INTEGER DEFAULT 0,
    donation_count INTEGER DEFAULT 0,
    registered_date VARCHAR(50),
    medical_history JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_blood_donors_bg_city ON blood_donors(blood_group, city);
CREATE INDEX IF NOT EXISTS idx_blood_donors_status ON blood_donors(status);
CREATE INDEX IF NOT EXISTS idx_blood_donors_phone ON blood_donors(phone);

CREATE TABLE IF NOT EXISTS blood_requests (
    id VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(128),
    user_email VARCHAR(255),
    patient_name VARCHAR(255),
    requester_name VARCHAR(255),
    blood_group VARCHAR(10) NOT NULL,
    units INTEGER DEFAULT 1,
    hospital VARCHAR(255) NOT NULL,
    address TEXT,
    city VARCHAR(100),
    phone VARCHAR(50),
    contact_visibility VARCHAR(50) DEFAULT 'public',
    urgency VARCHAR(50) DEFAULT 'Urgent',
    status VARCHAR(50) DEFAULT 'Pending',
    required_date VARCHAR(50),
    notes TEXT,
    timestamp BIGINT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_blood_requests_status ON blood_requests(status);
CREATE INDEX IF NOT EXISTS idx_blood_requests_bg ON blood_requests(blood_group);
CREATE INDEX IF NOT EXISTS idx_blood_requests_city ON blood_requests(city);

CREATE TABLE IF NOT EXISTS partner_hospitals (
    id VARCHAR(128) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    address TEXT,
    phone VARCHAR(50),
    emergency_phone VARCHAR(50),
    email VARCHAR(255),
    coordinator VARCHAR(255),
    status VARCHAR(50) DEFAULT 'Active',
    blood_inventory JSONB DEFAULT '{}'::jsonb,
    rating NUMERIC(3,2) DEFAULT 5.0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_partner_hospitals_city ON partner_hospitals(city);
CREATE INDEX IF NOT EXISTS idx_partner_hospitals_status ON partner_hospitals(status);

CREATE TABLE IF NOT EXISTS hospital_communications (
    id VARCHAR(128) PRIMARY KEY,
    hospital_id VARCHAR(128),
    hospital_name VARCHAR(255),
    subject VARCHAR(255),
    message TEXT,
    sender_admin_email VARCHAR(255),
    status VARCHAR(50) DEFAULT 'Sent',
    timestamp BIGINT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contact_messages (
    id VARCHAR(128) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    mobile VARCHAR(50),
    reason VARCHAR(255),
    message TEXT,
    status VARCHAR(50) DEFAULT 'new',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_contact_messages_status ON contact_messages(status);

CREATE TABLE IF NOT EXISTS donor_contact_logs (
    id VARCHAR(128) PRIMARY KEY,
    donor_id VARCHAR(128),
    donor_name VARCHAR(255),
    requester_uid VARCHAR(128),
    requester_name VARCHAR(255),
    requester_phone VARCHAR(50),
    requester_email VARCHAR(255),
    blood_group VARCHAR(10),
    contact_action VARCHAR(100) DEFAULT 'Contact Attempt',
    status VARCHAR(50) DEFAULT 'Success',
    timestamp BIGINT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_donor_contact_logs_donor_id ON donor_contact_logs(donor_id);

CREATE TABLE IF NOT EXISTS contact_requests (
    id VARCHAR(128) PRIMARY KEY,
    donor_id VARCHAR(128),
    donor_name VARCHAR(255),
    requester_uid VARCHAR(128),
    requester_name VARCHAR(255),
    requester_phone VARCHAR(50),
    requester_email VARCHAR(255),
    blood_group VARCHAR(10),
    status VARCHAR(50) DEFAULT 'pending',
    timestamp BIGINT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS organ_donors (
    id VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(128),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    dob VARCHAR(50),
    age INTEGER,
    city VARCHAR(100),
    organs_pledged VARCHAR(255) DEFAULT 'All',
    alcohol_habit VARCHAR(100) DEFAULT 'Never',
    smoking_habit VARCHAR(100) DEFAULT 'Non-Smoker',
    medical_conditions TEXT DEFAULT 'Clean',
    clearance_rating VARCHAR(100) DEFAULT 'Prime Candidate',
    allow_contact BOOLEAN DEFAULT TRUE,
    status VARCHAR(50) DEFAULT 'Active',
    registered_date VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_organ_donors_city ON organ_donors(city);
CREATE INDEX IF NOT EXISTS idx_organ_donors_status ON organ_donors(status);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id VARCHAR(128) PRIMARY KEY,
    audit_id VARCHAR(100),
    admin_email VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(100),
    target_id VARCHAR(128),
    donor_name VARCHAR(255),
    hospital_name VARCHAR(255),
    previous_value TEXT,
    new_value TEXT,
    reason TEXT,
    timestamp BIGINT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_timestamp ON admin_audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON admin_audit_logs(action);

CREATE TABLE IF NOT EXISTS profile_change_requests (
    id VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(128),
    user_name VARCHAR(255),
    user_email VARCHAR(255),
    request_type VARCHAR(100),
    current_value TEXT,
    target_value TEXT,
    reason TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    reviewed_by VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS account_change_requests (
    id VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(128),
    user_name VARCHAR(255),
    user_email VARCHAR(255),
    request_type VARCHAR(100) DEFAULT 'Privacy Preference Change',
    current_value VARCHAR(50),
    target_value VARCHAR(50),
    reason TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    reviewed_by VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recycle_bin (
    id VARCHAR(128) PRIMARY KEY,
    original_node VARCHAR(100) NOT NULL,
    original_key VARCHAR(128) NOT NULL,
    record_data JSONB NOT NULL,
    deleted_by VARCHAR(255),
    deleted_at TIMESTAMPTZ,
    timestamp BIGINT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recycle_bin_node ON recycle_bin(original_node);

CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(128) PRIMARY KEY,
    message_id VARCHAR(100),
    sender_uid VARCHAR(128),
    sender_name VARCHAR(255),
    sender_email VARCHAR(255),
    receiver_uid VARCHAR(128),
    receiver_name VARCHAR(255),
    receiver_blood_group VARCHAR(10),
    receiver_city VARCHAR(100),
    receiver_hospital VARCHAR(255),
    subject VARCHAR(255),
    message TEXT,
    source_page VARCHAR(100),
    read BOOLEAN DEFAULT FALSE,
    timestamp BIGINT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_uid);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_uid);

CREATE TABLE IF NOT EXISTS referral_codes (
    code VARCHAR(100) PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL
);

CREATE TABLE IF NOT EXISTS referrals (
    referrer_uid VARCHAR(128) NOT NULL,
    referred_uid VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (referrer_uid, referred_uid)
);

CREATE TABLE IF NOT EXISTS ai_learning_dataset (
    id VARCHAR(128) PRIMARY KEY,
    active_symptom VARCHAR(100),
    user_query TEXT,
    response_snippet TEXT,
    has_image_attached BOOLEAN DEFAULT FALSE,
    timestamp BIGINT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS traffic_hazards (
    id VARCHAR(128) PRIMARY KEY,
    hazard_data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
