import { Check, Flag, MapPin, Star, Timer, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OFFER_SECONDS, useDriver } from "../../state/DriverContext";

/** Yeni yolculuk isteği: kabul penceresi içinde bilgi kartı + kabul/ret. */
export function RideOfferSheet() {
  const navigate = useNavigate();
  const { ride, offerArrivedAt, offerExpiresAt, acceptOffer, rejectOffer, busy, error } = useDriver();
  const [remaining, setRemaining] = useState(OFFER_SECONDS);

  // Geri sayım sunucunun bildirdiği bitiş zamanına göre yapılır; saat kayması olmaz.
  useEffect(() => {
    if (!ride) return;
    const deadline = offerExpiresAt
      ? new Date(offerExpiresAt).getTime()
      : (offerArrivedAt ?? Date.now()) + OFFER_SECONDS * 1000;
    const tick = () => setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [ride?.id, offerArrivedAt, offerExpiresAt]);

  // Süre dolduğunda sunucu teklifi kapatır; başka sürücü kabul ettiyse kart zaten kapanmıştır.
  if (!ride?.offerId) return null;
  const progress = Math.min(100, (remaining / OFFER_SECONDS) * 100);
  const pickupEta = ride.pickupEtaSeconds ? Math.max(1, Math.round(ride.pickupEtaSeconds / 60)) : null;
  const passengerRating = Number(ride.passengerRating ?? 5);
  const fare = Number(ride.estimatedFare ?? 0);
  const distanceKm = ((ride.pickupDistanceMeters ?? ride.distanceMeters ?? 0) / 1000).toFixed(1);
  const durationMin = Math.max(1, Math.round((ride.durationSeconds ?? 0) / 60));

  async function onAccept() {
    const ok = await acceptOffer();
    if (ok) navigate("/ride");
  }

  return (
    <div className="offer-overlay" role="dialog" aria-modal="true" aria-label="Yeni yolculuk isteği">
      <div className="offer-card">
        <header>
          <span className="offer-badge">YENİ YOLCULUK İSTEĞİ</span>
          <div className="offer-ring" style={{ "--progress": `${progress}%` } as React.CSSProperties}>
            <svg viewBox="0 0 36 36" aria-hidden="true">
              <circle cx="18" cy="18" r="15.5" />
              <circle cx="18" cy="18" r="15.5" />
            </svg>
            <b>{remaining}</b>
          </div>
        </header>
        <div className="offer-passenger">
          <span className="offer-avatar"><UserRound size={18} /></span>
          <span>
            <strong>{ride.passengerName ?? "Hey Taksi yolcusu"}</strong>
            <small>
              <Star size={12} /> {passengerRating.toFixed(1)} yolcu puanı
            </small>
          </span>
          <em>{ride.vehicleType === "standard" ? "Standart" : ride.vehicleType === "comfort" ? "Comfort" : ride.vehicleType === "xl" ? "XL" : "Erişilebilir"}</em>
        </div>
        <div className="offer-route">
          <div>
            <MapPin size={15} />
            <span>
              <small>ALIŞ</small>
              <strong>{ride.pickupAddress}</strong>
            </span>
          </div>
          <div>
            <Flag size={15} />
            <span>
              <small>VARIŞ</small>
              <strong>{ride.destinationAddress}</strong>
            </span>
          </div>
        </div>
        <div className="offer-stats">
          <div>
            <small>{pickupEta ? "Alışa uzaklık" : "Mesafe"}</small>
            <strong>
              {pickupEta
                ? `${pickupEta} dk · ${distanceKm} km`
                : `${((ride.distanceMeters ?? 0) / 1000).toFixed(1)} km`}
            </strong>
          </div>
          <div>
            <small>Tahmini süre</small>
            <strong>{durationMin} dk</strong>
          </div>
          <div className="earn">
            <small>Tahmini kazanç</small>
            <strong>₺{fare.toFixed(2)}</strong>
          </div>
        </div>
        {error && <div className="driver-error">{error}</div>}
        <div className="offer-actions">
          <button type="button" className="reject" onClick={() => void rejectOffer()} disabled={busy}>
            <X size={18} /> Reddet
          </button>
          <button type="button" className="accept" onClick={() => void onAccept()} disabled={busy}>
            <Check size={18} /> {busy ? "Kabul ediliyor…" : "Kabul et"}
          </button>
        </div>
        <p className="offer-note">
          <Timer size={12} /> İlk kabul eden sürücü yolcuyu alır. Süre dolarsa arama genişler.
        </p>
      </div>
    </div>
  );
}
