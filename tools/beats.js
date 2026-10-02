#!/usr/bin/env node
/**
 * Do nhip trong (tieng bass/trong kick) cua cac bai trong music/love -> ghi ra
 * music/love/beats.json: { "ten-bai.mp3": [giay, giay, ...] }.
 * Trang trai-tim-khoanh-khac.html doc file nay de trai tim dap dung nhip nhac
 * dang phat — khong phai do nhac luc chay (iPhone de che do im lang se tat tieng).
 *
 *   npm run beats          # chi do bai moi
 *   npm run beats -- --force
 *
 * Can ffmpeg (brew install ffmpeg).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'music', 'love');
const OUT = path.join(DIR, 'beats.json');
const FORCE = process.argv.includes('--force');

const RATE = 8000;          // tan so lay mau sau khi giam — chi can phan tram thap
const HOP = 80;             // 10 ms mot khung
const WIN = 320;            // cua so 40 ms
const MIN_GAP = 0.27;       // hai nhip cach nhau it nhat (giay) ~ 220 BPM
const LOCAL = 1.5;          // nguong so voi trung binh +-1.5 giay xung quanh
const K = 1.2;              // cao hon trung binh K do lech chuan moi tinh la nhip

function ffmpegBin() {
  try { return execFileSync('which', ['ffmpeg'], { encoding: 'utf8' }).trim(); } catch { return null; }
}

/** Giai ma mp3 -> mau so mono, chi giu tieng duoi 150 Hz (trong kick, bass) */
function decodeLow(ffmpeg, file) {
  const buf = execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-ac', '1', '-af', 'lowpass=f=150,lowpass=f=150',
    '-ar', String(RATE), '-f', 's16le', '-'], { maxBuffer: 1 << 30 });
  const out = new Float32Array(buf.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = buf.readInt16LE(i * 2) / 32768;
  return out;
}

function detect(samples) {
  // Nang luong log tung khung, roi lay muc tang (onset): tieng trong vua dap thi tang vot
  const n = Math.floor((samples.length - WIN) / HOP);
  const energy = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let e = 0;
    for (let i = f * HOP, end = i + WIN; i < end; i++) e += samples[i] * samples[i];
    energy[f] = Math.log(1e-9 + e / WIN);
  }
  const flux = new Float32Array(n);
  for (let f = 1; f < n; f++) flux[f] = Math.max(0, energy[f] - energy[f - 1]);

  const L = Math.round(LOCAL / (HOP / RATE));
  const beats = [];
  let last = -Infinity;
  for (let f = 2; f < n - 2; f++) {
    const v = flux[f];
    if (v <= flux[f - 1] || v < flux[f + 1] || v < flux[f - 2] || v < flux[f + 2]) continue;
    let s = 0, s2 = 0, c = 0;
    for (let j = Math.max(0, f - L); j < Math.min(n, f + L); j++) { s += flux[j]; s2 += flux[j] * flux[j]; c++; }
    const mean = s / c, sd = Math.sqrt(Math.max(0, s2 / c - mean * mean));
    if (v < mean + K * sd || v < 0.08) continue;
    const t = (f * HOP + WIN / 2) / RATE;
    if (t - last < MIN_GAP) continue;
    beats.push(Math.round(t * 100) / 100);
    last = t;
  }
  return beats;
}

function main() {
  const ffmpeg = ffmpegBin();
  if (!ffmpeg) { console.error('Khong tim thay ffmpeg — cai bang: brew install ffmpeg'); process.exit(1); }
  const data = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  const files = fs.readdirSync(DIR).filter((f) => /\.mp3$/i.test(f)).sort();
  for (const f of files) {
    if (data[f] && !FORCE) continue;
    const beats = detect(decodeLow(ffmpeg, path.join(DIR, f)));
    data[f] = beats;
    const gaps = beats.slice(1).map((b, i) => b - beats[i]).sort((a, b) => a - b);
    const med = gaps[Math.floor(gaps.length / 2)] || 0;
    console.log(`  ${f.padEnd(30)} ${String(beats.length).padStart(4)} nhip  (~${med ? Math.round(60 / med) : 0} nhip/phut)`);
  }
  for (const f of Object.keys(data)) if (!files.includes(f)) delete data[f];   // bai da xoa
  fs.writeFileSync(OUT, JSON.stringify(data));
  console.log(`  Da ghi ${path.relative(ROOT, OUT)}`);
}

main();
