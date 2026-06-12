// Optional headless-gl smoke layer. Auto-skips cleanly when `gl` is not installed
// (it is a devDependencies/optionalDependencies-only native module; build.sh never
// ships it). When present, it proves a real WebGL context can clear + readPixels
// without a GL error — the real-render sanity the zero-dependency core can't give.
//
// NOTE: this layer is intentionally minimal. The full "drive harbordiorama over a
// real renderer" smoke additionally needs the vendored three.module + jsm passes as
// resolvable npm modules; wiring that is a follow-up. This guards the GL substrate.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

export default async function () {
  let createGL;
  try {
    createGL = require('gl');
  } catch {
    console.log('    (gl not installed — skipping real-GL smoke)');
    return { skipped: true, reason: 'gl not installed' };
  }

  const W = 64, H = 64;
  const gl = createGL(W, H, { preserveDrawingBuffer: true });
  if (!gl) throw new Error('gl: failed to create a headless context');

  gl.clearColor(0.2, 0.4, 0.6, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const px = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);

  const err = gl.getError();
  if (err !== gl.NO_ERROR) throw new Error('gl: GL error after clear/readPixels: 0x' + err.toString(16));
  // non-blank sanity: the cleared blue channel should dominate
  if (px[2] < 100) throw new Error('gl: readPixels came back unexpectedly dark (blue=' + px[2] + ')');

  const ext = gl.getExtension('STACKGL_destroy_context');
  if (ext) ext.destroy();
}
