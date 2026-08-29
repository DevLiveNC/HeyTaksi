import { ArrowLeft, BellRing, CheckCheck, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@heytaksi/ui";
import type { UserNotification } from "@heytaksi/shared";
import { passengerApi } from "../../services/passengerApi";

export function NotificationsPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [items, setItems] = useState<UserNotification[]>([]);
  const [error, setError] = useState("");

  const load = () =>
    passengerApi.notifications(auth.authorizedFetch).then(setItems);

  useEffect(() => {
    void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Bildirimler yüklenemedi"));
  }, [auth.authorizedFetch]);

  return (
    <div className="sub-page notifications-page">
      <header className="sub-header">
        <button onClick={() => navigate(-1)} aria-label="Geri dön">
          <ArrowLeft />
        </button>
        <div>
          <small>GÜNCELLEMELER</small>
          <h1>Bildirimler</h1>
        </div>
        <button
          onClick={() => void passengerApi.markNotificationsRead(auth.authorizedFetch).then(() => load())}
          aria-label="Tümünü okundu işaretle"
        >
          <CheckCheck />
        </button>
      </header>
      {error && <div className="booking-error">{error}</div>}
      <div className="notification-list">
        {items.map((item, index) => (
          <article className={!item.read ? "unread" : ""} key={item.id}>
            <i>{index === 0 ? <BellRing /> : index === 1 ? <ShieldCheck /> : <Sparkles />}</i>
            <span>
              <strong>{item.title}</strong>
              <p>{item.body}</p>
              <small>{new Date(item.createdAt).toLocaleString("tr-TR")}</small>
            </span>
            {!item.read && <b aria-label="Okunmadı" />}
          </article>
        ))}
        {items.length === 0 && (
          <div className="empty-list">
            <BellRing />
            <h2>Bildirim yok</h2>
            <p>Yolculuk güncellemeleri burada görünür.</p>
          </div>
        )}
      </div>
    </div>
  );
}
