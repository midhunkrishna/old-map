// Characterize the radius-derived rig over TWO ports with distinct footprints
// (buildScene ~490-515): every radius* constant + sunDir + shadow cam + fog.
import { loadDiorama, lightRig } from '../lib/stubs.mjs';
import { assertSnapshot } from '../lib/assert.mjs';

function snapshotPort(h) {
  const dio = h.dio;
  const cam = dio._cam;
  const controls = dio._controls;
  const scene = h.scene();
  const { sun, hemi, fog } = lightRig(scene);
  return {
    radius: dio._frame.radius,
    controls: { min: controls.minDistance, max: controls.maxDistance },
    camera: { near: cam.near, far: cam.far },
    sunPos: [sun.position.x, sun.position.y, sun.position.z],
    sunDir: [dio._sunDir.x, dio._sunDir.y, dio._sunDir.z],
    sunIntensity: sun.intensity,
    shadowCam: {
      l: sun.shadow.camera.left, r: sun.shadow.camera.right,
      t: sun.shadow.camera.top, b: sun.shadow.camera.bottom,
      near: sun.shadow.camera.near, far: sun.shadow.camera.far,
    },
    shadowMap: [sun.shadow.mapSize.width, sun.shadow.mapSize.height],
    shadowBias: sun.shadow.bias,
    hemiIntensity: hemi.intensity, // env ON → 0.5
    fog: [fog.near, fog.far],
  };
}

export default async function () {
  const h = await loadDiorama();
  await h.dio.open('lisbon');
  const lisbon = snapshotPort(h);
  await h.dio.open('porto'); // distinct, larger footprint → distinct radius
  const porto = snapshotPort(h);

  // sanity: the two ports MUST yield distinct radii (proves the rig scales)
  if (lisbon.radius === porto.radius) {
    throw new Error('radius-rig: lisbon and porto produced identical radii — fixtures not distinct');
  }
  assertSnapshot('radius-rig', { lisbon, porto });
}
