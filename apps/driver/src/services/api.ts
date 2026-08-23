import type { ApiResponse } from '@heytaksi/shared';
const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';
export async function apiRequest<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  return response.json() as Promise<ApiResponse<T>>;
}
