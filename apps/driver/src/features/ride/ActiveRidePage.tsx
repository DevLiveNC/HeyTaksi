import {
  CheckCircle2,
  Flag,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Play,
  Square,
  Star,
  Timer,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { RideStatus } from "@heytaksi/shared";
import { useDriver } from "../../state/DriverContext";
import { useDriverLocation } from "../../hooks/useDriverLocation";
import { DriverMap } from "../dashboard/DriverMap";
import { RideChatSheet } from "./RideChatSheet";
import { SafeCallSheet } from "./SafeCallSheet";
import { CancelRideSheet } from "./CancelRideSheet";

const FREE_WAIT_SECONDS = 180;

const stepCopy: Record<string, { title: string; caption: string }> = {
  driver_assigned: { title: "Teklif değerlendiriliyor", caption: "Panel üzerinden teklifi yanıtlayebilirsin." },
  driver_arriving: { title: "Yolcuya git", caption: "Alış noktasına doğru ilerle, rota haritada hazır." },
  driver_arrived: { title: "Yolcu bekleniyor", caption: "Yolcu araca bindiğinde yolculuğu başlat." },
  started: { title: "Yolculuk sürüyor", caption: "Varış noktasına güvenle ilerle." },
  in_progress: { title: "Yolculuk sürüyor", caption: "Varış noktasına güvenle ilerle." },
  completed: { title: "Yolculuk tamamlandı", caption: "Özet ve yolcu puanlama hazır." },
  cancelled: { title: "Yolculuk iptal edildi", caption: "Yeni talepler için panele dönebilirsin." },
};

/** Yolculuk akışı: Kabul → Yolcuya git → Varıldı → Başlat → Sürüyor → Tamamla. */
export function ActiveRidePage() {
  const navigate = useNavigate();
  const { ride, busy, error, advance, startRide, dismissRide, markPassengerRated, refreshRide } = useDriver();
  const [sheet, setSheet] = useState<"chat" | "call" | "cancel" | null>(null);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const [stars, setStars] = useState(5);
  const { location } = useDriverLocation(true);
  const status = (ride?.status ?? "driver_assigned") as RideStatus;

  useEffect(() => {
    if (!ride) navigate("/dashboard", { replace: true });
  }, [ride, navigate]);

  // Bekleme süresi: sunucudan gelen değerden itibaren canlı sayar.
  useEffect(() => {
    if (status !== "driver_arrived" || !ride?.arrivedAt) {
      setWaitSeconds(ride?.waitSeconds ?? 0);
      return;
    }
    const arrived = new Date(ride.arrivedAt).getTime();
    const tick = () => setWaitSeconds(Math.max(0, Math.floor((Date.now() - arrived) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [status, ride?.arrivedAt, ride?.waitSeconds, ride?.id]);

  const navigationTarget = useMemo(() => {
    const point = status === "started" || status === "in_progress" ? ride?.destination : ride?.pickup;
    return point ? `https://www.google.com/maps/dir/?api=1&destination=${point.latitude},${point.longitude}&travelmode=driving` : null;
  }, [status, ride]);

  if (!ride) return null;

  const formatWait = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  const steps: Array<{ key: RideStatus | "offer"; label: string }> = [
    { key: "driver_assigned", label: "Kabul" },
    { key: "driver_arriving", label: "Yolcuya git" },
    { key: "driver_arrived", label: "Varıldı" },
    { key: "started", label: "Başlat" },
    { key: "completed", label: "Tamamla" },
  ];
  const activeStepIndex = steps.findIndex((step) => step.key === status);
  const copy = stepCopy[status] ?? stepCopy.driver_assigned!;

  return (
    <div className="ride-page">
      <DriverMap
        driverLocation={location}
        ride={ride}
        navigateTo={status === "started" || status === "in_progress" ? "destination" : "pickup"}
        className="ride-map"
      />
      {status === "completed" || status === "cancelled" ? (
        <section className="ride-sheet">
          <div className={`completion-icon ${status === "cancelled" ? "bad" : ""}`}>
            {status === "cancelled" ? <TriangleAlert /> : <CheckCircle2 />}
          </div>
          <h1>{copy.title}</h1>
          <p>{ride.destinationAddress}</p>
          {status === "completed" && (
            <>
              <section className="fare-summary">
                <div>
                  <small>Tahsil edilen</small>
                  <strong>₺{(ride.finalFare ?? ride.estimatedFare).toFixed(2)}</strong>
                </div>
                <div>
                  <small>Mesafe</small>
                  <strong>{(ride.distanceMeters / 1000).toFixed(1)} km</strong>
                </div>
                <div>
                  <small>Süre</small>
                  <strong>{Math.max(1, Math.round(ride.durationSeconds / 60))} dk</strong>
                </div>
                <div>
                  <small>Bekleme</small>
                  <strong>{formatWait(ride.waitSeconds || 0)}</strong>
                </div>
              </section>
              <div className="rate-box">
                <small>{ride.passengerName ?? "Yolcu"} için puanın</small>
                <div className="star-row" role="radiogroup" aria-label="Yolcu puanı">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      role="radio"
                      aria-checked={stars === value}
                      disabled={ride.passengerRated || busy}
                      className={value <= stars ? "on" : ""}
                      onClick={() => setStars(value)}
                    >
                      <Star size={22} />
                    </button>
                  ))}
                </div>
                {!ride.passengerRated ? (
                  <button className="primary-yellow" disabled={busy} onClick={() => void markPassengerRated(stars)}>
                    Puanı gönder
                  </button>
                ) : (
                  <span className="rated-note">Puanın kaydedildi, teşekkürler.</span>
                )}
              </div>
            </>
          )}
          <button
            className="primary-dark"
            onClick={() => {
              dismissRide();
              void refreshRide();
              navigate("/dashboard");
            }}
          >
            Panele dön
          </button>
        </section>
      ) : (
        <section className="ride-sheet">
          <div className="sheet-grabber" />
          <ol className="flow-steps" aria-label="Yolculuk adımları">
            {steps.map((step, index) => (
              <li key={step.key} className={index <= activeStepIndex ? "done" : ""}>
                <i /> {step.label}
              </li>
            ))}
          </ol>
          <span className="status-eyebrow">CANLI YOLCULUK</span>
          <h1>{copy.title}</h1>
          <p>{copy.caption}</p>

          <section className="passenger-row">
            <span className="passenger-avatar"><UserRound size={20} /></span>
            <span>
              <small>YOLCU</small>
              <strong>{ride.passengerName ?? "Hey Taksi yolcusu"}</strong>
              <em><Star size={12} /> {ride.passengerRating.toFixed(1)}</em>
            </span>
            <button onClick={() => setSheet("call")} aria-label="Güvenli arama"><Phone size={18} /></button>
            <button onClick={() => setSheet("chat")} aria-label="Mesajlaşma"><MessageCircle size={18} /></button>
          </section>

          <div className="route-line-mini">
            <MapPin size={14} />
            <span>{ride.pickupAddress}</span>
          </div>
          <div className="route-line-mini">
            <Flag size={14} />
            <span>{ride.destinationAddress}</span>
          </div>

          {(status === "driver_arriving" || status === "started" || status === "in_progress") && navigationTarget && (
            <a className="nav-launch" href={navigationTarget} target="_blank" rel="noreferrer">
              <Navigation size={18} /> Navigasyonu aç
            </a>
          )}

          {status === "driver_arrived" && (
            <div className={`wait-banner ${waitSeconds > FREE_WAIT_SECONDS ? "overtime" : ""}`}>
              <Timer size={16} />
              <span>
                <strong>{formatWait(waitSeconds)}</strong>
                <small>
                  {waitSeconds > FREE_WAIT_SECONDS
                    ? "Ücretsiz bekleme süresi doldu; süre ücrete yansıyabilir."
                    : `Ücretsiz bekleme ${formatWait(FREE_WAIT_SECONDS - waitSeconds)} sonra dolar.`}
                </small>
              </span>
            </div>
          )}

          {error && <div className="driver-error">{error}</div>}

          <div className="ride-actions">
            {status === "driver_arriving" && (
              <button className="primary-yellow" disabled={busy} onClick={() => void advance("driver_arrived")}>
                <MapPin size={18} /> Konuma vardım
              </button>
            )}
            {status === "driver_arrived" && (
              <button className="primary-yellow" disabled={busy} onClick={() => void startRide()}>
                <Play size={18} /> Yolculuğu başlat
              </button>
            )}
            {(status === "started" || status === "in_progress") && (
              <button className="primary-yellow" disabled={busy} onClick={() => void advance("completed")}>
                <Square size={18} /> Yolculuğu tamamla
              </button>
            )}
            <button className="ghost-danger" disabled={busy} onClick={() => setSheet("cancel")}>
              Yolculuğu iptal et
            </button>
          </div>
        </section>
      )}

      {sheet === "chat" && <RideChatSheet onClose={() => setSheet(null)} />}
      {sheet === "call" && <SafeCallSheet rideId={ride.id} onClose={() => setSheet(null)} />}
      {sheet === "cancel" && <CancelRideSheet onClose={() => setSheet(null)} />}
    </div>
  );
}
