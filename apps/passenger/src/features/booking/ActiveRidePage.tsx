import {
  CarFront,
  CheckCircle2,
  LoaderCircle,
  MessageCircle,
  Navigation,
  Phone,
  ShieldCheck,
  Star,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@heytaksi/ui";
import type { RideStatus } from "@heytaksi/shared";
import { useBooking, type ActiveRide } from "./BookingContext";
import { InteractiveMap } from "./InteractiveMap";
import { rideApi } from "../../services/rideApi";
const copy: Record<RideStatus, { title: string; caption: string }> = {
  searching: {
    title: "Taksin aranıyor",
    caption: "Yakındaki sürücülere talebini iletiyoruz.",
  },
  driver_assigned: {
    title: "Sürücün bulundu",
    caption: "Sürücün yolculuğu kabul etti.",
  },
  driver_arriving: {
    title: "Sürücün geliyor",
    caption: "Aracın alış noktasına doğru ilerliyor.",
  },
  driver_arrived: {
    title: "Sürücün geldi",
    caption: "Sarı aracı güvenli alanda bulabilirsin.",
  },
  started: { title: "Yolculuk başladı", caption: "İyi yolculuklar dileriz." },
  in_progress: {
    title: "Yolculuktasın",
    caption: "Varış noktasına ilerliyorsun.",
  },
  completed: {
    title: "Yolculuk tamamlandı",
    caption: "Bizi tercih ettiğin için teşekkürler.",
  },
  cancelled: {
    title: "Yolculuk iptal edildi",
    caption: "Yeni bir yolculuk oluşturabilirsin.",
  },
};
export function ActiveRidePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const booking = useBooking();
  const [ride, setRide] = useState<ActiveRide | null>(booking.activeRide);
  const [error, setError] = useState("");
  const status = (ride?.status ?? "searching") as RideStatus;
  useEffect(() => {
    if (!ride)
      rideApi
        .get(auth.authorizedFetch, id)
        .then((data) => {
          const value = data as unknown as ActiveRide;
          setRide(value);
          booking.setActiveRide(value);
        })
        .catch(() => navigate("/home"));
  }, [id]);
  useEffect(() => {
    if (status !== "searching") return;
    const timer = setTimeout(() => {
      rideApi
        .match(auth.authorizedFetch, id)
        .then((result) => {
          const value = result.ride as unknown as ActiveRide;
          setRide(value);
          booking.setActiveRide(value);
        })
        .catch((cause) =>
          setError(cause instanceof Error ? cause.message : "Sürücü aranamadı"),
        );
    }, 2200);
    return () => clearTimeout(timer);
  }, [id, status]);
  useEffect(() => {
    if (!auth.accessToken) return;
    const socket = new WebSocket(
      import.meta.env.VITE_WS_URL ?? "ws://localhost:3000/ws",
    );
    socket.onopen = () =>
      socket.send(
        JSON.stringify({ event: "auth", data: { token: auth.accessToken } }),
      );
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as {
        event: string;
        data: unknown;
      };
      if (message.event === "authenticated")
        socket.send(
          JSON.stringify({ event: "ride.subscribe", data: { rideId: id } }),
        );
      if (message.event === "ride.updated") {
        const update = message.data as Partial<ActiveRide>;
        setRide((current) => {
          const value = { ...current, ...update } as ActiveRide;
          booking.setActiveRide(value);
          return value;
        });
      }
    };
    return () => socket.close();
  }, [id, auth.accessToken]);
  if (!ride)
    return (
      <div className="ride-loading">
        <LoaderCircle />
        <h1>Yolculuk hazırlanıyor</h1>
      </div>
    );
  const cancel = async () => {
    try {
      const value = (await rideApi.cancel(
        auth.authorizedFetch,
        id,
      )) as unknown as ActiveRide;
      setRide(value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "İptal edilemedi");
    }
  };
  if (status === "completed")
    return (
      <div className="completion-page">
        <div className="completion-icon">
          <CheckCircle2 />
        </div>
        <span>YOLCULUK TAMAMLANDI</span>
        <h1>Güvenle vardın.</h1>
        <p>{ride.destinationAddress}</p>
        <section>
          <small>Toplam ücret</small>
          <strong>
            ₺{Number(ride.finalFare ?? ride.estimatedFare).toFixed(2)}
          </strong>
          <div>
            <Star />
            <Star />
            <Star />
            <Star />
            <Star />
          </div>
        </section>
        <button
          className="request-primary"
          onClick={() => {
            booking.setActiveRide(null);
            navigate("/home");
          }}
        >
          Ana sayfaya dön
        </button>
      </div>
    );
  return (
    <div className="active-ride-page">
      <InteractiveMap
        route={
          ride.geometry
            ? {
                distanceMeters: ride.distanceMeters,
                durationSeconds: ride.durationSeconds,
                geometry: ride.geometry,
              }
            : booking.route
        }
        pickup={booking.pickup}
        destination={booking.destination}
        driverLocation={ride.driverLocation}
        className="active-ride-map"
      />
      <section className="ride-progress-sheet">
        <div className="sheet-grabber" />
        <div className={`status-orbit ${status}`}>
          <i>
            <CarFront />
          </i>
          {status === "searching" && <span />}
        </div>
        <span className="status-eyebrow">CANLI YOLCULUK</span>
        <h1>{copy[status].title}</h1>
        <p>{copy[status].caption}</p>
        {status === "searching" ? (
          <div className="searching-progress">
            <span />
            <small>Bu genellikle birkaç saniye sürer</small>
          </div>
        ) : status === "cancelled" ? (
          <button className="request-primary" onClick={() => navigate("/home")}>
            Yeni yolculuk oluştur
          </button>
        ) : (
          <>
            <section className="assigned-driver">
              <div className="driver-photo">
                {ride.driverName?.charAt(0) ?? "S"}
              </div>
              <span>
                <small>SÜRÜCÜN</small>
                <strong>{ride.driverName ?? "Hey Taksi sürücüsü"}</strong>
                <em>
                  <Star />
                  4.9 · {ride.vehicle ?? "Araç"} · {ride.plate}
                </em>
              </span>
              <button aria-label="Sürücüyü ara">
                <Phone />
              </button>
              <button aria-label="Mesaj gönder">
                <MessageCircle />
              </button>
            </section>
            <div className="eta-banner">
              <Navigation />
              <span>
                <strong>
                  {status === "driver_arrived"
                    ? "Sürücü alış noktasında"
                    : `${Math.max(1, Math.ceil(ride.durationSeconds / 300))} dk`}
                </strong>
                <small>{ride.pickupAddress}</small>
              </span>
            </div>
          </>
        )}
        {error && <div className="booking-error">{error}</div>}
        {!["started", "in_progress", "cancelled"].includes(status) && (
          <button className="cancel-ride" onClick={() => void cancel()}>
            <X />
            Yolculuğu iptal et
          </button>
        )}
        <div className="safety-chip">
          <ShieldCheck />
          Yolculuğun güvenlik sistemiyle izleniyor
        </div>
      </section>
    </div>
  );
}
