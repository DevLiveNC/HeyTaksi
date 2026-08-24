import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { AuthGate, AuthPage, useAuth } from '@heytaksi/ui';
import { DispatchProvider, useDispatch } from '../state/DispatchContext';
import { DispatchPage } from '../features/dispatch/DispatchPage';

const modules = ['Yolculuklar', 'Sürücüler', 'Yolcular', 'Araçlar', 'Destek'];
const slug = (name: string) => '/' + name.toLocaleLowerCase('tr-TR').replace('ı', 'i').replace('ü', 'u');

function Overview() {
  const { counts, drivers, rides, connection } = useDispatch();
  return (
    <>
      <header className="page-head">
        <div>
          <small>HEY TAKSİ · FAZ 6</small>
          <h1>Operasyon merkezi</h1>
          <p>Gerçek zamanlı yolculuk ve sürücü eşleştirme sistemine genel bakış</p>
        </div>
        <span className={`environment live-${connection}`}>
          ● {connection === 'live' ? 'Canlı bağlantı' : connection === 'connecting' ? 'Bağlanıyor…' : 'Bağlantı yok'}
        </span>
      </header>
      <section className="stats">
        <article>
          <small>ÇEVRİM İÇİ SÜRÜCÜ</small>
          <strong>{drivers.length}</strong>
          <span className="green">Redis konum defterinde canlı</span>
        </article>
        <article>
          <small>BEKLEYEN TALEP</small>
          <strong>{counts.searchingRides}</strong>
          <span>dağıtım araması sürüyor</span>
        </article>
        <article>
          <small>AKTİF YOLCULUK</small>
          <strong>{rides.filter((ride) => ride.status !== 'searching').length}</strong>
          <span>devam eden taşıma</span>
        </article>
      </section>
      <section className="module-panel">
        <div>
          <h2>Platform modülleri</h2>
          <p>Yetkiye göre erişilen operasyon alanları</p>
        </div>
        <div className="module-list">
          {['Canlı operasyon', ...modules].map((item, index) => (
            <article key={item}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{item}</strong>
              <em>{index === 0 ? 'Canlı' : 'Yetkili'}</em>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function Placeholder({ name }: { name: string }) {
  return (
    <header className="page-head">
      <div>
        <small>HEY TAKSİ YÖNETİM</small>
        <h1>{name}</h1>
        <p>Bu modülün routing ve yetkilendirme alanı hazır.</p>
      </div>
    </header>
  );
}

function DispatchBadge() {
  const { counts, connection } = useDispatch();
  if (connection !== 'live') return null;
  const waiting = counts.searchingRides;
  return waiting > 0 ? <b className="nav-badge">{waiting}</b> : <i className={`nav-live ${connection}`} />;
}

function AdminPanel() {
  const { user, logout } = useAuth();
  return (
    <div className="admin-shell">
      <aside>
        <div className="admin-brand">
          <b>HT</b>
          <span>
            Hey Taksi<small>Yönetim</small>
          </span>
        </div>
        <nav>
          <NavLink to="/overview">
            ⌂ <span>Genel Bakış</span>
          </NavLink>
          <NavLink to="/canli-operasyon">
            ◉ <span>Canlı operasyon</span>
            <DispatchBadge />
          </NavLink>
          {modules.map((item) => (
            <NavLink key={item} to={slug(item)}>
              □ <span>{item}</span>
            </NavLink>
          ))}
        </nav>
        <button className="profile" onClick={() => void logout()}>
          <i>{(user?.email ?? 'A')[0]?.toUpperCase()}</i>
          <span>
            {user?.email}
            <small>{user?.role} · çıkış</small>
          </span>
        </button>
      </aside>
      <main>
        <Routes>
          <Route path="/overview" element={<Overview />} />
          <Route path="/canli-operasyon" element={<DispatchPage />} />
          {modules.map((item) => (
            <Route key={item} path={slug(item)} element={<Placeholder name={item} />} />
          ))}
          <Route path="*" element={<Navigate to="/canli-operasyon" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export function App() {
  return (
    <AuthGate
      roles={['admin', 'dispatcher', 'support']}
      fallback={<AuthPage audience="Yönetim ekibi" allowedRole="admin" allowedRoles={['admin', 'dispatcher', 'support']} redirectTo="/canli-operasyon" />}
    >
      <DispatchProvider>
        <AdminPanel />
      </DispatchProvider>
    </AuthGate>
  );
}
