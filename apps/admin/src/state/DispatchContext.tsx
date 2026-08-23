import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { useAuth } from '@heytaksi/ui';
import type { DispatchOverview, LiveDriverMarker, LiveRideMarker } from '@heytaksi/shared';
import { dispatchApi } from '../services/dispatchApi';
import { wsBaseUrl } from '../services/config';

type Connection = 'connecting' | 'live' | 'offline';

interface DispatchContextValue {
  drivers: LiveDriverMarker[];
  rides: LiveRideMarker[];
  counts: DispatchOverview['counts'];
  connection: Connection;
  updatedAt: string | null;
  selectedRideId: string | null;
  selectedDriverId: string | null;
  error: string | null;
  selectRide(rideId: string | null): void;
  selectDriver(driverId: string | null): void;
  refresh(): Promise<void>;
}

const emptyCounts: DispatchOverview['counts'] = {
  online: 0,
  available: 0,
  onTrip: 0,
  paused: 0,
  searchingRides: 0,
  activeRides: 0,
};

const DispatchContext = createContext<DispatchContextValue | null>(null);

/** Konum sinyali bu süreyi aşan sürücüler haritadan düşürülür (sunucu TTL'i ile uyumlu). */
const STALE_AFTER_SECONDS = 60;

/**
 * Canlı dağıtım durumu.
 *
 * İlk yükleme REST anlık görüntüsüyle yapılır, sonrasında WebSocket olayları
 * (`dispatch.driver.moved`, `dispatch.driver.left`, `dispatch.ride`) state'i günceller.
 * Bağlantı koparsa otomatik yeniden bağlanılır ve anlık görüntü tazelenir.
 */
export function DispatchProvider({ children }: PropsWithChildren) {
  const { authorizedFetch, accessToken, user } = useAuth();
  const [drivers, setDrivers] = useState<LiveDriverMarker[]>([]);
  const [rides, setRides] = useState<LiveRideMarker[]>([]);
  const [counts, setCounts] = useState<DispatchOverview['counts']>(emptyCounts);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(authorizedFetch);
  fetcherRef.current = authorizedFetch;

  const applyOverview = useCallback((overview: DispatchOverview) => {
    setDrivers(overview.drivers);
    setRides(overview.rides);
    setCounts(overview.counts);
    setUpdatedAt(overview.generatedAt);
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      applyOverview(await dispatchApi.live(fetcherRef.current));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Canlı veri alınamadı.');
    }
  }, [applyOverview]);

  useEffect(() => {
    if (user) void refresh();
  }, [user, refresh]);

  // WebSocket: canlı konum ve dağıtım olayları.
  useEffect(() => {
    if (!accessToken || !user) return;
    let socket: WebSocket | null = null;
    let closed = false;
    let retry: number | undefined;

    const open = () => {
      if (closed) return;
      setConnection('connecting');
      socket = new WebSocket(wsBaseUrl);
      socket.onopen = () => socket?.send(JSON.stringify({ event: 'auth', data: { token: accessToken } }));
      socket.onmessage = (message) => {
        const envelope = JSON.parse(String(message.data)) as { event: string; data: unknown };
        if (envelope.event === 'authenticated') {
          socket?.send(JSON.stringify({ event: 'dispatch.subscribe', data: {} }));
          return;
        }
        if (envelope.event === 'dispatch.subscribed') {
          setConnection('live');
          return;
        }
        if (envelope.event === 'dispatch.drivers') {
          applyOverview(envelope.data as DispatchOverview);
          return;
        }
        if (envelope.event === 'dispatch.driver.moved') {
          const marker = envelope.data as LiveDriverMarker;
          setDrivers((current) => {
            const index = current.findIndex((driver) => driver.driverId === marker.driverId);
            if (index === -1) return [...current, marker];
            const next = [...current];
            next[index] = { ...next[index], ...marker };
            return next;
          });
          setUpdatedAt(new Date().toISOString());
          return;
        }
        if (envelope.event === 'dispatch.driver.left') {
          const { driverId } = envelope.data as { driverId: string };
          setDrivers((current) => current.filter((driver) => driver.driverId !== driverId));
          return;
        }
        if (envelope.event === 'dispatch.ride') {
          // Yolculuk listesi ve sayaçlar sunucudan tazelenir (tek doğruluk kaynağı).
          void refresh();
          return;
        }
        if (envelope.event === 'error') {
          const code = (envelope.data as { code?: string }).code;
          if (code === 'FORBIDDEN') setError('Canlı dağıtım izniniz bulunmuyor.');
        }
      };
      socket.onclose = () => {
        setConnection('offline');
        socket = null;
        if (!closed) retry = window.setTimeout(open, 3_000);
      };
    };
    open();
    return () => {
      closed = true;
      window.clearTimeout(retry);
      socket?.close();
    };
  }, [accessToken, user, applyOverview, refresh]);

  // Bayat işaretçileri düşür ve yaş sayaçlarını ilerlet.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setDrivers((current) =>
        current
          .map((driver) => ({
            ...driver,
            ageSeconds: Math.max(0, Math.round((Date.now() - new Date(driver.recordedAt).getTime()) / 1000)),
          }))
          .filter((driver) => driver.ageSeconds < STALE_AFTER_SECONDS),
      );
    }, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  // Sayaçlar canlı sürücü listesinden türetilir; yolculuk sayaçları sunucudan gelir.
  const liveCounts = useMemo<DispatchOverview['counts']>(
    () => ({
      ...counts,
      online: drivers.filter((driver) => driver.availability === 'online').length,
      available: drivers.filter((driver) => driver.availability === 'available').length,
      onTrip: drivers.filter((driver) => driver.availability === 'on_trip').length,
      paused: drivers.filter((driver) => driver.availability === 'paused').length,
    }),
    [counts, drivers],
  );

  const value = useMemo<DispatchContextValue>(
    () => ({
      drivers,
      rides,
      counts: liveCounts,
      connection,
      updatedAt,
      selectedRideId,
      selectedDriverId,
      error,
      selectRide: (rideId) => {
        setSelectedRideId(rideId);
        if (rideId) setSelectedDriverId(null);
      },
      selectDriver: (driverId) => {
        setSelectedDriverId(driverId);
        if (driverId) setSelectedRideId(null);
      },
      refresh,
    }),
    [drivers, rides, liveCounts, connection, updatedAt, selectedRideId, selectedDriverId, error, refresh],
  );

  return <DispatchContext.Provider value={value}>{children}</DispatchContext.Provider>;
}

export function useDispatch() {
  const value = useContext(DispatchContext);
  if (!value) throw new Error('useDispatch, DispatchProvider içinde kullanılmalıdır.');
  return value;
}
