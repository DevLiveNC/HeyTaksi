import {
  ArrowLeft,
  BellRing,
  CheckCheck,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePassengerExperience } from "../../state/PassengerExperience";
export function NotificationsPage() {
  const navigate = useNavigate();
  const { state, dispatch } = usePassengerExperience();
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
          onClick={() => dispatch({ type: "mark-notifications-read" })}
          aria-label="Tümünü okundu işaretle"
        >
          <CheckCheck />
        </button>
      </header>
      <div className="notification-list">
        {state.notifications.map((item, index) => (
          <article className={!item.read ? "unread" : ""} key={item.id}>
            <i>
              {index === 1 ? (
                <ShieldCheck />
              ) : index === 2 ? (
                <Sparkles />
              ) : (
                <BellRing />
              )}
            </i>
            <span>
              <strong>{item.title}</strong>
              <p>{item.body}</p>
              <small>{item.time}</small>
            </span>
            {!item.read && <b aria-label="Okunmadı" />}
          </article>
        ))}
      </div>
    </div>
  );
}
