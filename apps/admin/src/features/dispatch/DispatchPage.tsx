import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@heytaksi/ui';
import type { DispatchCandidate, LiveDriverMarker } from '@heytaksi/shared';
import { useDispatch } from '../../state/DispatchContext';
import { dispatchApi, type RideDispatchDetail } from '../../services/dispatchApi';
import { LiveMap } from './LiveMap';

const availabilityLabel: Record<string, string> = {
  available: 'Müsait',
  online: 'Çevrim içi',
  on_trip: 'Yolculukta',
  paused: 'Molada',
  offline: 'Çevrim dışı',
};
const rideStatusLabel: Record<string, string> = {
  searching: 'Sürücü aranıyor',
  driver_assigned: 'Sürücü atandı',
  driver_arriving: 'Sürücü yolda',
  driver_arrived: 'Sürücü noktada',
  started: 'Başladı',
  in_progress: 'Devam ediyor',
};
const offerStatusLabel: Record<string, string> = {
  pending: 'Bekliyor',
  accepted: 'Kabul',
  rejected: 'Red',
  expired: 'Zaman aşımı',
  cancelled: 'İptal',
};

const minutes = (seconds: number) => `${Math.max(1, Math.round(seconds / 60))} dk`;
const clock = (value: string | null) =>
  value ? new Date(value).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
const wait = (seconds: number) =>
  seconds >= 60 ? `${Math.floor(seconds / 60)} dk ${seconds % 60} sn` : `${seconds} sn`;

