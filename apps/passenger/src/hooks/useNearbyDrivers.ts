import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@heytaksi/ui';
import type { VehicleType } from '@heytaksi/shared';
import { apiData } from '../services/rideApi';

export interface NearbyDriver {
  id: string;
  latitude: number;
  longitude: number;
  heading: number | null;
  vehicleType: VehicleType | null;
  etaSeconds: number;
}

/** Yakındaki sürücülerin yenilenme aralığı (ms). */
const REFRESH_MS = 10_000;

/**
 * Canlı yakın sürücüler. Sunucu yalnızca anonim konum ve ETA döndürür;
 * sürücü kimliği yolcuya açılmaz. Sekme arka plandayken sorgu durur.
 */
export function useNearbyDrivers(center: { latitude: number; longitude: number } | null) {
  const { authorizedFetch, user } = useAuth();
  const [drivers, setDrivers] = useState<NearbyDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const fetcher = useRef(authorizedFetch);
  fetcher.current = authorizedFetch;

  useEffect(() => {
    if (!user || !center) return;
    let active = true;
    const load = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const next = await apiData<NearbyDriver[]>(
          fetcher.current,
          `/dispatch/nearby?latitude=${center.latitude}&longitude=${center.longitude}`,
        );
        if (active) {
          setDrivers(next);
          setLoading(false);
        }
      } catch {
        if (active) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
    // Merkez küçük hareketlerde sorguyu yeniden kurmasın diye 3 ondalığa yuvarlanır.
  }, [user, center?.latitude.toFixed(3), center?.longitude.toFixed(3)]);

  const closestEtaSeconds = drivers.length ? Math.min(...drivers.map((driver) => driver.etaSeconds)) : null;
  return { drivers, loading, closestEtaSeconds };
}
