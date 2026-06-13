// Drive web/rig.html in the installed Google Chrome (via Playwright), measure the
// on-screen frame rate, and screenshot — a visual + perf feedback loop for the
// diorama with NO maplibre/WASM. The rig builds carta straight from the surveyed
// /data/harbors/<id>.json.
//
// Usage:
//   node tools/rig.mjs --port nassau --zoom 0.05 --perf --measure 3 --out tmp/nassau.png
//   node tools/rig.mjs --port havana --tour --out tmp/havana-tour.png
// Flags: --port <id> --zoom <0..1> --perf --tour --still --measure <seconds>
//        --out <png> --headed --settle <ms>
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ADDR = '127.0.0.1:8047';
const BASE = 'http://' + ADDR;

function arg(name, def) { const i = process.argv.indexOf('--' + name); return i >= 0 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true) : def; }
const has = (name) => process.argv.includes('--' + name);

const port = arg('port', 'nassau');
const out = arg('out', join('tmp', `rig-${port}.png`));
const measureS = Number(arg('measure', 0)) || 0;
const settle = Number(arg('settle', 1600));

async function up() { try { const r = await fetch(BASE + '/rig.html'); return r.ok; } catch { return false; } }

async function ensureServer() {
  if (await up()) return null;
  const srv = spawn('go', ['run', './cmd/server', '-addr', ADDR], { cwd: ROOT, stdio: 'ignore' });
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) { if (await up()) return srv; await new Promise((r) => setTimeout(r, 500)); }
  srv.kill(); throw new Error('server did not come up on ' + ADDR);
}

