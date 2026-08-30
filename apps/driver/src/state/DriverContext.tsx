import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { useAuth } from "@heytaksi/ui";
import type {
  DriverAvailabilityTarget,
  DriverDashboard,
  DriverRideDetail,
  RideMessage,
  RideStatus,
} from "@heytaksi/shared";
import { useDriverLocation } from "../hooks/useDriverLocation";
import { driverApi } from "../services/driverApi";
import { wsBaseUrl } from "../services/config";
import { createDriverSocket, type DriverSocket } from "../services/rideSocket";

/** Sunucudaki teklif kabul penceresi (saniye). */
export const OFFER_SECONDS = 20;

interface DriverContextValue {
  dashboard: DriverDashboard | null;
  ride: DriverRideDetail | null;
  /** Realtime bağlantısı; konum sinyali bu soket üzerinden gönderilir. */
  socket: DriverSocket | null;
  /** Sunucunun bildirdiği teklif bitiş zamanı (ISO); geri sayım buna göre yapılır. */
  offerExpiresAt: string | null;
  messages: RideMessage[];
  connection: "connecting" | "live" | "offline";
  busy: boolean;
  error: string | null;
  offerArrivedAt: number | null;
  location: { latitude: number; longitude: number };
  gpsOk: boolean;
  locationError: string | null;
  refreshDashboard(): Promise<void>;
  refreshRide(): Promise<void>;
  clearError(): void;
  setAvailability(target: DriverAvailabilityTarget): Promise<boolean>;
  acceptOffer(): Promise<boolean>;
  rejectOffer(reason?: string): Promise<boolean>;
  advance(status: RideStatus): Promise<boolean>;
  startRide(): Promise<boolean>;
  cancelRide(reason: string, note?: string): Promise<boolean>;
  sendMessage(body: string): Promise<boolean>;
  markPassengerRated(stars: number, comment?: string): Promise<boolean>;
  dismissRide(): void;
}

const DriverContext = createContext<DriverContextValue | null>(null);

