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
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { usePassengerExperience } from "../../state/PassengerExperience";
const titles: Record<string, string> = {
  favorites: "Favori adresler",
  "trusted-contacts": "Güvenilir kişiler",
  notifications: "Bildirim ayarları",
  language: "Dil",
  privacy: "Gizlilik",
  security: "Güvenlik",
  support: "Destek",
};
function Toggle({
  label,
  caption,
  initial = true,
}: {
  label: string;
  caption: string;
  initial?: boolean;
}) {
  const [on, setOn] = useState(initial);
  return (
    <button
      className="setting-row"
      role="switch"
      aria-checked={on}
      onClick={() => setOn(!on)}
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
  const { state, dispatch } = usePassengerExperience();
  const title = titles[section] ?? "Profil ayarı";
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
      {section === "favorites" && (
        <section className="settings-card">
          {state.addresses.map((address) => (
            <div className="address-setting" key={address.id}>
              <i>
                <MapPin />
              </i>
              <span>
                <strong>{address.label}</strong>
                <small>{address.address}</small>
              </span>
              <button
                onClick={() =>
                  dispatch({ type: "remove-address", id: address.id })
                }
                aria-label={`${address.label} adresini sil`}
              >
                <Trash2 />
              </button>
            </div>
          ))}
          <button className="add-row">
            <Plus />
            Yeni adres ekle
          </button>
        </section>
      )}
      {section === "trusted-contacts" && (
        <section className="settings-card">
          <div className="address-setting">
            <i>
              <UserRound />
            </i>
            <span>
              <strong>Ayşe Yılmaz</strong>
              <small>+90 ••• ••• 42 18 · Aile</small>
            </span>
            <ChevronRight />
          </div>
          <button className="add-row">
            <Plus />
            Güvenilir kişi ekle
          </button>
        </section>
      )}
      {section === "notifications" && (
        <section className="settings-card">
          <Toggle
            label="Yolculuk bildirimleri"
            caption="Sürücü, varış ve güvenlik güncellemeleri"
          />
          <Toggle
            label="Kampanyalar"
            caption="Fırsatlar ve Hey Taksi haberleri"
            initial={false}
          />
          <Toggle label="SMS bildirimleri" caption="Kritik durumlarda SMS al" />
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
          <Toggle
            label="Konum izni"
            caption="Yalnızca uygulamayı kullanırken"
          />
          <Toggle
            label="Analitik paylaşımı"
            caption="Deneyimi iyileştirmemize yardımcı ol"
            initial={false}
          />
          <button className="setting-row">
            <span>
              <strong>Gizlilik politikası</strong>
              <small>Verilerini nasıl koruduğumuzu gör</small>
            </span>
            <ChevronRight />
          </button>
        </section>
      )}
      {section === "security" && (
        <section className="settings-card">
          <div className="security-banner">
            <LockKeyhole />
            <span>
              <strong>Hesabın korunuyor</strong>
              <small>Son kontrol bugün yapıldı.</small>
            </span>
          </div>
          <button className="setting-row">
            <span>
              <strong>Aktif oturumlar</strong>
              <small>1 web cihazı</small>
            </span>
            <Smartphone />
          </button>
          <button className="setting-row">
            <span>
              <strong>Şifreyi değiştir</strong>
              <small>En son 30 gün önce</small>
            </span>
            <ChevronRight />
          </button>
          <Toggle
            label="Biyometrik giriş"
            caption="Desteklenen cihazlarda hızlı giriş"
            initial={false}
          />
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
          {[
            "Sık sorulan sorular",
            "Bir yolculukla ilgili yardım",
            "Güvenlik merkezi",
            "Bize ulaşın",
          ].map((item) => (
            <button className="setting-row" key={item}>
              <strong>{item}</strong>
              <ChevronRight />
            </button>
          ))}
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
