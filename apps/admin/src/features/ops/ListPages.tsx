import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@heytaksi/ui';
import { parseApiJson } from '@heytaksi/ui';

type Row = Record<string, unknown>;
type Column = { key: string; label: string; render?: (row: Row) => string };

async function loadList(fetcher: (path: string, init?: RequestInit) => Promise<Response>, path: string) {
  const response = await fetcher(path);
  const payload = await parseApiJson<{ data?: Row[]; error?: { message?: string }; meta?: { total?: number } }>(response);
  if (!response.ok) throw new Error(payload.error?.message ?? 'Liste yüklenemedi.');
  return { rows: payload.data ?? [], total: payload.meta?.total ?? payload.data?.length ?? 0 };
}

function AdminTable({ title, caption, path, columns, action }: { title: string; caption: string; path: string; columns: Column[]; action?: ((row: Row, reload: () => void) => ReactNode) | undefined }) {
  const { authorizedFetch } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  const reload = () => {
    setError('');
    loadList(authorizedFetch, `${path}?limit=50&q=${encodeURIComponent(query)}`)
      .then((next) => {
        setRows(next.rows);
        setTotal(next.total);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Liste yüklenemedi'));
  };

  useEffect(() => {
    reload();
  }, [authorizedFetch, path]);

  return (
    <>
      <header className="page-head">
        <div>
          <small>HEY TAKSİ YÖNETİM</small>
          <h1>{title}</h1>
          <p>{caption}</p>
        </div>
        <span className="environment">{total} kayıt</span>
      </header>
      <form
        className="admin-search"
        onSubmit={(event) => {
          event.preventDefault();
          reload();
        }}
      >
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ara" />
        <button type="submit">Filtrele</button>
      </form>
      {error && <p className="admin-error">{error}</p>}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
              {action && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.id)}>
                {columns.map((column) => (
                  <td key={column.key}>{column.render ? column.render(row) : String(row[column.key] ?? '—')}</td>
                ))}
                {action && <td>{action(row, reload)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && !error && <p className="admin-empty">Kayıt yok.</p>}
      </div>
    </>
  );
}

const when = (value: unknown) => (value ? new Date(String(value)).toLocaleString('tr-TR') : '—');

export function AdminRidesPage() {
  return (
    <AdminTable
      title="Yolculuklar"
      caption="Platformdaki tüm yolculuk talepleri"
      path="/admin/rides"
      columns={[
        { key: 'status', label: 'Durum' },
        { key: 'passengerName', label: 'Yolcu' },
        { key: 'driverName', label: 'Sürücü' },
        { key: 'pickupAddress', label: 'Alış' },
        { key: 'destinationAddress', label: 'Varış' },
        { key: 'estimatedFare', label: 'Ücret', render: (row) => `₺${Number(row.estimatedFare ?? 0).toFixed(2)}` },
        { key: 'createdAt', label: 'Tarih', render: (row) => when(row.createdAt) },
      ]}
    />
  );
}

export function AdminDriversPage() {
  return (
    <AdminTable
      title="Sürücüler"
      caption="Doğrulama, puan ve araç bilgisi"
      path="/admin/drivers"
      columns={[
        { key: 'firstName', label: 'Ad', render: (row) => `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim() },
        { key: 'email', label: 'E-posta' },
        { key: 'verificationStatus', label: 'Doğrulama' },
        { key: 'availability', label: 'Durum' },
        { key: 'rating', label: 'Puan' },
        { key: 'totalRides', label: 'Yolculuk' },
        { key: 'plate', label: 'Plaka' },
      ]}
    />
  );
}

export function AdminPassengersPage() {
  return (
    <AdminTable
      title="Yolcular"
      caption="Kayıtlı yolcu hesapları ve cüzdan bakiyesi"
      path="/admin/passengers"
      columns={[
        { key: 'firstName', label: 'Ad', render: (row) => `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim() },
        { key: 'email', label: 'E-posta' },
        { key: 'phone', label: 'Telefon' },
        { key: 'walletBalance', label: 'Cüzdan', render: (row) => `₺${Number(row.walletBalance ?? 0).toFixed(2)}` },
        { key: 'rideCount', label: 'Yolculuk' },
        { key: 'status', label: 'Durum' },
      ]}
    />
  );
}

export function AdminVehiclesPage() {
  return (
    <AdminTable
      title="Araçlar"
      caption="Filodaki araçlar ve sürücü eşleşmesi"
      path="/admin/vehicles"
      columns={[
        { key: 'plate', label: 'Plaka' },
        { key: 'brand', label: 'Marka' },
        { key: 'model', label: 'Model' },
        { key: 'vehicleType', label: 'Tip' },
        { key: 'status', label: 'Durum' },
        { key: 'driverName', label: 'Sürücü' },
      ]}
    />
  );
}

export function AdminSupportPage() {
  const { authorizedFetch, user } = useAuth();
  const canManage = user?.permissions?.includes('support:manage') || user?.role === 'admin';
  return (
    <AdminTable
      title="Destek"
      caption="Açık ve kapanmış destek kayıtları"
      path="/admin/support"
      columns={[
        { key: 'status', label: 'Durum' },
        { key: 'subject', label: 'Konu' },
        { key: 'userEmail', label: 'Kullanıcı' },
        { key: 'message', label: 'Mesaj' },
        { key: 'createdAt', label: 'Tarih', render: (row) => when(row.createdAt) },
      ]}
      action={
        canManage
          ? (row, reload) => (
              <select
                defaultValue={String(row.status)}
                onChange={(event) => {
                  void authorizedFetch(`/admin/support/${row.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ status: event.target.value }),
                  }).then(reload);
                }}
              >
                <option value="open">Açık</option>
                <option value="in_progress">İşlemde</option>
                <option value="resolved">Çözüldü</option>
                <option value="closed">Kapalı</option>
              </select>
            )
          : undefined
      }
    />
  );
}