(async () => {
  const srv = await ensureServer();
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: !has('headed'),
    args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist',
      '--enable-webgl', '--disable-features=Vulkan',
      '--disable-gpu-vsync', '--disable-frame-rate-limit'],   // uncap rAF so fps reveals load
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
    page.on('console', (m) => { const t = m.text(); if (/error|fail|warn/i.test(t)) console.log('  [page]', t); });
    page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

    const q = new URLSearchParams({ port });
    if (has('perf')) q.set('perf', '1');
    if (has('tour')) q.set('tour', '1');
    if (has('walk')) q.set('walk', '1');
    if (has('walkanim')) q.set('walkanim', '1');
    if (has('walkembark')) q.set('walkembark', '1');
    if (has('walkprobe')) q.set('walkprobe', '1');
    const wx = arg('wx', null); if (wx != null && wx !== true) q.set('wx', String(wx));
    const wz = arg('wz', null); if (wz != null && wz !== true) q.set('wz', String(wz));
    if (has('still')) q.set('still', '1');
    if (has('facade')) q.set('facade', '1');
    if (has('coast')) q.set('coast', '1');
    if (has('nopom')) q.set('nopom', '1');
    const ps = arg('pomscale', null); if (ps != null && ps !== true) q.set('pomscale', String(ps));
    const hm = arg('hmres', null); if (hm != null && hm !== true) q.set('hmres', String(hm));
    const tb = arg('treebake', null); if (tb != null) q.set('treebake', tb === true ? '1' : String(tb));
    const az = arg('az', null); if (az != null && az !== true) q.set('az', String(az));
    const z = arg('zoom', null); if (z != null && z !== true) q.set('zoom', String(z));

    const t0 = Date.now();
    await page.goto(`${BASE}/rig.html?${q}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 30000 });
    const openMs = Date.now() - t0;   // page load + module eval + scene build
    const err = await page.evaluate(() => window.__error);
    if (err) throw new Error('rig failed:\n' + err);
    await page.waitForTimeout(settle);

    let fpsReport = null;
    if (measureS > 0) {
      const samples = [];
      for (let i = 0; i < measureS * 2; i++) { await page.waitForTimeout(500); samples.push(await page.evaluate(() => window.__fps || 0)); }
      samples.sort((a, b) => a - b);
      fpsReport = { min: samples[0], median: samples[samples.length >> 1], max: samples[samples.length - 1], samples };
    }
    const perf = await page.evaluate(() => window.__perf || null);
    const dbg = await page.evaluate(() => (window.cartaDiorama && window.cartaDiorama._dbg) || null);
    if (dbg) console.log(`  scene: town=${dbg.town} townKids=${dbg.townKids} ships=${dbg.ships}`);
    const obs = await page.evaluate(() => (window.cartaDiorama && window.cartaDiorama._obstacles) || null);
    if (obs) console.log(`  walk obstacles: houses=${obs.houses} streets=${obs.streets} trunks=${obs.trunks}`);
    const wst = await page.evaluate(() => (window.cartaDiorama && window.cartaDiorama._state && window.cartaDiorama._state()) || null);
    if (wst && wst.mode === 'walking') console.log(`  walk state: walker=${wst.hasWalker} canoe=${wst.hasCanoe} parked=${wst.hasParked} embarkE=${wst.embarkE} tweening=${wst.tweening}`);
    const wcyc = await page.evaluate(() => (window.__walkBefore && window.__walkAfter) ? { before: window.__walkBefore, after: window.__walkAfter } : null);
    if (wcyc) console.log(`  walk cycle: walking(embarkE=${wcyc.before.embarkE}) → E → mode=${wcyc.after.mode} canoe=${wcyc.after.hasCanoe} walker=${wcyc.after.hasWalker}`);
    const wpr = await page.evaluate(() => window.__probe || null);
    if (wpr) console.log(`  disembark gate: beach→landing=${wpr.beachLanded} (found=${wpr.beachFound}) · openWater→landing=${wpr.waterLanded} (found=${wpr.waterFound})`);
    const timings = await page.evaluate(() => (window.cartaDiorama && window.cartaDiorama._timings) || window.__dioTimings || null);
    if (timings && Object.keys(timings).length) {
      const order = ['engine', 'terrain_coastbin', 'terrain_bake', 'terrain_hmn', 'terrain', 'town', 'trees', 'ships', 'buildScene', 'openTotal'];
      const ks = Object.keys(timings).sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
      console.log('  build phases (ms): ' + ks.map((k) => `${k}=${timings[k]}`).join('  '));
    }
    const pom = await page.evaluate(() => (window.cartaPOM && window.cartaPOM._patched.length) || 0);
    console.log(`  POM materials patched: ${pom}`);
    // Re-assert the pose AFTER the intro camera tween (~1.1 s) + settle, else it gets
    // clobbered back to the resting overview before the shot. Belt-and-suspenders to
    // the in-page setTimeout (which can fire mid-tween).
    await page.evaluate(({ facade, coast, zoom, az }) => {
      if (facade && window.__frameFacade) window.__frameFacade(az);
      else if (coast && window.__frameCoast) window.__frameCoast(az);
      else if (zoom != null && window.__setZoom) window.__setZoom(zoom);
    }, { facade: has('facade'), coast: has('coast'),
      zoom: (z != null && z !== true) ? parseFloat(z) : null, az: parseFloat((az != null && az !== true) ? az : '35') });
    await page.waitForTimeout(300);
    const fac = await page.evaluate(() => {
      if (!window.__facade) return null;
      const d = window.cartaDiorama, c = d._cam, t = d._controls.target;
      return { f: window.__facade, cam: [c.position.x | 0, c.position.y | 0, c.position.z | 0],
        dist: Math.hypot(c.position.x - t.x, c.position.y - t.y, c.position.z - t.z) | 0 };
    });
    if (fac) console.log(`  facade: block (${fac.f.x},${fac.f.z}) az ${fac.f.az}; cam ${JSON.stringify(fac.cam)} dist ${fac.dist}m`);

    mkdirSync(dirname(join(ROOT, out)), { recursive: true });
    await page.screenshot({ path: join(ROOT, out) });

    console.log(`\nport=${port} zoom=${z ?? 'default'}${has('tour') ? ' tour' : ''} → ${out}`);
    console.log(`  build (load+eval+open) ${openMs} ms`);
    if (perf) console.log(`  draw calls ${perf.calls}  tris ${(perf.triangles / 1000 | 0)}k  cpu ${perf.cpuMs?.toFixed?.(2)}ms  frame med ${perf.median}ms p95 ${perf.p95}ms`);
    if (fpsReport) console.log(`  fps  min ${fpsReport.min}  median ${fpsReport.median}  max ${fpsReport.max}   [${fpsReport.samples.join(' ')}]`);
  } finally {
    await browser.close();
    if (srv) srv.kill();
  }
})().catch((e) => { console.error(e.message || e); process.exit(1); });
