import type { ApiResponse } from '@heytaksi/shared';
import { apiBaseUrl } from './config';

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  return response.json() as Promise<ApiResponse<T>>;
}
