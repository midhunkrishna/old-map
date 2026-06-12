// Characterize the per-frame updater order (buildScene pushes onto `animated`,
// loop ~1015 iterates `for (a of built.animated) a.update(t, camera)`).
//
// The canonical order is: terrain → town-flutter → trees → ships → poi → birds.
// `built.animated` is internal, so we make the order observable by installing
// lightweight fake collaborators on window. Each registers an updater that, when
// invoked, logs (label, argShapes) into a shared sequence. One tick then yields
// the exact call order and the argument shapes each updater receives.
import { loadDiorama, makeWindow, makeCarta } from '../lib/stubs.mjs';
import { assertSnapshot } from '../lib/assert.mjs';

export default async function () {
  const win = makeWindow();
  const carta = makeCarta();
  const seq = [];

  const shape = (v) => {
    if (v == null) return 'null';
    if (typeof v === 'number') return 'number';
    if (v.isCamera) return 'camera';
    if (typeof v === 'object') return 'object';
    return typeof v;
  };
  const tap = (label, args) => seq.push({ label, args });

  // ---- shipwright (SW): gates BOTH the town and the ships updater ----
  win.cartaShipwright = (THREE) => ({
    materials: () => ({}),
    SYMBOLIC_SCALE: 1,
    LENGTHS: { sloop: 18 },
    shipInstance: () => ({
      // the ships updater (inline in buildScene) calls inst.matrix.copy(m) each tick.
      // We push on EVERY call (not a one-shot flag): the very first loop() runs
      // synchronously inside open() before we clear `seq`, so a latched flag would
      // be consumed there and suppress the real tick. First-occurrence collapse
      // below dedups instead.
      inst: {
        isMesh: false, visible: true, matrixAutoUpdate: true,
        matrix: { copy() { tap('ships', ['matrix']); } },
        traverse(cb) { cb(this); },
      },
      anim: { billow: [], flutter: [] },
    }),
  });

  // ---- town builder: yields a flutter mesh (→ inline town-flutter updater) and a
  // treeField (→ the trees branch). The flutter updater sets flutterMesh.rotation.y. ----
  win.cartaTownBuilder = (THREE, c, mats) => ({
    build: () => {
      const flutterMesh = {
        isMesh: true, userData: { flutter: true },
        rotation: {
          get y() { return 0; },
          set y(v) { tap('town-flutter', ['mesh']); }, // push every set; dedup below
        },
        traverse(cb) { cb(this); },
      };
      const group = {
        children: [flutterMesh], isMesh: false, userData: {},
        traverse(cb) { cb(this); cb(flutterMesh); },
      };
      return { group, treeField: [{ x: 0, z: 0 }], stats: {} };
    },
  });

  // ---- tree system ----
  win.cartaTreeSystem = (THREE, frame) => ({
    init() {},
    group: { traverse() {} },
    update: (cam, camDist) => tap('trees', [shape(cam), shape(camDist)]),
  });

  // ---- POI ----
  win.cartaHarborPOI = (THREE) => ({
    build: () => ({
      setVisible() {},
      update: (cam) => tap('poi', [shape(cam)]),
      dispose() {},
    }),
  });

  // ---- birds ----
  win.cartaHarborBirds = (THREE) => ({
    build: () => ({
      group: { traverse() {} },
      update: (t, focus) => tap('birds', [shape(t), shape(focus)]),
    }),
  });

  const h = await loadDiorama({ win, carta });
  await h.dio.open('lisbon');
  seq.length = 0;          // ignore any updates fired during open's framing
  h.flushFrames(1);        // exactly one tick → one pass over animated[]

  // first-occurrence order (each label fires once per tick)
  const order = [];
  for (const s of seq) if (!order.find((o) => o.label === s.label)) order.push(s);

  assertSnapshot('updater-order', { order });
}
