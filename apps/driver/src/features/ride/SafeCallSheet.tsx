import { Phone, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { RideContact } from "@heytaksi/shared";
import { useAuth } from "@heytaksi/ui";
import { driverApi } from "../../services/driverApi";

/** Güvenli arama: numara maskeli gösterilir, arama tek tuşla başlatılır. */
export function SafeCallSheet({ rideId, onClose }: { rideId: string; onClose: () => void }) {
  const { authorizedFetch } = useAuth();
  const [contact, setContact] = useState<RideContact | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    driverApi
      .contact(authorizedFetch, rideId)
      .then(setContact)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "İletişim bilgisi alınamadı."));
  }, [rideId, authorizedFetch]);

  return (
    <div className="sheet-overlay" role="dialog" aria-modal="true" aria-label="Güvenli arama">
      <div className="sheet-card call">
        <header>
          <Phone size={18} />
          <strong>Güvenli arama</strong>
          <button onClick={onClose} aria-label="Kapat">Kapat</button>
        </header>
        {error && <div className="driver-error">{error}</div>}
        {contact ? (
          <>
            <div className="call-number">
              <small>Yolcu numarası (maskeli)</small>
              <strong>{contact.maskedPhone ?? "Numara paylaşılmadı"}</strong>
            </div>
            {contact.dialPhone ? (
              <a className="call-action" href={`tel:${contact.dialPhone}`}>
                <Phone size={20} /> Numarayı ara
              </a>
            ) : (
              <p className="call-missing">Yolcu telefon numarası eklemedi; mesajlaşmayı kullanabilirsin.</p>
            )}
            <ul className="call-safety">
              {contact.safetyNotes.map((note) => (
                <li key={note}>
                  <ShieldCheck size={14} /> {note}
                </li>
              ))}
            </ul>
          </>
        ) : (
          !error && <p className="chat-empty">İletişim bilgisi hazırlanıyor…</p>
        )}
      </div>
    </div>
  );
}
