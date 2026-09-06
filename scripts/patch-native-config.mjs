#!/usr/bin/env node
/**
 * Capacitor `add`/`sync` sonrası konum izin metinlerini yazar.
 * AndroidManifest ve iOS Info.plist yoksa (henüz native proje eklenmemiş) sessiz çıkar.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = process.argv[2];
if (app !== 'passenger' && app !== 'driver') {
  console.error('Usage: patch-native-config.mjs <passenger|driver>');
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', app);
const whenInUse =
  app === 'driver'
    ? 'Hey Taksi Sürücü, yolcu taleplerini iletmek ve yolculuk boyunca konumunu paylaşmak için konumunu kullanır.'
    : 'Hey Taksi, yakındaki taksileri göstermek ve alış noktanı doldurmak için konumunu kullanır.';
const always =
  'Hey Taksi Sürücü, uygulama arkadayken de yolcu talebi alabilmen için konumunu kullanır.';

function upsertXmlPermission(xml, permission) {
  const tag = `<uses-permission android:name="${permission}" />`;
  if (xml.includes(permission)) return xml;
  if (xml.includes('<application')) {
    return xml.replace('<application', `${tag}\n    <application`);
  }
  return xml;
}

const androidManifest = join(root, 'android/app/src/main/AndroidManifest.xml');
if (existsSync(androidManifest)) {
  let xml = readFileSync(androidManifest, 'utf8');
  xml = upsertXmlPermission(xml, 'android.permission.ACCESS_COARSE_LOCATION');
  xml = upsertXmlPermission(xml, 'android.permission.ACCESS_FINE_LOCATION');
  if (app === 'driver') {
    xml = upsertXmlPermission(xml, 'android.permission.ACCESS_BACKGROUND_LOCATION');
    xml = upsertXmlPermission(xml, 'android.permission.FOREGROUND_SERVICE');
    xml = upsertXmlPermission(xml, 'android.permission.FOREGROUND_SERVICE_LOCATION');
    xml = upsertXmlPermission(xml, 'android.permission.POST_NOTIFICATIONS');
  }
  writeFileSync(androidManifest, xml);
  console.log(`Patched ${androidManifest}`);
}

function upsertPlist(plist, key, value) {
  if (plist.includes(`<key>${key}</key>`)) return plist;
  const entry = `	<key>${key}</key>\n	<string>${value}</string>\n`;
  const marker = '</dict>';
  const index = plist.lastIndexOf(marker);
  if (index === -1) return plist;
  return `${plist.slice(0, index)}${entry}${plist.slice(index)}`;
}

const infoPlist = join(root, 'ios/App/App/Info.plist');
if (existsSync(infoPlist)) {
  let plist = readFileSync(infoPlist, 'utf8');
  plist = upsertPlist(plist, 'NSLocationWhenInUseUsageDescription', whenInUse);
  if (app === 'driver') {
    plist = upsertPlist(plist, 'NSLocationAlwaysAndWhenInUseUsageDescription', always);
    plist = upsertPlist(plist, 'NSLocationAlwaysUsageDescription', always);
  }
  writeFileSync(infoPlist, plist);
  console.log(`Patched ${infoPlist}`);
}
