DO $$ BEGIN
  CREATE TYPE ride_status AS ENUM ('searching','driver_assigned','driver_arriving','driver_arrived','started','in_progress','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS rides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id UUID NOT NULL REFERENCES users(id),
  driver_id UUID REFERENCES drivers(id),
  vehicle_id UUID REFERENCES vehicles(id),
  status ride_status NOT NULL DEFAULT 'searching',
  vehicle_type VARCHAR(30) NOT NULL,
  pickup_address TEXT NOT NULL,
  destination_address TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rides_passenger_created ON rides(passenger_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rides_driver_active ON rides(driver_id, status) WHERE status NOT IN ('completed','cancelled');
CREATE UNIQUE INDEX IF NOT EXISTS idx_rides_passenger_active ON rides(passenger_id) WHERE status NOT IN ('completed','cancelled');

CREATE TABLE IF NOT EXISTS ride_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  location_type VARCHAR(30) NOT NULL CHECK (location_type IN ('pickup','destination','driver','route_point')),
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  address TEXT,
  heading NUMERIC(6,2),
  accuracy_meters NUMERIC(8,2),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ride_locations_ride_type ON ride_locations(ride_id, location_type, recorded_at DESC);

CREATE TABLE IF NOT EXISTS ride_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  from_status ride_status,
  to_status ride_status NOT NULL,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ride_status_history_ride ON ride_status_history(ride_id, created_at);

CREATE TABLE IF NOT EXISTS ride_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL UNIQUE REFERENCES rides(id) ON DELETE CASCADE,
  currency CHAR(3) NOT NULL DEFAULT 'TRY',
  distance_meters INTEGER NOT NULL CHECK (distance_meters >= 0),
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds >= 0),
  base_fare NUMERIC(10,2) NOT NULL,
  distance_fare NUMERIC(10,2) NOT NULL,
  time_fare NUMERIC(10,2) NOT NULL,
  multiplier NUMERIC(5,2) NOT NULL DEFAULT 1,
  estimated_fare NUMERIC(10,2) NOT NULL,
  final_fare NUMERIC(10,2),
  route_geometry JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ride_cancellations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL UNIQUE REFERENCES rides(id) ON DELETE CASCADE,
  cancelled_by UUID NOT NULL REFERENCES users(id),
  reason_code VARCHAR(50) NOT NULL,
  note TEXT,
  cancellation_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO permissions(key, description) VALUES
 ('rides:create','Yolculuk talebi oluşturma'), ('rides:read','Kendi yolculuklarını görüntüleme'),
 ('rides:cancel','Kendi yolculuğunu iptal etme'), ('rides:operate','Sürücü yolculuk durumunu yönetme')
ON CONFLICT(key) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE (r.name='passenger' AND p.key IN ('rides:create','rides:read','rides:cancel'))
   OR (r.name='driver' AND p.key IN ('rides:read','rides:operate')) OR r.name='admin'
ON CONFLICT DO NOTHING;
