import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Role, UserIdentity } from '@heytaksi/shared';
import { useAuth } from './AuthContext';

type View = 'login' | 'register' | 'phone' | 'otp';
type AuthPageProps = {
  audience: string;
  allowedRole: 'passenger' | 'driver' | 'admin';
  /** Roles that may enter this application. Defaults to the role used for registration. */
  allowedRoles?: Role[];
  /** The first application page to open after a successful sign-in. */
  redirectTo: string;
};

type DemoAccount = {
  role: Role;
  label: string;
  description: string;
  email: string;
  password: string;
  mark: string;
};

/**
 * These accounts are created by `npm run db:seed-all-demo`. Keep the list in one
 * place so every portal can expose the demo accounts it is allowed to accept.
 */
const demoAccounts: DemoAccount[] = [
  {
    role: 'passenger',
    label: 'Yolcu hesabı',
    description: 'Yolculuk talebi ve cüzdanı deneyin',
    email: 'passenger.demo@heytaksi.com',
    password: 'PassengerDemo2026!',
    mark: 'Y',
  },
  {
    role: 'driver',
    label: 'Sürücü hesabı',
    description: 'Teklif, yolculuk ve kazançları deneyin',
    email: 'driver.demo@heytaksi.com',
    password: 'DriverDemo2026!',
    mark: 'S',
  },
  {
    role: 'admin',
    label: 'Yönetici hesabı',
    description: 'Tüm yönetim panelini görüntüleyin',
    email: 'admin.demo@heytaksi.com',
    password: 'AdminDemo2026!',
    mark: 'A',
  },
  {
    role: 'dispatcher',
    label: 'Operasyon hesabı',
    description: 'Canlı dispatch ekranını deneyin',
    email: 'dispatcher.demo@heytaksi.com',
    password: 'DispatcherDemo2026!',
    mark: 'O',
  },
  {
    role: 'support',
    label: 'Destek hesabı',
    description: 'Destek paneli erişimini deneyin',
    email: 'support.demo@heytaksi.com',
    password: 'SupportDemo2026!',
    mark: 'D',
  },
];

