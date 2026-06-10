/* engine.js — client shim that replaces the old Go HTTP server.
 *
 * The site is now static. Two endpoints still need per-request compute and are
 * answered by the WASM engine in engine-worker.js:
 *   /api/isochrone?lon=&lat=   (arbitrary sea point)   -> worker
 *   /api/route?from=&to=                                -> worker
 * Named-port isochrones (/api/isochrone?port=ID) are precomputed static files
 * served from /iso/ID.json. Everything else is plain static JSON.
 *
 * engineFetch(url, opts) is a near drop-in for fetch() for those URLs: it
 * returns a real Response so callers keep using res.ok / res.status / res.json().
 */
(function () {
  const worker = new Worker('/js/engine-worker.js');
  let seq = 0;
  const pending = new Map();

  worker.onmessage = (e) => {
    const { id, status, body, error } = e.data;
    const p = pending.get(id);
    if (!p) return; // superseded/aborted
    pending.delete(id);
    if (error) p.reject(new Error(error));
    else p.resolve([status, body]);
  };

  function abortError() {
    return new DOMException('The operation was aborted.', 'AbortError');
  }

  // call runs an engine op in the worker. The worker computes synchronously,
  // so an abort can't stop it mid-solve — but it lets the caller stop waiting
  // and discards the eventual result, matching fetch+AbortController semantics.
  function call(op, args, signal) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) return reject(abortError());
      const id = ++seq;
      pending.set(id, { resolve, reject });
      if (signal) {
        signal.addEventListener('abort', () => {
          if (pending.has(id)) {
            pending.delete(id);
            reject(abortError());
          }
        }, { once: true });
      }
      worker.postMessage({ id, op, args });
    });
  }

  async function engineFetch(url, opts) {
    opts = opts || {};
    const u = new URL(url, self.location.origin);
    const signal = opts.signal;

    if (u.pathname === '/api/isochrone') {
      const port = u.searchParams.get('port');
      if (port) {
        // Precomputed: a plain static fetch (instant, CDN-cached).
        return fetch('/iso/' + encodeURIComponent(port) + '.json', { signal });
      }
      const lon = Number(u.searchParams.get('lon'));
      const lat = Number(u.searchParams.get('lat'));
      const [status, bodyText] = await call('isochrone', { lon, lat }, signal);
      return new Response(bodyText, { status, headers: { 'Content-Type': 'application/json' } });
    }

    if (u.pathname === '/api/route') {
      const from = (u.searchParams.get('from') || '').split(',').map(Number);
      const to = (u.searchParams.get('to') || '').split(',').map(Number);
      const [status, bodyText] = await call('route', {
        fromLon: from[0], fromLat: from[1], toLon: to[0], toLat: to[1],
      }, signal);
      return new Response(bodyText, { status, headers: { 'Content-Type': 'application/json' } });
    }

    return fetch(url, opts);
  }

  self.OldmapEngine = { call };
  self.engineFetch = engineFetch;
})();
