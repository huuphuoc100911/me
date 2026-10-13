/**
 * Mo Chrome khong giao dien (tat tieng) va dieu khien qua DevTools — dung chung cho
 * cac tool xuat file (tools/hoat-hinh.js, tools/truyen-tranh.js).
 *
 *   const page = await openChrome({ width: 540, height: 960, scale: 2 });
 *   await page.goto('file://...');
 *   await page.ev('1 + 1');               // chay JS trong trang (cho ca Promise)
 *   await page.send('Page.printToPDF', {...});
 *   page.close();
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const CHROME = process.env.CHROME || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openChrome({ width = 540, height = 960, scale = 1 } = {}) {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-xuat-'));
  const chrome = spawn(CHROME, ['--headless=new', '--mute-audio', '--hide-scrollbars', '--remote-debugging-port=0',
    '--user-data-dir=' + prof, '--allow-file-access-from-files', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let ws = null;
  const close = () => {
    try { if (ws) ws.close(); } catch {}
    try { chrome.kill('SIGKILL'); } catch {}
    fs.rmSync(prof, { recursive: true, force: true });
  };
  try {
    // cong debug Chrome tu chon -> doc tu dong "DevTools listening on ws://..."
    const wsUrl = await new Promise((ok, bad) => {
      let buf = '';
      chrome.stderr.on('data', (d) => { buf += d; const m = buf.match(/ws:\/\/[^\s]+/); if (m) ok(m[0]); });
      chrome.on('error', bad);
      setTimeout(() => bad(new Error('Chrome khong mo duoc (dat bien CHROME=duong-dan neu cai cho khac)')), 15000);
    });
    const port = new URL(wsUrl).port;
    const tgt = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    ws = new WebSocket(tgt.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r));
    let id = 0; const wait = new Map();
    ws.addEventListener('message', (m) => {
      const d = JSON.parse(m.data);
      if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); }
    });
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
    const goto = async (url, ready = 'document.readyState === "complete"', tries = 150) => {
      await send('Page.navigate', { url });
      for (let i = 0; i < tries; i++) { if (await ev(ready)) return true; await sleep(200); }
      return false;
    };
    return { send, ev, goto, close };
  } catch (e) { close(); throw e; }
}

module.exports = { openChrome, sleep };
