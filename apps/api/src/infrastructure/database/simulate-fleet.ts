import 'dotenv/config';
import { setTimeout as sleep } from 'node:timers/promises';
import { DRIVER_LOCATION_INTERVAL_SECONDS } from '@heytaksi/shared';
import { env } from '../../config/env.js';

/**
 * Demo filosu hareket simülatörü (yalnızca geliştirme/gösterim içindir).
 *
 * `npm run db:seed-fleet` ile oluşturulan sürücüler adına oturum açar, WebSocket
 * bağlantısı kurar ve düzenli aralıklarla konum sinyali gönderir. Böylece admin
 * canlı haritası ve dispatch motoru gerçek trafik altında gözlemlenebilir.
 * Production'da çalıştırılmamalıdır.
 */
const drivers = ['ayse', 'mehmet', 'zeynep', 'hasan', 'elif', 'burak', 'canan', 'okan'];
const password = process.env.DEMO_FLEET_PASSWORD ?? 'FleetDemo2026!';
const centre = {
  latitude: Number(process.env.DEMO_FLEET_CENTER_LAT ?? 36.8121),
  longitude: Number(process.env.DEMO_FLEET_CENTER_LON ?? 34.6415),
};
const apiUrl = process.env.SIMULATOR_API_URL ?? `http://127.0.0.1:${env.PORT}${env.API_PREFIX}`;
const wsUrl = process.env.SIMULATOR_WS_URL ?? `ws://127.0.0.1:${env.PORT}/ws`;

/**
 * Teklif politikası:
 * - `accept` : teklifi bekleme süresi sonunda kabul eder ve yolculuğu tamamlar (tam akış demosu)
 * - `reject` : hemen reddeder; dağıtımın sıradaki sürücüye geçişini gösterir
 * - `ignore` : yanıt vermez; zaman aşımı akışını gösterir
 *
 * `accept` politikasında sürücü, gerçek sürücü uygulamasına öncelik tanımak için
 * SIMULATOR_ACCEPT_DELAY saniye bekler.
 */
const policy = (process.env.SIMULATOR_OFFER_POLICY ?? 'accept') as 'accept' | 'reject' | 'ignore';
const acceptDelaySeconds = Number(process.env.SIMULATOR_ACCEPT_DELAY ?? 8);

if (env.NODE_ENV === 'production') {
  console.error('Filo simülatörü production ortamında çalıştırılamaz.');
  process.exit(1);
}

interface Agent {
  slug: string;
  token: string;
  socket: WebSocket;
  latitude: number;
  longitude: number;
  heading: number;
}

async function login(slug: string, index: number) {
  const response = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: `${slug}.driver@heytaksi.com`,
      password,
      device: { id: `00000000-0000-4000-9000-0000000001${String(index).padStart(2, '0')}`, platform: 'web' },
    }),
  });
  if (response.status === 429) {
    // Oran sınırına takıldıysa kısa bir bekleyişten sonra bir kez daha dene.
    await sleep(8_000);
    return login(slug, index);
  }
  const payload = (await response.json()) as { data?: { accessToken: string }; error?: { message: string } };
  if (!response.ok || !payload.data) throw new Error(`${slug}: ${payload.error?.message ?? 'giriş başarısız'}`);
  return payload.data.accessToken;
}

async function connect(slug: string, token: string, index: number): Promise<Agent> {
  const socket = new WebSocket(wsUrl);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', () => reject(new Error(`${slug}: soket açılamadı`)), { once: true });
  });
  socket.send(JSON.stringify({ event: 'auth', data: { token } }));
  socket.send(JSON.stringify({ event: 'driver.subscribe', data: {} }));
  socket.addEventListener('message', (message) => {
    const envelope = JSON.parse(String(message.data)) as {
      event: string;
      data: { ride?: { id: string } };
    };
    if (envelope.event === 'ride.offer') {
      const rideId = envelope.data?.ride?.id;
      console.info(`  [${slug}] teklif aldı${rideId ? ` (${rideId.slice(0, 8)})` : ''}`);
      if (rideId) void respond(slug, token, rideId);
    }
    if (envelope.event === 'ride.offer.closed') console.info(`  [${slug}] teklif kapandı`);
  });
  // API yeniden başladığında sürücü sessizce düşmesin: otomatik yeniden bağlan.
  socket.addEventListener('close', () => {
    const agent = agents.find((item) => item.slug === slug);
    if (!agent || stopping) return;
    console.info(`  [${slug}] bağlantı koptu, yeniden bağlanılıyor…`);
    setTimeout(() => {
      void reconnect(agent, index).catch(() => undefined);
    }, 2_000);
  });
  const angle = (index / drivers.length) * Math.PI * 2;
  return {
    slug,
    token,
    socket,
    latitude: centre.latitude + Math.sin(angle) * 0.012,
    longitude: centre.longitude + Math.cos(angle) * 0.012,
    heading: Math.round((angle * 180) / Math.PI),
  };
}

