import {
  BellRing,
  ChevronRight,
  CircleHelp,
  HeartHandshake,
  Languages,
  LockKeyhole,
  LogOut,
  Mail,
  MapPinned,
  Phone,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@heytaksi/ui";
interface Profile {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  profileImage: string | null;
}
const menu = [
  {
    to: "/profile/favorites",
    icon: MapPinned,
    label: "Favori adresler",
    caption: "Ev, iş ve kayıtlı yerler",
  },
  {
    to: "/profile/trusted-contacts",
    icon: HeartHandshake,
    label: "Güvenilir kişiler",
    caption: "Yolculuğunu paylaşacağın kişiler",
  },
  {
    to: "/profile/notifications",
    icon: BellRing,
    label: "Bildirim ayarları",
    caption: "Push, SMS ve e-posta tercihleri",
  },
  { to: "/profile/language", icon: Languages, label: "Dil", caption: "Türkçe" },
  {
    to: "/profile/privacy",
    icon: ShieldCheck,
    label: "Gizlilik",
    caption: "Veri ve izin tercihleri",
  },
  {
    to: "/profile/security",
    icon: LockKeyhole,
    label: "Güvenlik",
    caption: "Oturumlar ve cihazlar",
  },
  {
    to: "/profile/support",
    icon: CircleHelp,
    label: "Destek",
    caption: "Yardım merkezi ve iletişim",
  },
];
export function ProfilePage() {
  const auth = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    let active = true;
    auth
      .authorizedFetch("/users/me")
      .then(async (response) => {
        if (response.ok) {
          const payload = (await response.json()) as { data: Profile };
          if (active) setProfile(payload.data);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  const display = profile
    ? `${profile.firstName} ${profile.lastName}`
    : (auth.user?.email?.split("@")[0] ?? "Hey Taksi Yolcusu");
  return (
    <div className="sub-page profile-page">
      <header className="profile-hero">
        <div className="large-avatar">
          {profile?.profileImage ? (
            <img src={profile.profileImage} alt="" />
          ) : (
            <UserRound />
          )}
          <button aria-label="Profil fotoğrafını değiştir">+</button>
        </div>
        <div>
          <span>YOLCU PROFİLİ</span>
          <h1>{display}</h1>
          <small>
            Doğrulanmış hesap <ShieldCheck />
          </small>
        </div>
      </header>
      <section className="contact-card">
        <div>
          <Mail />
          <span>
            <small>E-posta</small>
            <strong>{profile?.email ?? auth.user?.email ?? "Eklenmedi"}</strong>
          </span>
        </div>
        <div>
          <Phone />
          <span>
            <small>Telefon</small>
            <strong>{profile?.phone ?? auth.user?.phone ?? "Eklenmedi"}</strong>
          </span>
        </div>
      </section>
      <section className="profile-menu" aria-label="Profil ayarları">
        {menu.map(({ to, icon: Icon, label, caption }) => (
          <Link to={to} key={to}>
            <i>
              <Icon />
            </i>
            <span>
              <strong>{label}</strong>
              <small>{caption}</small>
            </span>
            <ChevronRight />
          </Link>
        ))}
      </section>
      <section className="danger-zone">
        <button onClick={() => void auth.logout()}>
          <LogOut />
          <span>
            <strong>Çıkış yap</strong>
            <small>Bu cihazdaki oturumu kapat</small>
          </span>
        </button>
        <button onClick={() => setConfirmDelete(true)}>
          <Trash2 />
          <span>
            <strong>Hesabı sil</strong>
            <small>Hesabını ve verilerini kalıcı sil</small>
          </span>
        </button>
      </section>
      {confirmDelete && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-title"
          >
            <i>
              <Trash2 />
            </i>
            <h2 id="delete-title">Hesabını silmek mi istiyorsun?</h2>
            <p>
              Bu işlem için güvenli hesap silme API'si sonraki fazda bağlanacak.
            </p>
            <button onClick={() => setConfirmDelete(false)}>Vazgeç</button>
            <button disabled>Hesabı kalıcı sil</button>
          </div>
        </div>
      )}
    </div>
  );
}