export function AuthPage({ audience, allowedRole, allowedRoles, redirectTo }: AuthPageProps) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<View>('login');
  const [error, setError] = useState('');
  const [phone, setPhone] = useState('');
  const [otpPurpose, setOtpPurpose] = useState<'login' | 'register'>('login');
  const [demoLoginRole, setDemoLoginRole] = useState<Role | null>(null);
  // Geliştirme ortamında API `debugCode` döndürür (OTP_EXPOSE_CODE=true); SMS sağlayıcısı
  // olmadığı için kodu ekranda göstermeden telefonla giriş imkânsız oluyordu.
  const [debugCode, setDebugCode] = useState('');
  const permittedRoles = allowedRoles ?? [allowedRole];
  const visibleDemoAccounts = demoAccounts.filter((account) => permittedRoles.includes(account.role));

  const completeSignIn = async (user: UserIdentity) => {
    if (!permittedRoles.includes(user.role)) {
      // A valid account in a different portal used to leave users on the login
      // screen with no explanation. Do not retain that portal's session either.
      await auth.logout();
      throw new Error(`Bu hesap ${audience} uygulamasına erişemez.`);
    }
    navigate(redirectTo, { replace: true });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (view === 'login') await completeSignIn(await auth.emailLogin(String(data.email), String(data.password)));
      if (view === 'register') await completeSignIn(await auth.register({ email: data.email, phone: data.phone || undefined, password: data.password, firstName: data.firstName, lastName: data.lastName, role: allowedRole as Role }));
      if (view === 'phone') {
        const nextPhone = String(data.phone);
        const purpose = String(data.purpose) as 'login' | 'register';
        const result = await auth.requestOtp(nextPhone, purpose);
        setPhone(nextPhone);
        setOtpPurpose(purpose);
        setDebugCode(result.debugCode ?? '');
        setView('otp');
      }
      if (view === 'otp') await completeSignIn(await auth.verifyOtp({ phone, purpose: otpPurpose, code: data.code, firstName: data.firstName || undefined, lastName: data.lastName || undefined, role: allowedRole }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'İşlem tamamlanamadı.');
    }
  };

  const signInDemo = async (account: DemoAccount) => {
    if (auth.loading || demoLoginRole) return;
    setError('');
    setDemoLoginRole(account.role);
    try {
      await completeSignIn(await auth.emailLogin(account.email, account.password));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Demo hesabıyla giriş yapılamadı.');
    } finally {
      setDemoLoginRole(null);
    }
  };

  const isAdmin = allowedRole === 'admin';
  return (
    <div className="auth-page">
      <section className="auth-brand">
        <div className="auth-logo">HT</div>
        <p>HEY TAKSİ</p>
        <h1>{isAdmin ? 'Operasyonu güvenle yönetin.' : 'Şehir seninle hareket etsin.'}</h1>
        <span>{audience} için güvenli ve hızlı erişim.</span>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <small>GÜVENLİ ERİŞİM</small>
          <h2>{view === 'register' ? 'Hesap oluştur' : view === 'otp' ? 'Kodu doğrula' : view === 'phone' ? 'Telefonla devam et' : 'Tekrar hoş geldin'}</h2>
          <p>{view === 'otp' ? `${phone} numarasına gönderilen 6 haneli kodu girin.` : 'Bilgilerinizi girerek devam edin.'}</p>
          <form onSubmit={submit}>
            {view === 'login' && <><label>E-posta<input name="email" type="email" required placeholder="ornek@heytaksi.com" /></label><label>Şifre<input name="password" type="password" required placeholder="••••••••••" /></label></>}
            {view === 'register' && <><div className="field-row"><label>Ad<input name="firstName" required /></label><label>Soyad<input name="lastName" required /></label></div><label>E-posta<input name="email" type="email" required /></label><label>Telefon <em>opsiyonel</em><input name="phone" placeholder="+905551112233" /></label><label>Şifre<input name="password" type="password" required minLength={10} placeholder="En az 10 karakter" /></label></>}
            {view === 'phone' && <><label>Telefon<input name="phone" required defaultValue="+90" /></label><label>İşlem<select name="purpose"><option value="login">Giriş yap</option>{!isAdmin && <option value="register">Yeni hesap oluştur</option>}</select></label></>}
            {view === 'otp' && <>{debugCode && <div className="auth-debug" style={{ background: 'rgba(34,197,94,.12)', border: '1px solid rgba(34,197,94,.4)', color: 'inherit', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>Geliştirme ortamı – SMS yerine kodu aşağıdan okuyabilirsiniz: <strong style={{ letterSpacing: 2, fontVariantNumeric: 'tabular-nums' }}>{debugCode}</strong></div>}<label>Doğrulama kodu<input name="code" inputMode="numeric" maxLength={6} required placeholder="000000" /></label>{otpPurpose === 'register' && <div className="field-row"><label>Ad<input name="firstName" required /></label><label>Soyad<input name="lastName" required /></label></div>}</>}
            {error && <div className="auth-error">{error}</div>}
            <button className="primary-action" disabled={auth.loading || demoLoginRole !== null}>{auth.loading ? 'Kontrol ediliyor…' : 'Devam et →'}</button>
          </form>

          {view === 'login' && visibleDemoAccounts.length > 0 && <section className="demo-login" aria-labelledby="demo-login-title">
            <div className="demo-login-heading">
              <div>
                <strong id="demo-login-title">Demo hesaplarla dene</strong>
                <span>Tek tıkla giriş yapın</span>
              </div>
              <b>TEST</b>
            </div>
            <div className="demo-account-list">
              {visibleDemoAccounts.map((account) => <button
                key={account.role}
                type="button"
                className="demo-account-button"
                aria-label={`${account.label} ile demo giriş yap`}
                disabled={auth.loading || demoLoginRole !== null}
                onClick={() => void signInDemo(account)}
              >
                <i className="demo-account-mark" aria-hidden="true">{account.mark}</i>
                <span className="demo-account-copy"><strong>{account.label}</strong><small>{account.email}</small><em>{account.description}</em></span>
                <span className="demo-account-action">{demoLoginRole === account.role ? 'Giriş…' : 'Dene →'}</span>
              </button>)}
            </div>
            <p className="demo-login-note">Demo hesapları yalnızca test ve sunum içindir.</p>
          </section>}

          <div className="auth-switch">
            {!isAdmin && view === 'login' && <><button type="button" onClick={() => setView('register')}>Hesap oluştur</button><button type="button" onClick={() => setView('phone')}>Telefon / OTP</button></>}
            {view !== 'login' && <button type="button" onClick={() => { setView('login'); setDebugCode(''); }}>E-posta ile girişe dön</button>}
          </div>
        </div>
        <footer>256-bit şifreleme · Güvenli oturum · KVKK</footer>
      </section>
    </div>
  );
}
