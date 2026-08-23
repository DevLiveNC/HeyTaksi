import { ArrowDownUp, CircleDollarSign, Clock3, Route, Star } from "lucide-react";
import { useEffect, useState } from "react";
import type { DriverEarnings } from "@heytaksi/shared";
import { useAuth } from "@heytaksi/ui";
import { driverApi } from "../../services/driverApi";
import { useDriver } from "../../state/DriverContext";

const periods = [
  { key: "day", label: "Günlük" },
  { key: "week", label: "Haftalık" },
  { key: "month", label: "Aylık" },
] as const;

type PeriodKey = (typeof periods)[number]["key"];

/** Kazanç ekranı: günlük/haftalık/aylık özet + yolculuk bazlı döküm. Ödeme çekme sonraki faza. */
export function EarningsPage() {
  const { authorizedFetch } = useAuth();
  const { dashboard } = useDriver();
  const [period, setPeriod] = useState<PeriodKey>("day");
  const [earnings, setEarnings] = useState<DriverEarnings | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    driverApi
      .earnings(authorizedFetch, period)
      .then(setEarnings)
      .catch(() => setEarnings(null))
      .finally(() => setLoading(false));
  }, [period, authorizedFetch]);

  return (
    <div className="earnings-page">
      <section className="earnings-hero">
        <small>{periods.find((item) => item.key === period)?.label?.toUpperCase()} KAZANÇ</small>
        <h1>₺{(earnings?.total ?? dashboard?.todayEarnings ?? 0).toFixed(2)}</h1>
        <span>
          {earnings?.tripCount ?? 0} yolculuk · ort. ₺{(earnings?.averageFare ?? 0).toFixed(2)} · en yüksek ₺
          {(earnings?.bestFare ?? 0).toFixed(2)}
        </span>
        <div className="period-tabs" role="tablist" aria-label="Kazanç dönemi">
          {periods.map((item) => (
            <button
              key={item.key}
              role="tab"
              aria-selected={period === item.key}
              className={period === item.key ? "on" : ""}
              onClick={() => setPeriod(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <div className="earn-metrics">
        <article>
          <Route size={15} />
          <small>Çevrim içi</small>
          <strong>{Math.floor((earnings?.onlineMinutes ?? 0) / 60)} sa {(earnings?.onlineMinutes ?? 0) % 60} dk</strong>
        </article>
        <article>
          <CircleDollarSign size={15} />
          <small>Ortalama/yolculuk</small>
          <strong>₺{(earnings?.averageFare ?? 0).toFixed(2)}</strong>
        </article>
        <article>
          <Star size={15} />
          <small>Puanın</small>
          <strong>{(dashboard?.rating ?? 0).toFixed(2)}</strong>
        </article>
      </div>

      <section aria-labelledby="per-ride-title" className="per-ride">
        <div className="section-heading">
          <div>
            <span>DÖKÜM</span>
            <h2 id="per-ride-title">Yolculuk bazlı kazanç</h2>
          </div>
        </div>
        {loading && <p className="hotspot-empty">Yükleniyor…</p>}
        {!loading && !earnings?.rides.length && (
          <p className="hotspot-empty">Bu dönemde tamamlanmış yolculuk yok.</p>
        )}
        <ul className="earn-list">
          {earnings?.rides.map((item) => (
            <li key={item.id}>
              <div className="earn-route">
                <strong>{item.pickupAddress.split(",")[0]} → {item.destinationAddress.split(",")[0]}</strong>
                <small>
                  {new Date(item.completedAt).toLocaleString("tr-TR", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · {(item.distanceMeters / 1000).toFixed(1)} km · {Math.max(1, Math.round(item.durationSeconds / 60))} dk
                  {item.waitSeconds > 0 && ` · bekleme ${Math.round(item.waitSeconds / 60)} dk`}
                </small>
              </div>
              <div className="earn-amount">
                <strong>₺{item.fare.toFixed(2)}</strong>
                {item.stars != null && (
                  <small>
                    <Star size={11} /> {item.stars}
                  </small>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="payout-note">
        <ArrowDownUp size={14} />
        <span>
          <strong>Ödeme çekme yakında.</strong>
          <small>Bu fazda kazançlar kayıt altında; bakiye çekme sonraki fazda açılacak.</small>
        </span>
      </div>
      <p className="earn-caption">
        <Clock3 size={12} /> Çevrim içi süre, uygulama açıkken gönderilen konum sinyallerinden tahmin edilir.
      </p>
    </div>
  );
}
