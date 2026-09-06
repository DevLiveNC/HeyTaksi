#!/usr/bin/env node
/**
 * Hey Taksi marka ikonları: sarı zemin, koyu yuvarlatılmış kare, sarı iğne.
 * Çıktı: yolcu/sürücü public/icons + resources (Capacitor).
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function crc32(buffer) {
  let crc = ~0;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const header = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([header, data])));
  return Buffer.concat([length, header, data, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    255,
  ];
}

function roundedRect(px, py, size, radius) {
  const [x, y] = [px, py];
  if (x < radius && y < radius) {
    const dx = radius - x;
    const dy = radius - y;
    return dx * dx + dy * dy <= radius * radius;
  }
  if (x >= size - radius && y < radius) {
    const dx = x - (size - radius - 1);
    const dy = radius - y;
    return dx * dx + dy * dy <= radius * radius;
  }
  if (x < radius && y >= size - radius) {
    const dx = radius - x;
    const dy = y - (size - radius - 1);
    return dx * dx + dy * dy <= radius * radius;
  }
  if (x >= size - radius && y >= size - radius) {
    const dx = x - (size - radius - 1);
    const dy = y - (size - radius - 1);
    return dx * dx + dy * dy <= radius * radius;
  }
  return true;
}

function paintIcon(size, { background, mark, pin }) {
  const rgba = Buffer.alloc(size * size * 4);
  const inset = Math.round(size * 0.14);
  const markSize = size - inset * 2;
  const radius = Math.round(markSize * 0.28);
  const cx = size / 2;
  const cy = size / 2 - size * 0.04;
  const pinR = size * 0.13;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let color = background;
      const mx = x - inset;
      const my = y - inset;
      if (mx >= 0 && my >= 0 && mx < markSize && my < markSize && roundedRect(mx, my, markSize, radius)) {
        color = mark;
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= pinR * pinR) color = pin;
        const tipX = cx;
        const tipY = cy + pinR * 1.85;
        const ddx = x - tipX;
        const ddy = y - (cy + pinR * 0.4);
        const inTriangle =
          y >= cy + pinR * 0.35 &&
          y <= tipY &&
          Math.abs(ddx) <= (1 - (y - (cy + pinR * 0.35)) / (tipY - (cy + pinR * 0.35))) * pinR * 0.92;
        if (inTriangle) color = pin;
        const hole = dx * dx + (y - (cy - pinR * 0.12)) ** 2 <= (pinR * 0.32) ** 2;
        if (hole) color = mark;
        void ddy;
      }
      const i = (y * size + x) * 4;
      rgba[i] = color[0];
      rgba[i + 1] = color[1];
      rgba[i + 2] = color[2];
      rgba[i + 3] = color[3] ?? 255;
    }
  }
  return rgba;
}

function writePng(path, size, palette) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePng(size, size, paintIcon(size, palette)));
}

const passenger = {
  background: mix([255, 204, 0], [255, 204, 0], 1),
  mark: [23, 23, 23, 255],
  pin: [255, 207, 32, 255],
};
const driver = {
  background: [17, 18, 20, 255],
  mark: [255, 204, 0, 255],
  pin: [23, 23, 23, 255],
};

const sizes = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
];

for (const [file, size] of sizes) {
  writePng(join(ROOT, 'apps/passenger/public/icons', file), size, passenger);
  writePng(join(ROOT, 'apps/driver/public/icons', file), size, driver);
}

writePng(join(ROOT, 'apps/passenger/resources/icon.png'), 1024, passenger);
writePng(join(ROOT, 'apps/passenger/resources/splash.png'), 2732, {
  background: [255, 204, 0, 255],
  mark: [23, 23, 23, 255],
  pin: [255, 207, 32, 255],
});
writePng(join(ROOT, 'apps/driver/resources/icon.png'), 1024, driver);
writePng(join(ROOT, 'apps/driver/resources/splash.png'), 2732, {
  background: [17, 18, 20, 255],
  mark: [255, 204, 0, 255],
  pin: [23, 23, 23, 255],
});

console.log('App icons written for passenger and driver.');
