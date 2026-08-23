import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useDriver } from "../../state/DriverContext";

const reasons = [
  { code: "passenger_no_show", label: "Yolcu gelmedi" },
  { code: "wrong_location", label: "Alış konumu yanlış/erişilemez" },
  { code: "vehicle_problem", label: "Araç arızası" },
  { code: "unsafe", label: "Güvensiz durum" },
  { code: "other", label: "Diğer" },
] as const;

/** Yolculuk iptali: sürücü nedeni + not ile kayıt altına alınır. */
export function CancelRideSheet({ onClose }: { onClose: () => void }) {
  const { cancelRide, busy, error } = useDriver();
  const [reason, setReason] = useState<string>("passenger_no_show");
  const [note, setNote] = useState("");

  return (
    <div className="sheet-overlay" role="dialog" aria-modal="true" aria-label="Yolculuk iptali">
      <div className="sheet-card cancel">
        <header>
          <TriangleAlert size={18} />
          <strong>Yolculuğu iptal et</strong>
          <button onClick={onClose} aria-label="Kapat">Kapat</button>
        </header>
        <p className="cancel-note">Sık iptal etmek kabul oranını düşürebilir. Yolcuya kısa bir sebep iletilecek.</p>
        <div className="cancel-reasons">
          {reasons.map((item) => (
            <label key={item.code}>
              <input
                type="radio"
                name="cancel-reason"
                value={item.code}
                checked={reason === item.code}
                onChange={() => setReason(item.code)}
              />
              {item.label}
            </label>
          ))}
        </div>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Not (opsiyonel)"
          maxLength={500}
          rows={2}
          aria-label="İptal notu"
        />
        {error && <div className="driver-error">{error}</div>}
        <div className="sheet-actions">
          <button onClick={onClose} disabled={busy}>Vazgeç</button>
          <button
            className="danger"
            disabled={busy}
            onClick={() => void cancelRide(reason, note.trim() || undefined)}
          >
            İptali onayla
          </button>
        </div>
      </div>
    </div>
  );
}
