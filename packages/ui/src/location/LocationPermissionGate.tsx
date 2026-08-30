import './location-gate.css';
import { useDeviceLocation } from './DeviceLocationContext';

const copy = {
  passenger: {
    kicker: 'YOLCU',
    title: 'Konum izni gerekli',
    body: 'Yakındaki taksileri göstermek ve alış noktanı doğru belirlemek için konumuna ihtiyacımız var. İzin vermeden yolculuk başlatılamaz.',
  },
  driver: {
    kicker: 'SÜRÜCÜ',
    title: 'Konum izni zorunlu',
    body: 'Çevrim içi olmak, yolculuk teklifi almak ve yolcunun seni haritada görmesi için konum izninin açık olması gerekir.',
  },
} as const;

function PinIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 22s7-7.2 7-12.2A7 7 0 1 0 5 9.8C5 14.8 12 22 12 22Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="12" cy="9.5" r="2.4" fill="currentColor" />
    </svg>
  );
}

export function LocationPermissionGate({ audience }: { audience: 'passenger' | 'driver' }) {
  const { blocked, permission, loading, error, request } = useDeviceLocation();
  if (!blocked) return null;
  const text = copy[audience];
  const denied = permission === 'denied';
  const unsupported = permission === 'unsupported';
  return (
    <div className="ht-location-gate" data-theme={audience === 'driver' ? 'dark' : 'light'} role="dialog" aria-modal="true" aria-labelledby="ht-location-title">
      <section className="ht-location-card">
        <div className="ht-location-icon">
          <PinIcon />
        </div>
        <small>{text.kicker}</small>
        <h2 id="ht-location-title">{text.title}</h2>
        <p>{text.body}</p>
        {denied && (
          <div className="ht-location-steps">
            <strong>İzni tarayıcıdan aç</strong>
            Adres çubuğundaki kilit veya konum simgesine dokun, Konum’u “İzin ver” yap, sonra aşağıdaki düğmeye bas.
          </div>
        )}
        {unsupported && (
          <div className="ht-location-steps">
            <strong>Konum kullanılamıyor</strong>
            Uygulamayı güncel bir tarayıcıda ve HTTPS üzerinden aç. Konum servislerinin cihazda açık olduğundan emin ol.
          </div>
        )}
        {error && permission !== 'denied' && permission !== 'unsupported' && <p className="ht-location-error">{error}</p>}
        <button type="button" disabled={(loading && !denied) || unsupported} onClick={() => void request()}>
          {denied ? 'İzni tekrar dene' : loading ? 'Konum isteniyor…' : 'Konuma izin ver'}
        </button>
      </section>
    </div>
  );
}
