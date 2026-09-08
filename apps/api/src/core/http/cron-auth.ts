import type { IncomingHttpHeaders } from 'node:http';

function headerValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export function isVercelCronRequest(headers: IncomingHttpHeaders, cronSecret = process.env.CRON_SECRET) {
  const secret = cronSecret?.trim();
  if (!secret) return false;
  return headerValue(headers.authorization) === `Bearer ${secret}`;
}
