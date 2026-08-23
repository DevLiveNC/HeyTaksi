import type { ApiResponse } from '@heytaksi/shared';
import { apiBaseUrl } from './config';
const baseUrl = apiBaseUrl;
export async function apiRequest<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  return response.json() as Promise<ApiResponse<T>>;
}
