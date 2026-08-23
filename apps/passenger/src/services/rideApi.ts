import type {
  Coordinate,
  CreateRideInput,
  DispatchStatusView,
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
  const payload = (await response.json()) as {
    data?: T;
    error?: { message?: string };
  };
  if (!response.ok)
    throw new Error(payload.error?.message ?? "İşlem tamamlanamadı.");
  return payload.data!;
}
export const locationApi = {
  search: (
    fetcher: Parameters<typeof apiData>[0],
    query: string,
    near: Coordinate,
  ) =>
    apiData<SearchResult[]>(
      fetcher,
      `/locations/search?q=${encodeURIComponent(query)}&latitude=${near.latitude}&longitude=${near.longitude}`,
    ),
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
};
export const rideApi = {
  create: (fetcher: Parameters<typeof apiData>[0], input: CreateRideInput) =>
    apiData<Record<string, unknown>>(fetcher, "/rides", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  /** Dağıtım aramasının çalıştığını garanti eder ve güncel durumu döndürür (idempotent). */
  match: (fetcher: Parameters<typeof apiData>[0], id: string) =>
    apiData<{
      matched: boolean;
      searching?: boolean;
      dispatch?: DispatchStatusView;
      ride: Record<string, unknown>;
    }>(fetcher, `/rides/${id}/match`, { method: "POST", body: "{}" }),
  get: (fetcher: Parameters<typeof apiData>[0], id: string) =>
    apiData<Record<string, unknown>>(fetcher, `/rides/${id}`),
  cancel: (fetcher: Parameters<typeof apiData>[0], id: string) =>
    apiData<Record<string, unknown>>(fetcher, `/rides/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason: "changed_mind" }),
    }),
};
