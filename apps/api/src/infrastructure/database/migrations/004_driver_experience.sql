-- Faz 5: sürücü deneyimi — durum makinesi, konum, mesajlaşma, değerlendirme ve ret kayıtları

ALTER TABLE drivers ADD COLUMN IF NOT EXISTS availability VARCHAR(30) NOT NULL DEFAULT 'offline'
  CHECK (availability IN ('offline','online','available','on_trip','paused'));
-- Mevcut çevrim içi sürücüler yeni durum makinesine taşınır.
UPDATE drivers SET availability = 'available' WHERE online_status = TRUE AND availability = 'offline';

CREATE TABLE IF NOT EXISTS driver_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL UNIQUE REFERENCES drivers(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  heading NUMERIC(6,2),
  accuracy_meters NUMERIC(8,2),
  speed_mps NUMERIC(6,2),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ride_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ride_messages_ride ON ride_messages(ride_id, created_at);

CREATE TABLE IF NOT EXISTS ride_rejections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  reason_code VARCHAR(40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ride_id, driver_id)
);

CREATE TABLE IF NOT EXISTS ride_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  rater_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ratee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rater_role VARCHAR(20) NOT NULL CHECK (rater_role IN ('driver','passenger')),
  stars SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ride_id, rater_id)
);
CREATE INDEX IF NOT EXISTS idx_ride_ratings_ratee ON ride_ratings(ratee_id);

INSERT INTO permissions(key, description) VALUES
  ('rides:accept', 'Gelen yolculuk tekliflerini kabul/red'),
  ('rides:message', 'Yolculuk içi mesajlaşma'),
  ('rides:rate', 'Yolculuk sonrası puanlama'),
  ('drivers:duty', 'Kendi çevrim içi durumunu yönetme')
ON CONFLICT(key) DO NOTHING;
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE (r.name='driver' AND p.key IN ('rides:read','rides:operate','rides:accept','rides:message','rides:rate','drivers:duty'))
   OR (r.name='passenger' AND p.key IN ('rides:message','rides:rate'))
ON CONFLICT DO NOTHING;
