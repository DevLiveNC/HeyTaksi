-- Eşzamanlı teklif yayını: bir yolculuk için birden fazla bekleyen teklif,
-- ilk kabul eden sürücü yolcuyu alır (kısmi tekil indeks + satır kilidi).

-- Eski model: bir yolculukta aynı anda tek bekleyen teklif.
DROP INDEX IF EXISTS idx_dispatch_offers_ride_pending;

-- Yeni model: bir yolculuğu yalnızca bir sürücü kabul edebilir.
CREATE UNIQUE INDEX IF NOT EXISTS idx_dispatch_offers_ride_accepted
  ON dispatch_offers(ride_id) WHERE status = 'accepted';

-- Bir sürücüye aynı anda hâlâ tek bekleyen teklif (mevcut indeks korunur).
-- idx_dispatch_offers_driver_pending

COMMENT ON TABLE dispatch_offers IS
  'Yolculuk teklifleri. Yakındaki sürücülere eşzamanlı yayınlanır; status=accepted kısmi tekil indeksle ilk tıklayanı kilitler.';
