-- Faz 6: gerçek zamanlı dağıtım (dispatch) — teklif kuyruğu, sürücü konum defteri ve canlı izleme yetkileri.

-- Yolcu konumu da yolculuk konum defterine yazılabilir (canlı buluşma noktası doğruluğu).
ALTER TABLE ride_locations DROP CONSTRAINT IF EXISTS ride_locations_location_type_check;
ALTER TABLE ride_locations ADD CONSTRAINT ride_locations_location_type_check
  CHECK (location_type IN ('pickup','destination','driver','passenger','route_point'));

-- Sürücü konum defteri: Redis birincil kaynak, PostgreSQL kalıcı yedek ve fallback.
ALTER TABLE driver_locations ADD COLUMN IF NOT EXISTS availability VARCHAR(30) NOT NULL DEFAULT 'offline';
ALTER TABLE driver_locations ADD COLUMN IF NOT EXISTS ride_id UUID REFERENCES rides(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_driver_locations_recorded ON driver_locations(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_locations_availability ON driver_locations(availability, recorded_at DESC);

-- Dağıtım oturumu: bir yolculuk talebi için yürütülen arama süreci.
CREATE TABLE IF NOT EXISTS dispatch_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'searching'
    CHECK (status IN ('searching','assigned','exhausted','cancelled')),
  round INTEGER NOT NULL DEFAULT 0 CHECK (round >= 0),
  radius_meters INTEGER NOT NULL,
  vehicle_type VARCHAR(30) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dispatch_sessions_status ON dispatch_sessions(status, expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dispatch_sessions_active ON dispatch_sessions(ride_id) WHERE status = 'searching';

-- Sürücüye gönderilen tekil teklif; sıradaki sürücüye geçiş bu tablodan denetlenir.
CREATE TABLE IF NOT EXISTS dispatch_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES dispatch_sessions(id) ON DELETE CASCADE,
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','rejected','expired','cancelled')),
  rank INTEGER NOT NULL DEFAULT 1,
  score NUMERIC(6,2) NOT NULL DEFAULT 0,
  eta_seconds INTEGER NOT NULL DEFAULT 0,
  distance_meters INTEGER NOT NULL DEFAULT 0,
  score_breakdown JSONB NOT NULL DEFAULT '{}',
  reason_code VARCHAR(40),
  offered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  responded_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_dispatch_offers_ride ON dispatch_offers(ride_id, offered_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispatch_offers_driver ON dispatch_offers(driver_id, offered_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispatch_offers_pending ON dispatch_offers(status, expires_at) WHERE status = 'pending';
-- Bir sürücüye aynı anda yalnızca tek teklif; bir yolculuk için aynı anda tek bekleyen teklif.
CREATE UNIQUE INDEX IF NOT EXISTS idx_dispatch_offers_driver_pending ON dispatch_offers(driver_id) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS idx_dispatch_offers_ride_pending ON dispatch_offers(ride_id) WHERE status = 'pending';

-- Kabul/red oranları teklif geçmişinden deterministik olarak hesaplanır.
CREATE OR REPLACE VIEW driver_dispatch_stats AS
SELECT d.id AS driver_id,
       COUNT(o.id) FILTER (WHERE o.status IN ('accepted','rejected','expired'))::int AS offers_total,
       COUNT(o.id) FILTER (WHERE o.status = 'accepted')::int AS offers_accepted,
       COUNT(o.id) FILTER (WHERE o.status = 'rejected')::int AS offers_rejected,
       COUNT(o.id) FILTER (WHERE o.status = 'expired')::int AS offers_expired
FROM drivers d LEFT JOIN dispatch_offers o ON o.driver_id = d.id
GROUP BY d.id;

INSERT INTO permissions(key, description) VALUES
  ('dispatch:monitor', 'Canlı dağıtım ve sürücü haritasını izleme'),
  ('dispatch:manage', 'Dağıtım oturumunu yeniden başlatma ve teklifi iptal etme')
ON CONFLICT(key) DO NOTHING;
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE (r.name IN ('admin','dispatcher') AND p.key IN ('dispatch:monitor','dispatch:manage'))
   OR (r.name = 'support' AND p.key = 'dispatch:monitor')
ON CONFLICT DO NOTHING;
