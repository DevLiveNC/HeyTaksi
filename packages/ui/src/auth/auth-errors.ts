export const networkFailureMessage = 'Sunucuya bağlanılamadı. Lütfen birkaç saniye sonra tekrar deneyin.';

/** Safari: "Load failed"; Chrome: "Failed to fetch"; Node: "fetch failed". */
export function describeAuthFailure(cause: unknown): string {
  if (!(cause instanceof Error)) return 'İşlem tamamlanamadı.';
  const message = cause.message.trim();
  const normalized = message.toLowerCase();
  if (
    normalized === 'load failed' ||
    normalized === 'failed to fetch' ||
    normalized.includes('networkerror') ||
    normalized.includes('network request failed') ||
    normalized.includes('fetch failed') ||
    normalized.includes('function_invocation_failed')
  ) {
    return networkFailureMessage;
  }
  return message || 'İşlem tamamlanamadı.';
}
