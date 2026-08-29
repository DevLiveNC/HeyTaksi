import { parseApiJson } from "@heytaksi/ui";
import type {
  DriverAvailabilityTarget,
  DriverDashboard,
  DriverEarnings,
  DriverRideDetail,
  MapsClientConfig,
  RideContact,
  RideMessage,
  RideStatus,
} from "@heytaksi/shared";

export type AuthorizedFetch = (path: string, init?: RequestInit) => Promise<Response>;

export async function apiData<T>(
  authorizedFetch: AuthorizedFetch,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await authorizedFetch(path, init);
  const payload = await parseApiJson<{ data?: T; error?: { message?: string } }>(response);
  if (!response.ok) throw new Error(payload.error?.message ?? "İşlem tamamlanamadı.");
  return payload.data as T;
}

export const driverApi = {
  dashboard: (fetcher: AuthorizedFetch) => apiData<DriverDashboard>(fetcher, "/drivers/me/dashboard"),
  setAvailability: (fetcher: AuthorizedFetch, availability: DriverAvailabilityTarget) =>
    apiData<{ availability: string; onlineStatus: boolean }>(fetcher, "/drivers/me/availability", {
      method: "PATCH",
      body: JSON.stringify({ availability }),
    }),
  currentRide: (fetcher: AuthorizedFetch) =>
    apiData<DriverRideDetail | null>(fetcher, "/drivers/me/rides/current"),
  hotspots: (fetcher: AuthorizedFetch) => apiData<DriverDashboard["hotspots"]>(fetcher, "/drivers/me/hotspots"),
  earnings: (fetcher: AuthorizedFetch, period: "day" | "week" | "month") =>
    apiData<DriverEarnings>(fetcher, `/drivers/me/earnings?period=${period}`),
  reportLocation: (
    fetcher: AuthorizedFetch,
    location: { latitude: number; longitude: number; heading?: number; accuracyMeters?: number },
  ) =>
    apiData<{ latitude: number; longitude: number; recordedAt: string }>(fetcher, "/drivers/me/location", {
      method: "POST",
      body: JSON.stringify(location),
    }),
  acceptRide: (fetcher: AuthorizedFetch, rideId: string) =>
    apiData<DriverRideDetail>(fetcher, `/rides/${rideId}/accept`, { method: "POST" }),
  rejectRide: (fetcher: AuthorizedFetch, rideId: string, reason?: string) =>
    apiData<{ status: RideStatus }>(fetcher, `/rides/${rideId}/reject`, {
      method: "POST",
      body: JSON.stringify(reason ? { reason } : {}),
    }),
  updateRideStatus: (fetcher: AuthorizedFetch, rideId: string, status: RideStatus) =>
    apiData<unknown>(fetcher, `/rides/${rideId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  cancelRide: (fetcher: AuthorizedFetch, rideId: string, reason: string, note?: string) =>
    apiData<unknown>(fetcher, `/rides/${rideId}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason, ...(note ? { note } : {}) }),
    }),
  messages: (fetcher: AuthorizedFetch, rideId: string) =>
    apiData<RideMessage[]>(fetcher, `/rides/${rideId}/messages`),
  sendMessage: (fetcher: AuthorizedFetch, rideId: string, body: string) =>
    apiData<RideMessage>(fetcher, `/rides/${rideId}/messages`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),
  contact: (fetcher: AuthorizedFetch, rideId: string) =>
    apiData<RideContact>(fetcher, `/rides/${rideId}/contact`),
  ratePassenger: (fetcher: AuthorizedFetch, rideId: string, stars: number, comment?: string) =>
    apiData<{ rideId: string; stars: number }>(fetcher, `/rides/${rideId}/rating`, {
      method: "POST",
      body: JSON.stringify({ stars, ...(comment ? { comment } : {}) }),
    }),
  mapsConfig: (fetcher: AuthorizedFetch) => apiData<MapsClientConfig>(fetcher, "/locations/maps-config"),
};
