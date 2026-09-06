import { resolveApiBaseUrl, resolveWsBaseUrl, detectNativeShell } from "@heytaksi/shared";

const native = detectNativeShell();

export const apiBaseUrl = resolveApiBaseUrl(import.meta.env.VITE_API_URL as string | undefined, { native });

export const wsBaseUrl = resolveWsBaseUrl(
  import.meta.env.VITE_WS_URL as string | undefined,
  window.location,
  { native },
);
