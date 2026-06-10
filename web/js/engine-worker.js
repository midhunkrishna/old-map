/* engine-worker.js — runs the Go sailing engine (WASM) off the main thread.
 *
 * Loads the engine and the precomputed navigable grid once, then answers
 * isochrone (arbitrary sea points) and route queries. Named-port isochrones
 * are served as static files by the page, not here. Computing in a worker
 * keeps the map responsive during the multi-second isochrone solves.
 */
/* global Go, oldmapInit, oldmapIsochrone, oldmapRoute */

importScripts('/wasm_exec.js');

const ready = (async () => {
  const go = new Go();
  // Plain arrayBuffer instantiate (not instantiateStreaming) so it works even
  // when the host serves .wasm without the application/wasm MIME type.
  const [wasmBytes, gridBuf, metaText] = await Promise.all([
    fetch('/oldmap.wasm').then((r) => r.arrayBuffer()),
    fetch('/grid.bin').then((r) => r.arrayBuffer()),
    fetch('/meta.json').then((r) => r.text()),
  ]);
  const { instance } = await WebAssembly.instantiate(wasmBytes, go.importObject);
  go.run(instance); // registers oldmap* globals, then blocks on select{}
  const err = oldmapInit(new Uint8Array(gridBuf), metaText);
  if (err) throw new Error('engine init: ' + err);
})();

self.onmessage = async (e) => {
  const { id, op, args } = e.data;
  try {
    await ready;
    let res;
    if (op === 'isochrone') {
      res = oldmapIsochrone(JSON.stringify(args));
    } else if (op === 'route') {
      res = oldmapRoute(args.fromLon, args.fromLat, args.toLon, args.toLat);
    } else {
      throw new Error('unknown op ' + op);
    }
    self.postMessage({ id, status: res[0], body: res[1] });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message ? err.message : err) });
  }
};
