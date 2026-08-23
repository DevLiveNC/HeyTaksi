import type {
  DispatchCandidate,
  DispatchOfferView,
  DispatchOverview,
  DispatchStatusView,
} from '@heytaksi/shared';

export type AuthorizedFetch = (path: string, init?: RequestInit) => Promise<Response>;

export async function apiData<T>(fetcher: AuthorizedFetch, path: string, init?: RequestInit): Promise<T> {
  const response = await fetcher(path, init);
  const payload = (await response.json()) as { data?: T; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message ?? 'İşlem tamamlanamadı.');
  return payload.data!;
}

export interface RideDispatchDetail extends DispatchStatusView {
  offers: DispatchOfferView[];
}

export const dispatchApi = {
  /** Canlı sürücü ve yolculuk anlık görüntüsü (WebSocket akışının ilk yüklemesi). */
  live: (fetcher: AuthorizedFetch) => apiData<DispatchOverview>(fetcher, '/dispatch/live'),
  ride: (fetcher: AuthorizedFetch, rideId: string) =>
    apiData<RideDispatchDetail>(fetcher, `/dispatch/rides/${rideId}`),
  candidates: (fetcher: AuthorizedFetch, rideId: string) =>
    apiData<DispatchCandidate[]>(fetcher, `/dispatch/rides/${rideId}/candidates`),
  restart: (fetcher: AuthorizedFetch, rideId: string) =>
    apiData<DispatchStatusView>(fetcher, `/dispatch/rides/${rideId}/restart`, { method: 'POST', body: '{}' }),
};