export function DriverProvider({ children }: PropsWithChildren) {
  const { authorizedFetch, accessToken, user } = useAuth();
  const [dashboard, setDashboard] = useState<DriverDashboard | null>(null);
  const [ride, setRide] = useState<DriverRideDetail | null>(null);
  const [messages, setMessages] = useState<RideMessage[]>([]);
  const [connection, setConnection] = useState<"connecting" | "live" | "offline">("connecting");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offerArrivedAt, setOfferArrivedAt] = useState<number | null>(null);
  const [offerExpiresAt, setOfferExpiresAt] = useState<string | null>(null);
  const [socket, setSocket] = useState<DriverSocket | null>(null);
  const fetcherRef = useRef(authorizedFetch);
  fetcherRef.current = authorizedFetch;

  const refreshDashboard = useCallback(async () => {
    try {
      const next = await driverApi.dashboard(fetcherRef.current);
      setDashboard(next);
    } catch (cause) {
      if (user) setError(cause instanceof Error ? cause.message : "Panel yüklenemedi.");
    }
  }, [user]);

  const refreshRide = useCallback(async () => {
    try {
      const next = await driverApi.currentRide(fetcherRef.current);
      setRide((current) => {
        if (next?.offerId && current?.id !== next.id) {
          setOfferArrivedAt(Date.now());
          setOfferExpiresAt(next.offerExpiresAt ?? null);
        }
        if (!next) setOfferExpiresAt(null);
        return next;
      });
    } catch {
      /* oturum yenilenirken sessizce yut; polling tekrar dener */
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void refreshDashboard();
    void refreshRide();
  }, [user, refreshDashboard, refreshRide]);

  const onDuty = Boolean(dashboard && dashboard.availability !== "offline");
  const { location, gpsOk, locationError } = useDriverLocation(
    onDuty,
    socket,
    ride?.id ?? null,
    dashboard?.location ?? null,
  );

  // WS: teklif, durum ve mesaj akışı.
  const rideRef = useRef<string | null>(null);
  const socketRef = useRef<DriverSocket | null>(null);
  useEffect(() => {
    if (!accessToken || !user) return;
    const socket: DriverSocket = createDriverSocket(wsBaseUrl, () => accessToken, {
        onStateChange: setConnection,
        onEvent: (event, data) => {
          const detail = data as Record<string, unknown>;
          if (event === "ride.offer") {
            const offer = detail.ride as DriverRideDetail | undefined;
            if (offer) {
              setRide(offer);
              setOfferArrivedAt(Date.now());
              setOfferExpiresAt((detail.expiresAt as string) ?? offer.offerExpiresAt ?? null);
            }
            void refreshDashboard();
          } else if (event === "ride.offer.closed") {
            // Teklif reddedildi, süresi doldu veya iptal edildi: ekranı temizle.
            setRide((current) => (current?.offerId ? null : current));
            setOfferArrivedAt(null);
            setOfferExpiresAt(null);
            void refreshDashboard();
          } else if (event === "driver.updated") {
            setDashboard((current) =>
              current
                ? {
                    ...current,
                    availability: (detail.availability as DriverDashboard["availability"]) ?? current.availability,
                    onlineStatus: (detail.onlineStatus as boolean) ?? current.onlineStatus,
                  }
                : current,
            );
            void refreshDashboard();
          } else if (event === "ride.updated") {
            const updated = detail as Partial<DriverRideDetail>;
            if (updated.id && updated.id === rideRef.current) {
              setRide((current) =>
                current && current.id === updated.id
                  ? ({ ...current, ...updated } as DriverRideDetail)
                  : current,
              );
            } else if (updated.status === "searching" && rideRef.current === null) {
              void refreshRide();
            }
          } else if (event === "ride.message") {
            const message = data as RideMessage;
            setMessages((current) =>
              current.some((item) => item.id === message.id) ? current : [...current, message],
            );
          }
        },
      },
    );
    socketRef.current = socket;
    setSocket(socket);
    return () => {
      socket.close();
      socketRef.current = null;
      setSocket(null);
    };
  }, [accessToken, user, refreshDashboard, refreshRide]);

  // Aktif yolculuk kanalına abone ol ve mesaj geçmişini çek.
  useEffect(() => {
    const id = ride?.id ?? null;
    if (rideRef.current === id) return;
    rideRef.current = id;
    socketRef.current?.subscribeRide(id);
    setMessages([]);
    if (id) {
      void driverApi
        .messages(fetcherRef.current, id)
        .then(setMessages)
        .catch(() => undefined);
    }
  }, [ride?.id]);

  // Polling yedeği: WS koptuğunda ya da arka plana düşüldüğünde durum güncel kalır.
  useEffect(() => {
    if (!user) return;
    const dashboardTimer = window.setInterval(
      () => {
        if (document.visibilityState === "visible") void refreshDashboard();
      },
      15_000,
    );
    const rideTimer = window.setInterval(
      () => {
        // WS Vercel'de süreçler arası yayın yapamaz; teklif REST ile de gelmeli.
        if (document.visibilityState === "visible") void refreshRide();
      },
      3_000,
    );
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshRide();
        void refreshDashboard();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(dashboardTimer);
      window.clearInterval(rideTimer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user, refreshDashboard, refreshRide]);

  const run = useCallback(async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "İşlem tamamlanamadı.");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const setAvailability = useCallback(
    (target: DriverAvailabilityTarget) =>
      run(async () => {
        setDashboard((current) =>
          current
            ? {
                ...current,
                availability: target === "online" ? "online" : target,
                onlineStatus: target !== "offline",
              }
            : current,
        );
        await driverApi.setAvailability(fetcherRef.current, target);
        await refreshDashboard();
        await refreshRide();
      }),
    [run, refreshDashboard, refreshRide],
  );

  const acceptOffer = useCallback(
    () =>
      run(async () => {
        if (!ride) return;
        const accepted = await driverApi.acceptRide(fetcherRef.current, ride.id);
        setRide(accepted);
        setOfferArrivedAt(null);
        await refreshDashboard();
      }),
    [ride, run, refreshDashboard],
  );

  const rejectOffer = useCallback(
    (reason?: string) =>
      run(async () => {
        if (!ride) return;
        await driverApi.rejectRide(fetcherRef.current, ride.id, reason);
        setRide(null);
        setOfferArrivedAt(null);
        await refreshDashboard();
      }),
    [ride, run, refreshDashboard],
  );

  const advance = useCallback(
    (status: RideStatus) =>
      run(async () => {
        if (!ride) return;
        await driverApi.updateRideStatus(fetcherRef.current, ride.id, status);
        const next = await driverApi.currentRide(fetcherRef.current);
        setRide(next);
        await refreshDashboard();
      }),
    [ride, run, refreshDashboard],
  );

  // Yolculuğu başlat: durum makinesi started → in_progress arka arkaya ilerler.
  const startRide = useCallback(
    () =>
      run(async () => {
        if (!ride) return;
        await driverApi.updateRideStatus(fetcherRef.current, ride.id, "started");
        await driverApi.updateRideStatus(fetcherRef.current, ride.id, "in_progress");
        const next = await driverApi.currentRide(fetcherRef.current);
        setRide(next);
      }),
    [ride, run],
  );

  const cancelRide = useCallback(
    (reason: string, note?: string) =>
      run(async () => {
        if (!ride) return;
        await driverApi.cancelRide(fetcherRef.current, ride.id, reason, note);
        const next = await driverApi.currentRide(fetcherRef.current);
        setRide(next);
        setOfferArrivedAt(null);
        await refreshDashboard();
      }),
    [ride, run, refreshDashboard],
  );

  const sendMessage = useCallback(
    (body: string) =>
      run(async () => {
        if (!ride) return;
        const message = await driverApi.sendMessage(fetcherRef.current, ride.id, body);
        setMessages((current) =>
          current.some((item) => item.id === message.id) ? current : [...current, message],
        );
      }),
    [ride, run],
  );

  const markPassengerRated = useCallback(
    (stars: number, comment?: string) =>
      run(async () => {
        if (!ride) return;
        await driverApi.ratePassenger(fetcherRef.current, ride.id, stars, comment);
        setRide((current) => (current ? { ...current, passengerRated: true } : current));
      }),
    [ride, run],
  );

  const value = useMemo<DriverContextValue>(
    () => ({
      dashboard,
      ride,
      socket,
      offerExpiresAt,
      messages,
      connection,
      busy,
      error,
      offerArrivedAt,
      location,
      gpsOk,
      locationError,
      refreshDashboard,
      refreshRide,
      clearError: () => setError(null),
      setAvailability,
      acceptOffer,
      rejectOffer,
      advance,
      startRide,
      cancelRide,
      sendMessage,
      markPassengerRated,
      dismissRide: () => {
        setRide(null);
        setOfferArrivedAt(null);
        setOfferExpiresAt(null);
      },
    }),
    [
      dashboard, ride, socket, offerExpiresAt, messages, connection, busy, error, offerArrivedAt,
      location, gpsOk, locationError,
      refreshDashboard, refreshRide, setAvailability, acceptOffer, rejectOffer,
      advance, startRide, cancelRide, sendMessage, markPassengerRated,
    ],
  );
  return <DriverContext.Provider value={value}>{children}</DriverContext.Provider>;
}

export function useDriver() {
  const value = useContext(DriverContext);
  if (!value) throw new Error("useDriver, DriverProvider içinde kullanılmalıdır.");
  return value;
}