let stopping = false;
const agents: Agent[] = [];

const call = (path: string, token: string, method: string, body?: unknown) =>
  fetch(`${apiUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body ?? {}),
  });

/** Teklife yapılandırılmış politikaya göre yanıt verir ve kabul edilen yolculuğu tamamlar. */
async function respond(slug: string, token: string, rideId: string): Promise<void> {
  if (policy === 'ignore') return;
  if (policy === 'reject') {
    await call(`/rides/${rideId}/reject`, token, 'POST', { reason: 'other' }).catch(() => undefined);
    return;
  }
  // Gerçek sürücü uygulaması önce kabul edebilsin diye kısa bir pencere bırakılır.
  await sleep(acceptDelaySeconds * 1000);
  if (stopping) return;
  const accepted = await call(`/rides/${rideId}/accept`, token, 'POST').catch(() => null);
  if (!accepted?.ok) return;
  console.info(`  [${slug}] yolculuğu kabul etti (${rideId.slice(0, 8)})`);
  // Yolculuğu deterministik aralıklarla ilerlet: varış → başlangıç → tamamlanma.
  for (const [status, waitSeconds] of [
    ['driver_arrived', 12],
    ['started', 6],
    ['in_progress', 2],
    ['completed', 25],
  ] as const) {
    await sleep(waitSeconds * 1000);
    if (stopping) return;
    const response = await call(`/rides/${rideId}/status`, token, 'PATCH', { status }).catch(() => null);
    if (!response?.ok) return;
  }
  console.info(`  [${slug}] yolculuğu tamamladı (${rideId.slice(0, 8)})`);
}

/** Kopan bağlantıyı yeniden kurar; gerekirse yeniden giriş yapar. */
async function reconnect(agent: Agent, index: number): Promise<void> {
  if (stopping) return;
  try {
    agent.token = await login(agent.slug, index);
    await fetch(`${apiUrl}/drivers/me/availability`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${agent.token}` },
      body: JSON.stringify({ availability: 'online' }),
    });
    const fresh = await connect(agent.slug, agent.token, index);
    agent.socket = fresh.socket;
    console.info(`  [${agent.slug}] yeniden bağlandı`);
  } catch {
    setTimeout(() => void reconnect(agent, index).catch(() => undefined), 4_000);
  }
}
for (const [index, slug] of drivers.entries()) {
  try {
    const token = await login(slug, index);
    await fetch(`${apiUrl}/drivers/me/availability`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ availability: 'online' }),
    });
    agents.push(await connect(slug, token, index));
    console.info(`✓ ${slug} çevrim içi`);
  } catch (error) {
    console.warn(`✗ ${slug}: ${(error as Error).message}`);
  }
}
if (!agents.length) {
  console.error('Hiçbir demo sürücü bağlanamadı. Önce `npm run db:seed-fleet` çalıştırın.');
  process.exit(1);
}

console.info(
  `\n${agents.length} sürücü hareket ediyor (${DRIVER_LOCATION_INTERVAL_SECONDS} sn aralıkla, teklif politikası: ${policy}). Durdurmak için Ctrl+C.\n`,
);

let tick = 0;
const stop = () => {
  stopping = true;
  for (const agent of agents) agent.socket.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

// Deterministik dolaşım: her sürücü merkez etrafında sabit bir yörüngede ilerler.
for (;;) {
  tick += 1;
  for (const [index, agent] of agents.entries()) {
    const angle = ((index / agents.length) * Math.PI * 2 + tick * 0.06) % (Math.PI * 2);
    const radius = 0.008 + (index % 4) * 0.004;
    agent.latitude = centre.latitude + Math.sin(angle) * radius;
    agent.longitude = centre.longitude + Math.cos(angle) * radius;
    agent.heading = Math.round(((angle * 180) / Math.PI + 90) % 360);
    if (agent.socket.readyState === agent.socket.OPEN)
      agent.socket.send(
        JSON.stringify({
          event: 'driver.location',
          data: {
            latitude: Number(agent.latitude.toFixed(6)),
            longitude: Number(agent.longitude.toFixed(6)),
            heading: agent.heading,
            speedMps: 6 + (index % 5),
          },
        }),
      );
  }
  await sleep(DRIVER_LOCATION_INTERVAL_SECONDS * 1000);
}
