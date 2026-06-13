// parallax_occulusion.md Phase 1a — the painter determinism refactor. The four
// POM painters (facade/roof/masonry/street) now draw from a per-painter seeded LCG
// instead of Math.random, so a build's weathering strokes are reproducible — the
// prerequisite for the relief canvas (Phase 1c) to mirror the albedo. This case
// records the actual canvas draw stream of two independent builds and asserts they
// are byte-identical, and checks the LCG seeding directly.
import { makeWindow, loadTown } from '../lib/stubs.mjs';

function recordingBuild() {
  const win = makeWindow();
  const log = [];
  const origCreate = win.document.createElement;
  win.document.createElement = (tag) => {
    const el = origCreate(tag);
    if (tag === 'canvas') {
      el.getContext = () => new Proxy({}, {
        get(t, p) {
          if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
          if (p === 'measureText') return () => ({ width: 10 });
          return (...a) => { log.push(String(p) + '(' + a.map((v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)).join(',') + ')'); };
        },
        set(t, p, v) { log.push(String(p) + '=' + v); return true; },
      });
    }
    return el;
  };
  const { make, THREE } = loadTown(win);
  const town = make(THREE, {}, {});
  // run each POM painter once (cache miss → it paints into the recording context)
  town._paint.facadeTexture('french', 2, '');
  town._paint.roofTexture('dutch');
  town._paint.roofTexture('english');   // the shingle weathering branch (uses rand)
  town._paint.masonryTexture();
  town._paint.streetTexture('spanish');
  town._paint.streetTexture('french');  // the sand/gravel branch (uses rand)
  return { log, paint: town._paint };
}

export default async function () {
  const a = recordingBuild();
  const b = recordingBuild();

  // (1) the seeded LCG is deterministic for a key and distinct across keys
  const seq = (rand) => { const out = []; for (let i = 0; i < 6; i++) out.push(rand()); return out; };
  const s1 = seq(a.paint.lcg('facade-french2'));
  const s2 = seq(a.paint.lcg('facade-french2'));
  if (JSON.stringify(s1) !== JSON.stringify(s2)) throw new Error('lcg not deterministic for the same key');
  const s3 = seq(a.paint.lcg('roof-dutch'));
  if (JSON.stringify(s1) === JSON.stringify(s3)) throw new Error('lcg gives the same stream for different keys');
  for (const v of s1) if (!(v >= 0 && v < 1)) throw new Error(`lcg out of [0,1): ${v}`);

  // (2) the painter draw streams are byte-identical across two independent builds
  if (a.log.length < 50) throw new Error(`too few recorded strokes (${a.log.length}) — painters not exercised`);
  if (a.log.length !== b.log.length) throw new Error(`stroke count diverged: ${a.log.length} vs ${b.log.length}`);
  for (let i = 0; i < a.log.length; i++) {
    if (a.log[i] !== b.log[i]) throw new Error(`painter stroke ${i} diverged across builds:\n  ${a.log[i]}\n  ${b.log[i]}`);
  }

  console.log(`[25] painter streams byte-identical across builds (${a.log.length} ops); lcg deterministic`);
}
