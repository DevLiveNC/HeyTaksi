import { useDeviceLocation } from './DeviceLocationContext';

export function LocationPermissionToggle({
  label = 'Konum izni',
  caption = 'Yalnızca uygulamayı kullanırken',
}: {
  label?: string;
  caption?: string;
}) {
  const { permission, loading, request } = useDeviceLocation();
  const on = permission === 'granted';
  return (
    <button
      className="setting-row"
      type="button"
      role="switch"
      aria-checked={on}
      disabled={loading || permission === 'unsupported'}
      onClick={() => {
        void request();
      }}
    >
      <span>
        <strong>{label}</strong>
        <small>
          {permission === 'denied'
            ? 'Tarayıcıda kapalı — izin vermek için dokun'
            : permission === 'unsupported'
              ? 'Bu tarayıcıda kullanılamıyor'
              : on
                ? 'Açık — gerçek konumun kullanılıyor'
                : caption}
        </small>
      </span>
      <i className={`switch ${on ? 'on' : ''}`}>
        <b />
      </i>
    </button>
  );
}
