CREATE TABLE IF NOT EXISTS business_profile (
  id INTEGER PRIMARY KEY DEFAULT 1,
  legal_business_name TEXT NOT NULL,
  parking_name TEXT NOT NULL,
  business_type TEXT NOT NULL,
  parking_license_number TEXT NOT NULL,
  tax_id TEXT NOT NULL,
  area TEXT NOT NULL,
  full_address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  latitude NUMERIC,
  longitude NUMERIC,
  total_slots INTEGER NOT NULL,
  floors INTEGER NOT NULL,
  vehicle_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  price_per_hour NUMERIC(10, 2) NOT NULL,
  contact_person TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  emergency_contact TEXT NOT NULL,
  security_lead TEXT NOT NULL,
  opening_time TEXT NOT NULL,
  closing_time TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE business_profile
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS latitude NUMERIC,
  ADD COLUMN IF NOT EXISTS longitude NUMERIC;

CREATE TABLE IF NOT EXISTS slots (
  id TEXT PRIMARY KEY,
  zone_id TEXT,
  number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  vehicle_number TEXT,
  time_elapsed TEXT,
  booked_by TEXT
);

ALTER TABLE slots
  ADD COLUMN IF NOT EXISTS zone_id TEXT;

CREATE TABLE IF NOT EXISTS parking_zones (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  type TEXT NOT NULL,
  rate NUMERIC(10, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  "user" TEXT NOT NULL,
  vehicle TEXT NOT NULL,
  time TEXT NOT NULL,
  status TEXT NOT NULL,
  assigned_slot_id TEXT,
  duration_hours INTEGER NOT NULL DEFAULT 1,
  amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS assigned_slot_id TEXT,
  ADD COLUMN IF NOT EXISTS duration_hours INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL,
  date TEXT NOT NULL
);
