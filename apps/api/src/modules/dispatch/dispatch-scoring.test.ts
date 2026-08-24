import { describe, expect, it } from 'vitest';
import {
  DISPATCH_OFFER_TTL_SECONDS,
  DISPATCH_RADIUS_STEPS_METERS,
  dispatchWeights,
  estimateEtaSeconds,
  haversineMeters,
  rankDispatchCandidates,
  scoreDispatchCandidate,
} from '@heytaksi/shared';

const base = {
  distanceMeters: 1_000,
  etaSeconds: 240,
  rating: 4.8,
  acceptanceRate: 90,
  cancellationRate: 4,
  radiusMeters: 3_000,
};

describe('dispatch skorlama', () => {
  it('ağırlıkların toplamı 1.0 olmalı', () => {
    const total = Object.values(dispatchWeights).reduce((sum, weight) => sum + weight, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('aynı girdi her zaman aynı skoru üretir (deterministik, AI yok)', () => {
    const first = scoreDispatchCandidate(base);
    for (let index = 0; index < 50; index += 1) expect(scoreDispatchCandidate(base)).toEqual(first);
  });

  it('skor 0-100 aralığındadır', () => {
    const best = scoreDispatchCandidate({
      distanceMeters: 0,
      etaSeconds: 0,
      rating: 5,
      acceptanceRate: 100,
      cancellationRate: 0,
      radiusMeters: 3_000,
    });
    const worst = scoreDispatchCandidate({
      distanceMeters: 3_000,
      etaSeconds: 1_800,
      rating: 3,
      acceptanceRate: 0,
      cancellationRate: 100,
      radiusMeters: 3_000,
    });
    expect(best.total).toBe(100);
    expect(worst.total).toBe(0);
    expect(scoreDispatchCandidate(base).total).toBeGreaterThan(worst.total);
    expect(scoreDispatchCandidate(base).total).toBeLessThan(best.total);
  });

  it('yakın sürücü uzak sürücüden yüksek puan alır', () => {
    const near = scoreDispatchCandidate({ ...base, distanceMeters: 400, etaSeconds: 120 });
    const far = scoreDispatchCandidate({ ...base, distanceMeters: 2_800, etaSeconds: 620 });
    expect(near.total).toBeGreaterThan(far.total);
  });

  it('yüksek puanlı ve kabul oranı yüksek sürücü öne çıkar', () => {
    const strong = scoreDispatchCandidate({ ...base, rating: 5, acceptanceRate: 100 });
    const weak = scoreDispatchCandidate({ ...base, rating: 3.5, acceptanceRate: 40 });
    expect(strong.total).toBeGreaterThan(weak.total);
  });

  it('yüksek iptal oranı skoru düşürür', () => {
    const reliable = scoreDispatchCandidate({ ...base, cancellationRate: 0 });
    const risky = scoreDispatchCandidate({ ...base, cancellationRate: 60 });
    expect(reliable.total).toBeGreaterThan(risky.total);
  });

  it('bileşenler 0-1 aralığına sıkıştırılır', () => {
    const out = scoreDispatchCandidate({
      distanceMeters: 99_999,
      etaSeconds: 99_999,
      rating: 9,
      acceptanceRate: 500,
      cancellationRate: 500,
      radiusMeters: 3_000,
    });
    for (const key of ['distance', 'eta', 'rating', 'acceptance', 'cancellation'] as const) {
      expect(out[key]).toBeGreaterThanOrEqual(0);
      expect(out[key]).toBeLessThanOrEqual(1);
    }
  });
});

describe('aday sıralaması', () => {
  const candidate = (driverId: string, score: number, etaSeconds: number, distanceMeters: number) => ({
    driverId,
    score,
    etaSeconds,
    distanceMeters,
  });

  it('skora göre azalan sıralar', () => {
    const ranked = rankDispatchCandidates([
      candidate('c', 61, 300, 1_500),
      candidate('a', 88, 120, 500),
      candidate('b', 74, 200, 900),
    ]);
    expect(ranked.map((item) => item.driverId)).toEqual(['a', 'b', 'c']);
  });

  it('eşit skorda önce ETA, sonra mesafe, sonra kimlik ile kararlı sıralar', () => {
    const ranked = rankDispatchCandidates([
      candidate('z', 70, 200, 800),
      candidate('a', 70, 200, 800),
      candidate('m', 70, 150, 900),
      candidate('k', 70, 200, 600),
    ]);
    expect(ranked.map((item) => item.driverId)).toEqual(['m', 'k', 'a', 'z']);
  });

  it('sıralama girdi dizisini değiştirmez ve tekrarlanabilirdir', () => {
    const input = [candidate('b', 70, 200, 800), candidate('a', 90, 100, 400)];
    const snapshot = [...input];
    const first = rankDispatchCandidates(input).map((item) => item.driverId);
    const second = rankDispatchCandidates(input).map((item) => item.driverId);
    expect(input).toEqual(snapshot);
    expect(first).toEqual(second);
  });
});

describe('mesafe ve ETA', () => {
  it('haversine bilinen mesafeyi doğru hesaplar', () => {
    // Mersin merkez → Mezitli ≈ 6.3 km kuş uçuşu.
    const meters = haversineMeters(
      { latitude: 36.8121, longitude: 34.6415 },
      { latitude: 36.7709, longitude: 34.5915 },
    );
    expect(meters).toBeGreaterThan(6_000);
    expect(meters).toBeLessThan(6_800);
  });

  it('aynı nokta için mesafe sıfırdır', () => {
    expect(haversineMeters({ latitude: 36.8, longitude: 34.6 }, { latitude: 36.8, longitude: 34.6 })).toBe(0);
  });

  it('ETA mesafeyle birlikte artar ve en az 60 saniyedir', () => {
    expect(estimateEtaSeconds(0)).toBe(60);
    expect(estimateEtaSeconds(5_000)).toBeGreaterThan(estimateEtaSeconds(1_000));
    // 5 km şehir içi ≈ 10-15 dk aralığında olmalı.
    expect(estimateEtaSeconds(5_000)).toBeGreaterThan(600);
    expect(estimateEtaSeconds(5_000)).toBeLessThan(1_200);
  });
});

describe('dağıtım parametreleri', () => {
  it('arama yarıçapı adımları artan sıradadır', () => {
    for (let index = 1; index < DISPATCH_RADIUS_STEPS_METERS.length; index += 1)
      expect(DISPATCH_RADIUS_STEPS_METERS[index]!).toBeGreaterThan(DISPATCH_RADIUS_STEPS_METERS[index - 1]!);
  });

  it('teklif penceresi makul bir aralıktadır', () => {
    expect(DISPATCH_OFFER_TTL_SECONDS).toBeGreaterThanOrEqual(10);
    expect(DISPATCH_OFFER_TTL_SECONDS).toBeLessThanOrEqual(60);
  });
});
