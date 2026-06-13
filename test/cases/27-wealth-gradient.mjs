// Building-variety plan — the wealth gradient. A 1730 port is a social ladder, not
// one class of townhouse, so each dwelling gets a tier 1..5 from its port's WEALTH_MIX
// bias, its location class (waterfront/plaza/back), its distance to the civic core, and
// three dhash rolls — deterministic, never Math.random. Tiers 1–3 render as instanced
// humble kits (shanties.js), tier 5 as a fine nation front (townhouses.js).
//
// This guards: (a) the kit registries the build keys off are populated as expected;
// (b) tierFor is deterministic and in range; (c) the per-port humble fraction tracks
// WEALTH_MIX and the gradient responds to class + landmark distance; (d) the new model
// files carry no Math.random (the determinism contract every model file states).
import { makeWindow, loadTown, loadClassic } from '../lib/stubs.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async function () {
  const win = makeWindow();
  const { make: TB } = loadTown(win);                 // → win.cartaTownBuilder + statics
  loadClassic(win, 'js/models/shanties.js');
  loadClassic(win, 'js/models/townhouses.js');
  const reg = win.cartaBuildingModels;

  // (a) the kit registries the wealth pass iterates
  const humble = reg.humbleKits || [];
  if (humble.length !== 8) throw new Error(`humbleKits: expected 8, got ${humble.length}`);
  for (const tier of [1, 2, 3]) if (!humble.some((k) => k.tier === tier)) throw new Error(`humbleKits missing tier ${tier}`);
  if (!humble.some((k) => k.wet)) throw new Error('humbleKits missing a wet (stilt) kit for the waterfront');
  for (const k of humble) if (!k.name || typeof reg.kits[k.name] !== 'function') throw new Error(`humble kit "${k.name}" not registered`);
  const fine = reg.fineKits || [];
  const styles = fine.map((k) => k.style).sort().join(',');
  if (styles !== 'dutch,english,french,spanish') throw new Error(`fineKits styles: ${styles}`);
  for (const k of fine) if (typeof reg.kits[k.name] !== 'function') throw new Error(`fine kit "${k.name}" not registered`);

  // a deterministic spread of points (LCG, never Math.random)
  let s = 99;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pts = [];
  for (let i = 0; i < 4000; i++) pts.push([(rnd() - 0.5) * 0.25 - 9.1, (rnd() - 0.5) * 0.25 + 38.7]);

  // (b) tierFor is deterministic (same args → same tier) and always 1..5
  const clses = ['waterfront', 'plaza', 'back'];
  for (const [lon, lat] of pts) {
    const cls = clses[(rnd() * 3) | 0], aD = rnd() < 0.3 ? rnd() * 200 : Infinity;
    const t = TB.tierFor('nassau', lon, lat, cls, aD);
    if (t !== TB.tierFor('nassau', lon, lat, cls, aD)) throw new Error(`tierFor non-deterministic at ${lon},${lat}`);
    if (!(t >= 1 && t <= 5)) throw new Error(`tier out of range: ${t}`);
  }

  // (c) per-port mix. A back lane far from any landmark rolls humble at ≈ WEALTH_MIX+0.04
  // (the back-lane bias), and the gradient responds: a fine address by the square (plaza,
  // 15 m from the core) is far less humble than that back lane — for every port.
  const fracHumble = (harbor, cls, aD) => {
    let h = 0;
    for (const [lon, lat] of pts) if (TB.tierFor(harbor, lon, lat, cls, aD) <= 3) h++;
    return h / pts.length;
  };
  for (const harbor of Object.keys(TB.WEALTH_MIX)) {
    const expect = Math.min(0.95, Math.max(0.03, TB.WEALTH_MIX[harbor] + 0.04));
    const back = fracHumble(harbor, 'back', Infinity);
    if (Math.abs(back - expect) > 0.05) throw new Error(`${harbor}: back-lane humble ${back.toFixed(2)} vs expected ${expect.toFixed(2)}`);
    const core = fracHumble(harbor, 'plaza', 15);
    if (!(core < back - 0.15)) throw new Error(`${harbor}: gradient flat — plaza-core humble ${core.toFixed(2)} not below back ${back.toFixed(2)}`);
  }

  // (d) the model files are deterministic — no Math.random in the geometry
  for (const f of ['web/js/models/shanties.js', 'web/js/models/townhouses.js']) {
    if (/Math\.random\s*\(/.test(readFileSync(join(process.cwd(), f), 'utf8'))) throw new Error(`${f} uses Math.random (must be deterministic)`);
  }

  console.log(`[27] wealth gradient: 8 humble + 4 fine kits registered; tierFor deterministic over ${pts.length} pts; per-port mix tracks WEALTH_MIX (e.g. nassau back ${fracHumble('nassau', 'back', Infinity).toFixed(2)}, havana ${fracHumble('havana', 'back', Infinity).toFixed(2)}); no Math.random`);
}
