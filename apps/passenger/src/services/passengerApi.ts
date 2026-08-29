import { parseApiJson } from "@heytaksi/ui";
import type {
  PaymentMethod,
  PaymentMethodCreateInput,
  SupportTicket,
  UserNotification,
  UserProfile,
  WalletTopupInput,
  WalletView,
} from "@heytaksi/shared";

type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;

async function apiData<T>(fetcher: Fetcher, path: string, init?: RequestInit): Promise<T> {
  const response = await fetcher(path, init);
  if (response.status === 204) return undefined as T;
  const payload = await parseApiJson<{ data?: T; error?: { message?: string } }>(response);
  if (!response.ok) throw new Error(payload.error?.message ?? "İşlem tamamlanamadı.");
  return payload.data as T;
}

export const passengerApi = {
  profile: (fetcher: Fetcher) => apiData<UserProfile>(fetcher, "/users/me"),
  updateProfile: (fetcher: Fetcher, input: { firstName?: string; lastName?: string }) =>
    apiData<{ firstName: string; lastName: string; profileImage: string | null }>(fetcher, "/users/me", {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  sessions: (fetcher: Fetcher) =>
    apiData<Array<{ id: string; deviceName: string; platform: string; ipAddress: string; createdAt: string; lastUsedAt: string }>>(
      fetcher,
      "/auth/sessions",
    ),
  notifications: (fetcher: Fetcher) => apiData<UserNotification[]>(fetcher, "/users/me/notifications"),
  markNotificationsRead: (fetcher: Fetcher) =>
    apiData<{ read: boolean }>(fetcher, "/users/me/notifications/read", { method: "PATCH", body: "{}" }),
  wallet: (fetcher: Fetcher) => apiData<WalletView>(fetcher, "/payments/wallet"),
  topup: (fetcher: Fetcher, input: WalletTopupInput) =>
    apiData<WalletView>(fetcher, "/payments/wallet/topup", { method: "POST", body: JSON.stringify(input) }),
  addMethod: (fetcher: Fetcher, input: PaymentMethodCreateInput) =>
    apiData<PaymentMethod>(fetcher, "/payments/methods", { method: "POST", body: JSON.stringify(input) }),
  deleteMethod: (fetcher: Fetcher, id: string) => apiData<void>(fetcher, `/payments/methods/${id}`, { method: "DELETE" }),
  tickets: (fetcher: Fetcher) => apiData<SupportTicket[]>(fetcher, "/support/tickets"),
  createTicket: (fetcher: Fetcher, input: { subject: string; message: string; rideId?: string }) =>
    apiData<SupportTicket>(fetcher, "/support/tickets", { method: "POST", body: JSON.stringify(input) }),
};
