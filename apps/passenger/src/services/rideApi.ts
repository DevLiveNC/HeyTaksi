import { parseApiJson } from "@heytaksi/ui";
import type {
  Coordinate,
  CreateRideInput,
  DispatchStatusView,
  MapsClientConfig,
  RideHistoryFilter,
  RideHistoryItem,
  RouteEstimate,
} from "@heytaksi/shared";
export interface SearchResult extends Coordinate {
  id: string;
  type: string;
}
export async function apiData<T>(
  authorizedFetch: (path: string, init?: RequestInit) => Promise<Response>,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await authorizedFetch(path, init);
  const payload = await parseApiJson<{
    data?: T;
    error?: { message?: string };
  }>(response);
  if (!response.ok)
    throw new Error(payload.error?.message ?? "İşlem tamamlanamadı.");
  return payload.data as T;
}
export const locationApi = {
  search: (
    fetcher: Parameters<typeof apiData>[0],
    query: string,
    near?: { latitude: number; longitude: number } | null,
  ) => {
    const params = new URLSearchParams({ q: query });
    if (near) {
      params.set("latitude", String(near.latitude));
      params.set("longitude", String(near.longitude));
    }
    return apiData<SearchResult[]>(fetcher, `/locations/search?${params.toString()}`);
  },
  reverse: (
    fetcher: Parameters<typeof apiData>[0],
    point: { latitude: number; longitude: number },
  ) =>
    apiData<Coordinate>(
      fetcher,
      `/locations/reverse?latitude=${point.latitude}&longitude=${point.longitude}`,
    ),
  route: (
    fetcher: Parameters<typeof apiData>[0],
    pickup: Coordinate,
    destination: Coordinate,
  ) =>
    apiData<RouteEstimate>(fetcher, "/locations/route", {
      method: "POST",
      body: JSON.stringify({ pickup, destination }),
    }),
  mapsConfig: (fetcher: Parameters<typeof apiData>[0]) =>
    apiData<MapsClientConfig>(fetcher, "/locations/maps-config"),
};
export const rideApi = {
  create: (fetcher: Parameters<typeof apiData>[0], input: CreateRideInput) =>
    apiData<RideHistoryItem>(fetcher, "/rides", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  list: (
    fetcher: Parameters<typeof apiData>[0],
    query: { status?: RideHistoryFilter; limit?: number; page?: number } = {},
  ) =>
    apiData<RideHistoryItem[]>(
      fetcher,
      `/rides?status=${query.status ?? "all"}&limit=${query.limit ?? 20}&page=${query.page ?? 1}`,
    ),
  current: (fetcher: Parameters<typeof apiData>[0]) =>
    apiData<RideHistoryItem | null>(fetcher, "/rides/current"),
  match: (fetcher: Parameters<typeof apiData>[0], id: string) =>
    apiData<{
      matched: boolean;
      searching?: boolean;
      dispatch?: DispatchStatusView;
      ride: RideHistoryItem;
    }>(fetcher, `/rides/${id}/match`, { method: "POST", body: "{}" }),
  get: (fetcher: Parameters<typeof apiData>[0], id: string) =>
    apiData<RideHistoryItem>(fetcher, `/rides/${id}`),
  cancel: (fetcher: Parameters<typeof apiData>[0], id: string) =>
    apiData<RideHistoryItem>(fetcher, `/rides/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason: "changed_mind" }),
    }),
};