/** Faz 6 operasyon merkezi: canlı sürücü haritası ve dağıtım izleme. */
export function DispatchPage() {
  const { authorizedFetch, user } = useAuth();
  const {
    drivers,
    rides,
    counts,
    connection,
    updatedAt,
    selectedRideId,
    selectedDriverId,
    error,
    selectRide,
    selectDriver,
  } = useDispatch();
  const [detail, setDetail] = useState<RideDispatchDetail | null>(null);
  const [candidates, setCandidates] = useState<DispatchCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const canManage = user?.permissions?.includes('dispatch:manage') ?? false;

  const selectedDriver = useMemo<LiveDriverMarker | null>(
    () => drivers.find((driver) => driver.driverId === selectedDriverId) ?? null,
    [drivers, selectedDriverId],
  );
  const selectedRide = useMemo(
    () => rides.find((ride) => ride.rideId === selectedRideId) ?? null,
    [rides, selectedRideId],
  );

  // Seçili yolculuğun dağıtım detayını canlı tut.
  useEffect(() => {
    if (!selectedRideId) {
      setDetail(null);
      setCandidates([]);
      return;
    }
    let active = true;
    const load = async () => {
      try {
        const [next, ranked] = await Promise.all([
          dispatchApi.ride(authorizedFetch, selectedRideId),
          dispatchApi.candidates(authorizedFetch, selectedRideId).catch(() => []),
        ]);
        if (!active) return;
        setDetail(next);
        setCandidates(ranked);
        setActionError(null);
      } catch (cause) {
        if (active) setActionError(cause instanceof Error ? cause.message : 'Dağıtım detayı alınamadı.');
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 2_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [selectedRideId, authorizedFetch]);

  const restart = async () => {
    if (!selectedRideId) return;
    setBusy(true);
    setActionError(null);
    try {
      await dispatchApi.restart(authorizedFetch, selectedRideId);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Arama yeniden başlatılamadı.');
    } finally {
      setBusy(false);
    }
  };

  const searching = rides.filter((ride) => ride.status === 'searching');
  const ongoing = rides.filter((ride) => ride.status !== 'searching');

  return (
    <div className="dispatch-page">
      <header className="page-head">
        <div>
          <small>HEY TAKSİ · FAZ 6</small>
          <h1>Canlı operasyon</h1>
          <p>Gerçek zamanlı sürücü konumları ve deterministik dağıtım izleme</p>
        </div>
        <span className={`environment live-${connection}`}>
          ● {connection === 'live' ? 'Canlı bağlantı' : connection === 'connecting' ? 'Bağlanıyor…' : 'Bağlantı yok'}
          <em>{clock(updatedAt)}</em>
        </span>
      </header>

      {error && <div className="dispatch-alert">{error}</div>}

      <section className="live-stats">
        <article>
          <small>MÜSAİT</small>
          <strong>{counts.available + counts.online}</strong>
          <span className="green">dağıtıma açık sürücü</span>
        </article>
        <article>
          <small>YOLCULUKTA</small>
          <strong>{counts.onTrip}</strong>
          <span>aktif taşıma</span>
        </article>
        <article>
          <small>MOLADA</small>
          <strong>{counts.paused}</strong>
          <span>geçici olarak kapalı</span>
        </article>
        <article className={searching.length ? 'urgent' : ''}>
          <small>SÜRÜCÜ ARANIYOR</small>
          <strong>{searching.length}</strong>
          <span>bekleyen talep</span>
        </article>
        <article>
          <small>AKTİF YOLCULUK</small>
          <strong>{ongoing.length}</strong>
          <span>devam eden</span>
        </article>
      </section>

      <section className="dispatch-grid">
        <div className="map-panel">
          <LiveMap
            drivers={drivers}
            rides={rides}
            selectedRideId={selectedRideId}
            selectedDriverId={selectedDriverId}
            onSelectDriver={selectDriver}
            onSelectRide={selectRide}
          />
          <div className="map-legend">
            {(['available', 'online', 'on_trip', 'paused'] as const).map((state) => (
              <span key={state}>
                <i className={`dot ${state}`} />
                {availabilityLabel[state]}
              </span>
            ))}
            <span>
              <i className="dot searching" />
              Sürücü aranıyor
            </span>
          </div>
        </div>

        <aside className="dispatch-side">
          {selectedRide || detail ? (
            <div className="side-card">
              <button className="side-back" onClick={() => selectRide(null)}>
                ← Listeye dön
              </button>
              <h2>{selectedRide ? rideStatusLabel[selectedRide.status] ?? selectedRide.status : 'Yolculuk'}</h2>
              {selectedRide && (
                <>
                  <p className="side-route">
                    <b>{selectedRide.pickup.address}</b>
                    <em>→ {selectedRide.destination.address}</em>
                  </p>
                  <dl className="side-facts">
                    <div>
                      <dt>Yolcu</dt>
                      <dd>{selectedRide.passengerName ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Sürücü</dt>
                      <dd>{selectedRide.driverName ?? 'atanmadı'}</dd>
                    </div>
                    <div>
                      <dt>Bekleme</dt>
                      <dd>{wait(selectedRide.waitingSeconds)}</dd>
                    </div>
                    <div>
                      <dt>Araç tipi</dt>
                      <dd>{selectedRide.vehicleType}</dd>
                    </div>
                  </dl>
                </>
              )}
              {detail && (
                <>
                  <div className="dispatch-state">
                    <span className={`chip ${detail.status}`}>{detail.status}</span>
                    <span>tur {detail.round + 1}</span>
                    <span>{(detail.radiusMeters / 1000).toFixed(0)} km yarıçap</span>
                    <span>{detail.offersSent} teklif</span>
                  </div>
                  {detail.pendingOffers > 0 && (
                    <div className="current-offer">
                      <small>EŞZAMANLI YAYIN · İLK KABUL EDEN ALIR</small>
                      <strong>{detail.pendingOffers} sürücüye bildirildi</strong>
                      {detail.currentOffer && (
                        <span>
                          en yakın {minutes(detail.currentOffer.etaSeconds)} · {(detail.currentOffer.distanceMeters / 1000).toFixed(1)} km
                          · son {clock(detail.currentOffer.expiresAt)}
                        </span>
                      )}
                    </div>
                  )}
                  {candidates.length > 0 && (
                    <>
                      <h3>Sıralama (deterministik skor)</h3>
                      <table className="rank-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Sürücü</th>
                            <th>Skor</th>
                            <th>ETA</th>
                            <th>Mesafe</th>
                          </tr>
                        </thead>
                        <tbody>
                          {candidates.slice(0, 6).map((candidate) => (
                            <tr key={candidate.driverId}>
                              <td>{candidate.rank}</td>
                              <td>
                                {candidate.driverName}
                                <em>
                                  ★{candidate.rating} · kabul %{candidate.acceptanceRate} · iptal %
                                  {candidate.cancellationRate}
                                </em>
                              </td>
                              <td>
                                <b>{candidate.score}</b>
                              </td>
                              <td>{minutes(candidate.etaSeconds)}</td>
                              <td>{(candidate.distanceMeters / 1000).toFixed(1)} km</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                  {detail.offers.length > 0 && (
                    <>
                      <h3>Teklif geçmişi</h3>
                      <ul className="offer-log">
                        {detail.offers.map((offer) => (
                          <li key={offer.id}>
                            <span className={`badge ${offer.status}`}>{offerStatusLabel[offer.status]}</span>
                            <b>{offer.driverName}</b>
                            <em>
                              skor {offer.score} · {minutes(offer.etaSeconds)} · {clock(offer.offeredAt)}
                            </em>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {canManage && detail.status !== 'assigned' && (
                    <button className="restart-action" onClick={() => void restart()} disabled={busy}>
                      {busy ? 'Yeniden başlatılıyor…' : 'Aramayı yeniden başlat'}
                    </button>
                  )}
                  {actionError && <div className="dispatch-alert">{actionError}</div>}
                </>
              )}
            </div>
          ) : selectedDriver ? (
            <div className="side-card">
              <button className="side-back" onClick={() => selectDriver(null)}>
                ← Listeye dön
              </button>
              <h2>{selectedDriver.driverName}</h2>
              <p className="side-route">
                <b>{selectedDriver.plate ?? 'plaka yok'}</b>
                <em>{availabilityLabel[selectedDriver.availability]}</em>
              </p>
              <dl className="side-facts">
                <div>
                  <dt>Puan</dt>
                  <dd>★ {selectedDriver.rating}</dd>
                </div>
                <div>
                  <dt>Araç tipi</dt>
                  <dd>{selectedDriver.vehicleType ?? '—'}</dd>
                </div>
                <div>
                  <dt>Hız</dt>
                  <dd>
                    {selectedDriver.speedMps != null ? `${Math.round(selectedDriver.speedMps * 3.6)} km/sa` : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Sinyal</dt>
                  <dd>{selectedDriver.ageSeconds} sn önce</dd>
                </div>
                <div>
                  <dt>Konum</dt>
                  <dd>
                    {selectedDriver.latitude.toFixed(5)}, {selectedDriver.longitude.toFixed(5)}
                  </dd>
                </div>
                <div>
                  <dt>Yolculuk</dt>
                  <dd>{selectedDriver.rideId ? selectedDriver.rideId.slice(0, 8) : '—'}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="side-card">
              <h2>Bekleyen talepler</h2>
              {searching.length === 0 && <p className="side-empty">Şu anda sürücü arayan talep yok.</p>}
              <ul className="ride-list">
                {searching.map((ride) => (
                  <li key={ride.rideId}>
                    <button onClick={() => selectRide(ride.rideId)}>
                      <span className="pulse" />
                      <span className="ride-copy">
                        <b>{ride.pickup.address}</b>
                        <em>{ride.destination.address}</em>
                      </span>
                      <span className="ride-wait">{wait(ride.waitingSeconds)}</span>
                    </button>
                  </li>
                ))}
              </ul>

              <h2>Aktif yolculuklar</h2>
              {ongoing.length === 0 && <p className="side-empty">Devam eden yolculuk yok.</p>}
              <ul className="ride-list">
                {ongoing.map((ride) => (
                  <li key={ride.rideId}>
                    <button onClick={() => selectRide(ride.rideId)}>
                      <span className={`status-dot ${ride.status}`} />
                      <span className="ride-copy">
                        <b>{ride.driverName ?? 'Sürücü'}</b>
                        <em>{rideStatusLabel[ride.status] ?? ride.status}</em>
                      </span>
                      <span className="ride-wait">{ride.vehicleType}</span>
                    </button>
                  </li>
                ))}
              </ul>

              <h2>Çevrim içi sürücüler ({drivers.length})</h2>
              <ul className="driver-list">
                {drivers.slice(0, 40).map((driver) => (
                  <li key={driver.driverId}>
                    <button onClick={() => selectDriver(driver.driverId)}>
                      <i className={`dot ${driver.availability}`} />
                      <span className="ride-copy">
                        <b>{driver.driverName}</b>
                        <em>
                          {driver.plate ?? '—'} · ★{driver.rating}
                        </em>
                      </span>
                      <span className="ride-wait">{driver.ageSeconds}s</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
