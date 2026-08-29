import {
  ArrowLeft,
  ChevronRight,
  CircleHelp,
  Globe2,
  LockKeyhole,
  MapPin,
  Plus,
  Smartphone,
  Trash2,
  UserRound,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@heytaksi/ui";
import { usePassengerExperience } from "../../state/PassengerExperience";
import { passengerApi } from "../../services/passengerApi";
import { ProfileEditForm } from "./ProfilePage";

const titles: Record<string, string> = {
  edit: "Kişisel bilgiler",
  favorites: "Favori adresler",
  "trusted-contacts": "Güvenilir kişiler",
  notifications: "Bildirim ayarları",
  language: "Dil",
  privacy: "Gizlilik",
  security: "Güvenlik",
  support: "Destek",
};

function Toggle({ label, caption, storageKey, initial = true }: { label: string; caption: string; storageKey: string; initial?: boolean }) {
  const [on, setOn] = useState(() => {
    const stored = localStorage.getItem(storageKey);
    return stored == null ? initial : stored === "true";
  });
  return (
    <button
      className="setting-row"
      role="switch"
      aria-checked={on}
      onClick={() => {
        const next = !on;
        setOn(next);
        localStorage.setItem(storageKey, String(next));
      }}
    >
      <span>
        <strong>{label}</strong>
        <small>{caption}</small>
      </span>
      <i className={`switch ${on ? "on" : ""}`}>
        <b />
      </i>
    </button>
  );
}

export function ProfileSettingsPage() {
  const { section = "" } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const { addresses, dispatch } = usePassengerExperience();
  const title = titles[section] ?? "Profil ayarı";
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [sessions, setSessions] = useState<Array<{ id: string; deviceName: string; lastUsedAt: string }>>([]);
  const [profile, setProfile] = useState<{ firstName: string; lastName: string; email: string | null; phone: string | null; profileImage: string | null } | null>(null);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketMessage, setTicketMessage] = useState("");
  const [ticketNote, setTicketNote] = useState("");

  useEffect(() => {
    if (section === "edit") void passengerApi.profile(auth.authorizedFetch).then(setProfile).catch(() => undefined);
    if (section === "security") {
      void passengerApi.sessions(auth.authorizedFetch).then((items) => setSessions(items)).catch(() => undefined);
    }
  }, [auth.authorizedFetch, section]);

  const addAddress = (event: FormEvent) => {
    event.preventDefault();
    if (!label.trim() || !address.trim()) return;
    dispatch({
      type: "save-address",
      address: { id: crypto.randomUUID(), label: label.trim(), address: address.trim(), type: "favorite" },
    });
    setLabel("");
    setAddress("");
  };

  const sendTicket = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await passengerApi.createTicket(auth.authorizedFetch, { subject: ticketSubject, message: ticketMessage });
      setTicketNote("Destek kaydın açıldı.");
      setTicketSubject("");
      setTicketMessage("");
    } catch (cause) {
      setTicketNote(cause instanceof Error ? cause.message : "Kayıt açılamadı");
    }
  };

  return (
    <div className="sub-page settings-page">
      <header className="sub-header">
        <button onClick={() => navigate(-1)} aria-label="Geri dön">
          <ArrowLeft />
        </button>
        <div>
          <small>PROFİL AYARLARI</small>
          <h1>{title}</h1>
        </div>
      </header>
      {section === "edit" && (profile ? <ProfileEditForm key={profile.firstName} initial={profile} /> : <p className="empty-hint">Profil yükleniyor…</p>)}
      {section === "favorites" && (
        <section className="settings-card">
          {addresses.map((item) => (
            <div className="address-setting" key={item.id}>
              <i>
                <MapPin />
              </i>
              <span>
                <strong>{item.label}</strong>
                <small>{item.address}</small>
              </span>
              <button onClick={() => dispatch({ type: "remove-address", id: item.id })} aria-label={`${item.label} adresini sil`}>
                <Trash2 />
              </button>
            </div>
          ))}
          <form className="wallet-form nested" onSubmit={addAddress}>
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Etiket (Ev, İş…)" required />
            <input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Adres" required />
            <button className="add-row" type="submit">
              <Plus />
              Yeni adres ekle
            </button>
          </form>
        </section>
      )}
      {section === "trusted-contacts" && (
        <section className="settings-card">
          <div className="address-setting">
            <i>
              <UserRound />
            </i>
            <span>
              <strong>Güvenilir kişi ekle</strong>
              <small>Bu cihazdaki acil iletişim notu</small>
            </span>
            <ChevronRight />
          </div>
          <p className="empty-hint">Kişiler bu cihazda tutulur; sonraki fazda hesaba bağlanır.</p>
        </section>
      )}
      {section === "notifications" && (
        <section className="settings-card">
          <Toggle storageKey="heytaksi.notify.rides" label="Yolculuk bildirimleri" caption="Sürücü, varış ve güvenlik güncellemeleri" />
          <Toggle storageKey="heytaksi.notify.promo" label="Kampanyalar" caption="Fırsatlar ve Hey Taksi haberleri" initial={false} />
          <Toggle storageKey="heytaksi.notify.sms" label="SMS bildirimleri" caption="Kritik durumlarda SMS al" />
        </section>
      )}
      {section === "language" && (
        <section className="settings-card">
          <button className="choice-row active">
            <span>🇹🇷</span>
            <strong>Türkçe</strong>
            <i>✓</i>
          </button>
          <button className="choice-row">
            <span>🇬🇧</span>
            <strong>English</strong>
          </button>
        </section>
      )}
      {section === "privacy" && (
        <section className="settings-card">
          <Toggle storageKey="heytaksi.privacy.location" label="Konum izni" caption="Yalnızca uygulamayı kullanırken" />
          <Toggle storageKey="heytaksi.privacy.analytics" label="Analitik paylaşımı" caption="Deneyimi iyileştirmemize yardımcı ol" initial={false} />
        </section>
      )}
      {section === "security" && (
        <section className="settings-card">
          <div className="security-banner">
            <LockKeyhole />
            <span>
              <strong>Hesabın korunuyor</strong>
              <small>{sessions.length} aktif oturum</small>
            </span>
          </div>
          {sessions.map((session) => (
            <div className="setting-row" key={session.id}>
              <span>
                <strong>{session.deviceName}</strong>
                <small>{new Date(session.lastUsedAt).toLocaleString("tr-TR")}</small>
              </span>
              <Smartphone />
            </div>
          ))}
        </section>
      )}
      {section === "support" && (
        <section className="settings-card">
          <div className="security-banner">
            <CircleHelp />
            <span>
              <strong>Nasıl yardımcı olabiliriz?</strong>
              <small>Destek ekibimiz 7/24 yanında.</small>
            </span>
          </div>
          <form className="wallet-form nested" onSubmit={(event) => void sendTicket(event)}>
            <input value={ticketSubject} onChange={(event) => setTicketSubject(event.target.value)} placeholder="Konu" required minLength={4} />
            <textarea value={ticketMessage} onChange={(event) => setTicketMessage(event.target.value)} placeholder="Mesajın" required minLength={8} rows={4} />
            <button className="request-primary">Destek kaydı aç</button>
            {ticketNote && <p className="empty-hint">{ticketNote}</p>}
          </form>
        </section>
      )}
      {!titles[section] && (
        <section className="empty-list">
          <Globe2 />
          <h2>Ayar bulunamadı</h2>
        </section>
      )}
    </div>
  );
}
