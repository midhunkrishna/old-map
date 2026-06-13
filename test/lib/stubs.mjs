// Stub host for driving the UNMODIFIED web/js/harbordiorama.js fully headless.
//
// The critical trick: harbordiorama.js does 5 dynamic import('/vendor/...') calls
// that Node cannot resolve. The loader below reads the source, rewrites those 5
// call sites to `globalThis.__imp('three'|'orbit'|'composer'|'renderpass'|'bloom')`,
// then evaluates the rewritten source as an ES module under node's
// --experimental-vm-modules (vm.SourceTextModule) inside a sandbox whose globals
// are these stubs. window.cartaInits collects the IIFE; we call its initDiorama
// with a carta stub and return window.cartaDiorama.
//
// Everything here is a RECORDING fake: constructor opts, setter values, and call
// counts are captured on the objects so characterization cases can snapshot them.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const DIORAMA_SRC = join(REPO_ROOT, 'web', 'js', 'harbordiorama.js');
const TERRAIN_SRC = join(REPO_ROOT, 'web', 'js', 'harborterrain.js');
const ENGINE_SRC = join(REPO_ROOT, 'web', 'js', 'render', 'engine.js');
const LOD_SRC = join(REPO_ROOT, 'web', 'js', 'render', 'lod.js');

/* ---------------- minimal real-enough math ---------------- */

export class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  normalize() {
    const l = Math.hypot(this.x, this.y, this.z) || 1;
    this.x /= l; this.y /= l; this.z /= l; return this;
  }
  setFromSpherical(s) {
    const sinPhi = Math.sin(s.phi);
    this.x = s.radius * sinPhi * Math.sin(s.theta);
    this.y = s.radius * Math.cos(s.phi);
    this.z = s.radius * sinPhi * Math.cos(s.theta);
    return this;
  }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
}
export class Vector2 { constructor(x = 0, y = 0) { this.x = x; this.y = y; } set(x, y) { this.x = x; this.y = y; return this; } }
export class Vector4 { constructor(x = 0, y = 0, z = 0, w = 0) { this.x = x; this.y = y; this.z = z; this.w = w; } }
export class Color {
  constructor(r, g, b) {
    if (g === undefined) { this.c = r; this.r = 0; this.g = 0; this.b = 0; }
    else { this.r = r; this.g = g; this.b = b; }
  }
  set(r, g, b) { if (g === undefined) { this.c = r; } else { this.r = r; this.g = g; this.b = b; } return this; }
  copy(o) { this.r = o.r; this.g = o.g; this.b = o.b; this.c = o.c; return this; }
  lerp(o, t) { this.r += (o.r - this.r) * t; this.g += (o.g - this.g) * t; this.b += (o.b - this.b) * t; return this; }
  clone() { const c = new Color(); return c.copy(this); }
  multiplyScalar(s) { this.r *= s; this.g *= s; this.b *= s; return this; }
  addScalar(s) { this.r += s; this.g += s; this.b += s; return this; }
  add(o) { this.r += o.r; this.g += o.g; this.b += o.b; return this; }
  multiply(o) { this.r *= o.r; this.g *= o.g; this.b *= o.b; return this; }
  setScalar(s) { this.r = this.g = this.b = s; return this; }
  setHSL(h, s, l) { this._hsl = { h, s, l }; return this; }
  offsetHSL() { return this; }
  getHSL(t) { t = t || {}; t.h = 0; t.s = 0; t.l = 0; return t; }
  convertSRGBToLinear() { return this; }
}
export class Spherical { constructor(radius = 1, phi = 0, theta = 0) { this.radius = radius; this.phi = phi; this.theta = theta; } }
export class Quaternion { constructor() {} setFromEuler() { return this; } setFromAxisAngle() { return this; } setFromUnitVectors() { return this; } }
export class Euler { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } }
export class Sphere { constructor(center, radius) { this.center = center; this.radius = radius; } }

/* ---------------- 2D canvas context: permissive recording Proxy ---------------- */

function make2dContext() {
  const target = {
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    measureText() { return { width: 10 }; },
    getImageData() { return { data: new Uint8ClampedArray(4) }; },
    createImageData() { return { data: new Uint8ClampedArray(4) }; },
  };
  return new Proxy(target, {
    get(t, p) {
      if (p in t) return t[p];
      // every unknown property is a no-op callable (covers fillRect, beginPath, ...)
      return () => {};
    },
    set() { return true; }, // record-and-ignore property sets (fillStyle, font, ...)
  });
}

/* ---------------- element stubs ---------------- */

function makeClassList() {
  const s = new Set();
  return {
    _s: s,
    add(...c) { c.forEach((x) => s.add(x)); },
    remove(...c) { c.forEach((x) => s.delete(x)); },
    toggle(c, on) {
      if (on === undefined) { s.has(c) ? s.delete(c) : s.add(c); return s.has(c); }
      on ? s.add(c) : s.delete(c); return on;
    },
    contains(c) { return s.has(c); },
  };
}

// Element stubs RECORD addEventListener calls by type so the harness can invoke
// e.g. the 'resize' / 'keydown' / 'click' callbacks directly.
function makeEl(tag, win) {
  const listeners = {};
  const classList = makeClassList();
  const el = {
    tagName: String(tag).toUpperCase(),
    nodeName: String(tag).toUpperCase(),
    style: new Proxy({}, { get(t, p) { return t[p] ?? ''; }, set(t, p, v) { t[p] = v; return true; } }),
    // className mirrors classList both ways (as in the DOM): assigning the string
    // rebuilds the token set, and reading it joins the current tokens.
    get className() { return [...classList._s].join(' '); },
    set className(v) { classList._s.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => classList._s.add(c)); },
    id: '', textContent: '', innerHTML: '', title: '',
    width: 0, height: 0, offsetWidth: 1, offsetHeight: 1,
    dataset: {},
    _kids: [],
    _listeners: listeners,
    classList,
    setAttribute(k, v) { this[k] = v; },
    getAttribute(k) { return this[k]; },
    getBoundingClientRect() { return { x: 0, y: 0, top: 0, left: 0, right: win.innerWidth, bottom: win.innerHeight, width: win.innerWidth, height: win.innerHeight }; },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener(type, fn) {
      const a = listeners[type]; if (!a) return;
      const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1);
    },
    dispatch(type, ev) { (listeners[type] || []).forEach((fn) => fn(ev || {})); },
    appendChild(k) { this._kids.push(k); return k; },
    append(...k) { this._kids.push(...k); },
    remove() {},
    getContext() { return make2dContext(); },
    requestPointerLock() { win.document.pointerLockElement = this; },
    cloneNode() { return makeEl(tag, win); },
  };
  return el;
}

function makeCanvas(win) {
  const el = makeEl('canvas', win);
  el.getContext = (kind) => (kind === '2d' ? make2dContext() : null);
  return el;
}

/* ---------------- window/document factory ---------------- */

export function makeWindow() {
  const win = {};
  let perfT = 0;
  const winListeners = {};
  const docListeners = {};
  const rafQueue = [];

  win.innerWidth = 1280;
  win.innerHeight = 720;
  win.devicePixelRatio = 2; // proves the min(dpr, 1.8) cap
  win.window = win;
  win.globalThis = win;
  win.console = console;
  win.Math = Math;
  win.Float32Array = Float32Array;
  win.Uint8ClampedArray = Uint8ClampedArray;
  win.Set = Set;
  win.Map = Map;

  win._winListeners = winListeners;
  win._docListeners = docListeners;
  win._rafQueue = rafQueue;

  win.performance = { now: () => perfT };
  win._advance = (ms) => { perfT += ms; return perfT; };
  win._setNow = (ms) => { perfT = ms; };

  win.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
  win.cancelAnimationFrame = () => { win._rafCancels = (win._rafCancels || 0) + 1; };
  win._rafCancels = 0;
  // Flush N animation-frame passes (each pass drains the queue snapshot, advancing
  // the clock 16ms per frame so dt is well-defined).
  win.flushFrames = (n = 1) => {
    for (let i = 0; i < n; i++) {
      win._advance(16);
      const batch = rafQueue.splice(0, rafQueue.length);
      for (const cb of batch) cb(win.performance.now());
    }
  };

  win.setTimeout = (fn) => { win._timers = win._timers || []; win._timers.push(fn); return win._timers.length; };
  win.clearTimeout = () => {};

  win.addEventListener = (type, fn) => { (winListeners[type] = winListeners[type] || []).push(fn); };
  win.removeEventListener = (type, fn) => {
    const a = winListeners[type]; if (!a) return;
    const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1);
  };
  // Invoke a recorded window listener by type.
  win.fireWindow = (type, ev) => { (winListeners[type] || []).forEach((fn) => fn(ev || {})); };

  const headEl = makeEl('head', win);
  const bodyEl = makeEl('body', win);
  win.document = {
    head: headEl,
    body: bodyEl,
    pointerLockElement: null,
    createElement: (tag) => (tag === 'canvas' ? makeCanvas(win) : makeEl(tag, win)),
    addEventListener: (type, fn) => { (docListeners[type] = docListeners[type] || []).push(fn); },
    removeEventListener: (type, fn) => {
      const a = docListeners[type]; if (!a) return;
      const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1);
    },
    exitPointerLock() { win.document.pointerLockElement = null; },
  };
  win.fireDocument = (type, ev) => { (docListeners[type] || []).forEach((fn) => fn(ev || {})); };

  return win;
}

/* ---------------- recording fake THREE ---------------- */

export function makeThree(rec) {
  rec = rec || {};
  rec.renderer = rec.renderer || {};
  rec.renderCount = 0;
  rec.composers = rec.composers || [];

  class WebGLRenderer {
    constructor(opts) {
      this.opts = { ...opts }; delete this.opts.canvas; // canvas is a stub object; keep config only
      rec.renderer.opts = this.opts;
      this.shadowMap = {};
      this.outputColorSpace = null;
      this._disposed = 0;
      rec.rendererInstance = this;
    }
    setPixelRatio(p) { this.pixelRatio = p; rec.renderer.pixelRatio = p; }
    setSize(w, h) { this.size = [w, h]; rec.renderer.size = [w, h]; }
    render(scene, camera) {
      this.renderCount = (this.renderCount || 0) + 1; rec.renderCount++;
      if (scene) rec.lastRenderedScene = scene;
      if (camera) rec.lastRenderedCamera = camera;
    }
    dispose() { this._disposed++; rec.renderer.disposed = (rec.renderer.disposed || 0) + 1; }
  }

  class Scene {
    constructor() { this.children = []; this.environment = null; this.background = null; this.fog = null; }
    add(o) { this.children.push(o); return this; }
    remove(o) { const i = this.children.indexOf(o); if (i >= 0) this.children.splice(i, 1); }
    traverse(cb) {
      cb(this);
      for (const c of this.children) (c && c.traverse ? c.traverse(cb) : cb(c));
    }
  }

  class PerspectiveCamera {
    constructor(fov, aspect, near, far) {
      this.fov = fov; this.aspect = aspect; this.near = near; this.far = far;
      this.position = new Vector3();
      this.isCamera = true;
      this.updateCount = 0;
      if (!rec.cameraConstruct) rec.cameraConstruct = { fov, aspect, near, far };
    }
    updateProjectionMatrix() { this.updateCount++; rec.cameraUpdates = (rec.cameraUpdates || 0) + 1; }
    lookAt() {}
  }

  class DirectionalLight {
    constructor(color, intensity) {
      this.isDirectionalLight = true;
      this.color = color; this.intensity = intensity;
      this.position = new Vector3();
      this.castShadow = false;
      this.shadow = {
        camera: { left: 0, right: 0, top: 0, bottom: 0, near: 0, far: 0 },
        mapSize: { x: 0, y: 0, width: 0, height: 0, set(w, h) { this.x = this.width = w; this.y = this.height = h; } },
        bias: 0,
      };
    }
  }

  class HemisphereLight {
    constructor(sky, ground, intensity) {
      this.isHemisphereLight = true;
      this.skyColor = sky; this.groundColor = ground; this.intensity = intensity;
    }
  }

  class Fog { constructor(color, near, far) { this.isFog = true; this.color = color; this.near = near; this.far = far; } }

  class PMREMGenerator {
    constructor(r) { this.renderer = r; this._disposed = 0; }
    fromEquirectangular(tex) { rec.pmremSource = tex; return { texture: { isTexture: true, _pmrem: true } }; }
    dispose() { this._disposed++; }
  }

  class CanvasTexture {
    constructor(source) {
      this.image = source;
      // record the gradient canvas dimensions (case env-pmrem asserts 8x64)
      this.sourceW = source && source.width;
      this.sourceH = source && source.height;
      this.mapping = null;
      this.wrapS = 0; this.wrapT = 0;
      this.repeat = new Vector2(1, 1);
      this.offset = new Vector2(0, 0);
      this.colorSpace = null;
      this.needsUpdate = false;
      // the very FIRST CanvasTexture is the diorama env gradient (8x64); later ones
      // (terrain hill cloth, 512x512) must not clobber that record.
      if (!rec.canvasTexture) rec.canvasTexture = { w: this.sourceW, h: this.sourceH };
    }
    dispose() {}
  }

  // Real-backed buffer attribute over a Float32Array (count vertices, itemSize=3),
  // so getX/getY/getZ/setX/setY/setZ work like Three's. Needed by the REAL terrain
  // build (case 5 real variant), which reads neighbour vertices, normals, etc.
  function makeAttr(count, itemSize) {
    const array = new Float32Array(count * itemSize);
    return {
      count, itemSize, array, needsUpdate: false,
      getX(i) { return array[i * itemSize]; },
      getY(i) { return array[i * itemSize + 1]; },
      getZ(i) { return array[i * itemSize + 2]; },
      setX(i, v) { array[i * itemSize] = v; return this; },
      setY(i, v) { array[i * itemSize + 1] = v; return this; },
      setZ(i, v) { array[i * itemSize + 2] = v; return this; },
      setXYZ(i, x, y, z) { array[i * itemSize] = x; array[i * itemSize + 1] = y; array[i * itemSize + 2] = z; return this; },
      setUsage() { return this; },
    };
  }

  // geometry: count disposes; carry real position + normal attributes so both the
  // placeholder terrain AND the real cartaTerrain land/water grids run headless.
  // `segs` is the (segX,segZ) for grid geometries; vertex count is (segX+1)(segZ+1).
  function makeGeometry(name, segX, segZ) {
    const sx = (segX | 0) || 1, sz = (segZ | 0) || 1;
    const count = (sx + 1) * (sz + 1);
    const attrs = { position: makeAttr(count, 3), normal: makeAttr(count, 3) };
    // a real-enough index (values irrelevant headless, but .array supports the
    // winding-flip .reverse() in the tree skirt builder, and .count/.getX feed
    // mergeGeos). setIndex() may later replace it with a plain merged array.
    const idxCount = 6 * sx * sz;
    const indexArr = new Uint16Array(idxCount);
    return {
      _geo: name,
      attributes: attrs,
      userData: {},
      boundingSphere: null,
      index: { array: indexArr, count: idxCount, getX(i) { return indexArr[i]; } },
      setAttribute(k, a) { attrs[k] = a; return this; },
      getAttribute(k) { return attrs[k]; },
      deleteAttribute(k) { delete attrs[k]; return this; },
      setIndex(idx) { this.index = idx; return this; },
      computeVertexNormals() {},
      computeBoundingSphere() {},
      computeBoundingBox() {},
      applyMatrix4() { return this; },
      applyQuaternion() { return this; },
      center() { return this; },
      clone() { return makeGeometry(name, sx, sz); },
      toNonIndexed() { return this; },
      rotateX() { return this; },
      rotateY() { return this; },
      rotateZ() { return this; },
      translate() { return this; },
      scale() { return this; },
      dispose() { rec.geometryDisposes = (rec.geometryDisposes || 0) + 1; },
    };
  }

  class Matrix4 {
    set() { return this; }
    multiplyMatrices() { return this; }
    fromArray() { return this; }
    makeTranslation() { return this; }
    makeScale() { return this; }
    makeRotationX() { return this; }
    makeRotationY() { return this; }
    makeRotationZ() { return this; }
    makeRotationFromQuaternion() { return this; }
    compose() { return this; }
    setPosition() { return this; }
    multiply() { return this; }
    premultiply() { return this; }
    copy() { return this; }
    identity() { return this; }
    clone() { return new Matrix4(); }
  }

  function makeObject3D(extra) {
    return {
      children: [], isMesh: false, isInstancedMesh: false,
      position: new Vector3(), rotation: { x: 0, y: 0, z: 0 }, scale: new Vector3(1, 1, 1),
      userData: {}, visible: true, matrixAutoUpdate: true,
      matrix: new Matrix4(),
      add(o) { this.children.push(o); return this; },
      remove(o) { const i = this.children.indexOf(o); if (i >= 0) this.children.splice(i, 1); },
      traverse(cb) { cb(this); for (const c of this.children) (c && c.traverse ? c.traverse(cb) : cb(c)); },
      ...extra,
    };
  }

  const THREE = {
    WebGLRenderer, Scene, PerspectiveCamera,
    DirectionalLight, HemisphereLight, Fog,
    PMREMGenerator, CanvasTexture,
    Color, Vector2, Vector3, Vector4, Spherical, Matrix4, Quaternion, Euler, Sphere,
    // Frustum stub: never culls (intersectsSphere → true), so the tree system's
    // band membership in case 16 depends only on distance/rank/caps — deterministic.
    Frustum: function () { return { setFromProjectionMatrix() { return this; }, intersectsSphere() { return true; } }; },
    Group: function () { return makeObject3D(); },
    Mesh: function (geometry, material) { return makeObject3D({ isMesh: true, geometry, material, castShadow: false, receiveShadow: false }); },
    InstancedMesh: function (geometry, material, count) { return makeObject3D({ isInstancedMesh: true, geometry, material, count, setMatrixAt() {}, setColorAt() {}, instanceMatrix: { needsUpdate: false, setUsage() { return this; } }, instanceColor: { needsUpdate: false, setUsage() { return this; } } }); },
    Points: function (geometry, material) { return makeObject3D({ isPoints: true, geometry, material }); },
    BufferGeometry: function () { return makeGeometry('Buffer', 1, 1); },
    CircleGeometry: function (r, seg) { return makeGeometry('Circle', seg, 1); },
    PlaneGeometry: function (w, d, sx, sz) { return makeGeometry('Plane', sx, sz); },
    BoxGeometry: function () { return makeGeometry('Box', 1, 1); },
    SphereGeometry: function () { return makeGeometry('Sphere', 1, 1); },
    IcosahedronGeometry: function () { return makeGeometry('Icosa', 1, 1); },
    CylinderGeometry: function () { return makeGeometry('Cylinder', 1, 1); },
    TorusGeometry: function () { return makeGeometry('Torus', 1, 1); },
    ConeGeometry: function () { return makeGeometry('Cone', 1, 1); },
    BufferAttribute: function (array, itemSize) {
      this.array = array; this.itemSize = itemSize; this.needsUpdate = false;
      this.count = array && itemSize ? array.length / itemSize : 0;
      this.getX = (i) => array[i * itemSize]; this.getY = (i) => array[i * itemSize + 1]; this.getZ = (i) => array[i * itemSize + 2];
      this.setX = (i, v) => { array[i * itemSize] = v; return this; };
      this.setY = (i, v) => { array[i * itemSize + 1] = v; return this; };
      this.setZ = (i, v) => { array[i * itemSize + 2] = v; return this; };
      this.setXYZ = (i, x, y, z) => { array[i * itemSize] = x; array[i * itemSize + 1] = y; array[i * itemSize + 2] = z; return this; };
      this.setUsage = () => this;
    },
    Float32BufferAttribute: function (array, itemSize) {
      this.array = array; this.itemSize = itemSize; this.needsUpdate = false;
      this.count = array && itemSize ? array.length / itemSize : 0;
      this.getX = (i) => array[i * itemSize]; this.getY = (i) => array[i * itemSize + 1]; this.getZ = (i) => array[i * itemSize + 2];
      this.setX = (i, v) => { array[i * itemSize] = v; return this; };
      this.setY = (i, v) => { array[i * itemSize + 1] = v; return this; };
      this.setZ = (i, v) => { array[i * itemSize + 2] = v; return this; };
      this.setXYZ = (i, x, y, z) => { array[i * itemSize] = x; array[i * itemSize + 1] = y; array[i * itemSize + 2] = z; return this; };
      this.setUsage = () => this;
    },
    DataTexture: function () { return { isTexture: true, needsUpdate: false, dispose() {} }; },
    MeshLambertMaterial: function (o) { return { ...o, isMaterial: true, dispose() { rec.materialDisposes = (rec.materialDisposes || 0) + 1; } }; },
    // NOTE: the placeholder terrain's water uses MeshPhongMaterial, and harbordiorama
    // reads water.material.uniforms.uShine/.uSunDir unconditionally inside its guards
    // (lines ~380, ~528). Real Three's PhongMaterial has no `uniforms`; to exercise the
    // SAME code path headless without throwing we give it an empty uniforms object, so
    // the `.uShine`/`.uSunDir` lookups resolve to undefined (falsy) and the guards skip.
    MeshPhongMaterial: function (o) { return { ...o, isMaterial: true, uniforms: {}, dispose() {} }; },
    MeshBasicMaterial: function (o) { return { ...o, isMaterial: true, dispose() {} }; },
    MeshStandardMaterial: function (o) { return { ...o, isMaterial: true, dispose() {} }; },
    // real terrain water uses ShaderMaterial: preserve uniforms verbatim (the seam case 5-real reads)
    ShaderMaterial: function (o) { return { ...o, isMaterial: true, dispose() {} }; },
    PointsMaterial: function (o) { return { ...o, isMaterial: true, dispose() {} }; },
    // constants
    EquirectangularReflectionMapping: 301,
    SRGBColorSpace: 'srgb',
    LinearSRGBColorSpace: 'srgb-linear',
    PCFSoftShadowMap: 2,
    DoubleSide: 2,
    FrontSide: 0,
    BackSide: 1,
    AdditiveBlending: 2,
    RGBAFormat: 1023,
    RedFormat: 1028,
    RGFormat: 1030,
    FloatType: 1015,
    UnsignedByteType: 1009,
    NearestFilter: 1003,
    LinearFilter: 1006,
    ClampToEdgeWrapping: 1001,
    RepeatWrapping: 1000,
    DynamicDrawUsage: 35048,
    StaticDrawUsage: 35044,
  };
  THREE._rec = rec;
  return THREE;
}

/* ---------------- fake OrbitControls / PostFX ---------------- */

export function makeOrbitControls(rec) {
  return class OrbitControls {
    constructor(camera, dom) {
      this.object = camera; this.domElement = dom;
      this.target = new Vector3();
      this.enabled = true;
      this.updateCount = 0;
    }
    update() { this.updateCount++; rec.orbitUpdates = (rec.orbitUpdates || 0) + 1; }
  };
}

export function makePostFX(rec) {
  rec.composers = rec.composers || [];
  class EffectComposer {
    constructor(renderer) {
      this.renderer = renderer; this.passes = []; this.renderCount = 0; this._disposed = 0;
      rec.composers.push(this);
      rec.lastComposer = this;
    }
    setSize(w, h) { this.size = [w, h]; }
    addPass(p) { this.passes.push(p); }
    render() { this.renderCount++; rec.composerRenderCount = (rec.composerRenderCount || 0) + 1; }
    dispose() { this._disposed++; rec.composerDisposes = (rec.composerDisposes || 0) + 1; }
  }
  class RenderPass { constructor(scene, camera) { this.scene = scene; this.camera = camera; this.isRenderPass = true; } }
  class UnrealBloomPass {
    constructor(resolution, strength, radius, threshold) {
      this.resolution = resolution;
      this.strength = strength; this.radius = radius; this.threshold = threshold;
      this.params = [strength, radius, threshold];
      this.isBloomPass = true;
    }
  }
  return { EffectComposer, RenderPass, UnrealBloomPass };
}

/* ---------------- carta stub factory ---------------- */

// Two ports with DISTINCT land footprints → two distinct radii (radius-rig case).
// 'porto' is larger than 'lisbon'. Both carry a 'land' ring so portCentroid and
// footprintRadius produce real numbers; harborStructures.lands matches harbor ids.
export function makeCarta(overrides = {}) {
  const lisbonRing = [[-9.16, 38.69], [-9.12, 38.69], [-9.12, 38.72], [-9.16, 38.72], [-9.16, 38.69]];
  const portoRing = [[-8.70, 41.13], [-8.58, 41.13], [-8.58, 41.20], [-8.70, 41.20], [-8.70, 41.13]];
  const carta = {
    gfx: { tier: 3 },
    reducedMotion: { matches: true }, // synchronous (no rAF tween chains) open path
    map: {
      getCenter: () => ({ lng: -9.14, lat: 38.7 }),
      getBearing: () => 0,
      getZoom: () => 12,
      on() {},
      getCanvas: () => ({ width: 800, height: 600 }),
    },
    bus: {
      _emits: [],
      emit(e, ...a) { this._emits.push(e); },
      on() {},
    },
    harborPlans: {
      lisbon: { features: [{ properties: { kind: 'land' }, geometry: { type: 'Polygon', coordinates: [lisbonRing] } }] },
      porto: { features: [{ properties: { kind: 'land' }, geometry: { type: 'Polygon', coordinates: [portoRing] } }] },
    },
    harborBoxes: [
      { id: 'lisbon', title: 'Lisbon', w: -9.16, e: -9.12, s: 38.69, n: 38.72 },
      { id: 'porto', title: 'Porto', w: -8.70, e: -8.58, s: 41.13, n: 41.20 },
    ],
    harborStructures: {
      lands: [
        { properties: { harbor: 'lisbon', kind: 'land' }, geometry: { type: 'Polygon', coordinates: [lisbonRing] } },
        { properties: { harbor: 'porto', kind: 'land' }, geometry: { type: 'Polygon', coordinates: [portoRing] } },
      ],
      blocks: [], forts: [], points: [], streets: [], greens: [], canals: [], wharves: [],
    },
    harborShips: [
      { harbor: 'lisbon', type: 'sloop', lngLat: [-9.14, 38.70], heading: 30 },
    ],
    showCard() {},
    hideCard() {},
    ...overrides,
  };
  return carta;
}

/* ---------------- the loader ---------------- */

// Read harbordiorama.js, rewrite the 5 /vendor dynamic import() call sites to the
// in-memory fakes, evaluate as an ES module in a vm sandbox built on `win`, run
// the registered initDiorama with `carta`, and return window.cartaDiorama plus the
// recording handle and helpers.
export async function loadDiorama({ carta, rec, win, lodfade } = {}) {
  const opts = { lodfade };
  rec = rec || {};
  win = win || makeWindow();
  carta = carta || makeCarta();

  const THREE = makeThree(rec);
  const OrbitControls = makeOrbitControls(rec);
  const PostFX = makePostFX(rec);

  win.__imp = async (which) => {
    if (which === 'three') return THREE;
    if (which === 'orbit') return { OrbitControls };
    if (which === 'composer') return { EffectComposer: PostFX.EffectComposer };
    if (which === 'renderpass') return { RenderPass: PostFX.RenderPass };
    if (which === 'bloom') return { UnrealBloomPass: PostFX.UnrealBloomPass };
    throw new Error('unknown import ' + which);
  };

  win.cartaInits = win.cartaInits || [];

  let src = readFileSync(DIORAMA_SRC, 'utf8');
  src = rewriteImports(src);

  const context = vm.createContext(win);

  // The rendering engine (web/js/render/engine.js) is a classic, non-module sync IIFE
  // that assigns window.cartaRenderEngine and has NO /vendor imports. In the browser a
  // <script> tag loads it before harbordiorama.js; here we evaluate it into the SAME
  // sandbox (like the real cartaTerrain below) so window.cartaRenderEngine exists when
  // the host's ensureEngine() runs on open(). Behaviour-neutral: it only loads the
  // real production engine the host now delegates to — no stub, no rewrite.
  const engineScript = new vm.Script(readFileSync(ENGINE_SRC, 'utf8'), { filename: 'engine.js' });
  engineScript.runInContext(context);

  // Optionally publish the real transition layer (window.cartaLodFade) into the same
  // sandbox before the host runs, exactly as the <script> include does in the page,
  // so the ships updater takes its dither cross-fade path (clod.md §5.3).
  if (opts.lodfade) {
    new vm.Script(readFileSync(LOD_SRC, 'utf8'), { filename: 'lod.js' }).runInContext(context);
    new vm.Script(readFileSync(join(REPO_ROOT, 'web', 'js', 'lodfade.js'), 'utf8'), { filename: 'lodfade.js' }).runInContext(context);
  }

  const mod = new vm.SourceTextModule(src, { identifier: 'harbordiorama.js', context });
  await mod.link(() => { throw new Error('no static imports expected in harbordiorama.js'); });
  await mod.evaluate();

  const init = win.cartaInits.find((f) => typeof f === 'function');
  if (!init) throw new Error('initDiorama was not registered on window.cartaInits');
  init(carta);

  const dio = win.cartaDiorama;
  if (!dio) throw new Error('window.cartaDiorama not exposed');

  return {
    dio, win, carta, rec, THREE, OrbitControls, PostFX,
    flushFrames: (n) => win.flushFrames(n),
    fireWindow: (type, ev) => win.fireWindow(type, ev),
    fireDocument: (type, ev) => win.fireDocument(type, ev),
    // The live scene is internal to the IIFE, but the per-open composer's RenderPass
    // captures it (buildComposer → new RenderPass(scene, camera)). When env is OFF
    // (no composer), fall back to the last renderer.render(scene,...) call.
    scene: () => sceneFromRec(rec),
  };
}

export function sceneFromRec(rec) {
  const comp = rec.lastComposer;
  if (comp) {
    const rp = comp.passes.find((p) => p.isRenderPass);
    if (rp && rp.scene) return rp.scene;
  }
  return rec.lastRenderedScene || null;
}

// Optionally evaluate the REAL web/js/harborterrain.js into the same window so
// window.cartaTerrain becomes available (case 5 real-uniform-seam variant). Must be
// called BEFORE loadDiorama runs init/open, since buildScene reads window.cartaTerrain.
export async function loadRealTerrain(win, rec) {
  const THREE = makeThree(rec);
  const src = readFileSync(TERRAIN_SRC, 'utf8');
  const context = vm.createContext(win);
  // harborterrain.js is a classic script (assigns window.cartaTerrain), not a module.
  const script = new vm.Script(src, { filename: 'harborterrain.js' });
  script.runInContext(context);
  return win.cartaTerrain;
}

// Evaluate the REAL web/js/render/lod.js (a classic IIFE assigning
// window.cartaLod, no /vendor imports) in an isolated sandbox and return the
// published cartaLod policy object. Pure — used by cases 14/15 to test the SSE
// math headless without GL.
export function loadLod() {
  const win = { window: undefined };
  win.window = win;
  const context = vm.createContext(win);
  new vm.Script(readFileSync(LOD_SRC, 'utf8'), { filename: 'lod.js' }).runInContext(context);
  return win.cartaLod;
}

// Evaluate the REAL web/js/harbortrees.js (a classic script assigning
// window.cartaTreeSystem) into a sandbox over a fresh fake THREE and return the
// factory. Case 16 drives its metric path headless (Frustum stub never culls).
export function loadTrees(rec, opts = {}) {
  const win = makeWindow();
  win.window = win;
  const THREE = makeThree(rec || {});
  win.THREE = THREE;
  const context = vm.createContext(win);
  // optionally publish the real cartaLod first, so the tree system takes its
  // production hysteresis path (window.cartaLod.band) instead of the ternary
  // fallback. Off by default so case 16 keeps the nominal-edge membership.
  if (opts.lod) new vm.Script(readFileSync(LOD_SRC, 'utf8'), { filename: 'lod.js' }).runInContext(context);
  const TREES_SRC = join(REPO_ROOT, 'web', 'js', 'harbortrees.js');
  new vm.Script(readFileSync(TREES_SRC, 'utf8'), { filename: 'harbortrees.js' }).runInContext(context);
  return { make: win.cartaTreeSystem, THREE, win };
}

// Evaluate the REAL web/js/lodfade.js (classic IIFE → window.cartaLodFade) in a
// bare sandbox and return the published transition-layer module. Pure — used by
// the fade-maths cases.
export function loadLodFade() {
  const win = { window: undefined };
  win.window = win;
  win.Uint8Array = Uint8Array;
  const context = vm.createContext(win);
  new vm.Script(readFileSync(join(REPO_ROOT, 'web', 'js', 'lodfade.js'), 'utf8'), { filename: 'lodfade.js' }).runInContext(context);
  return win.cartaLodFade;
}

export function rewriteImports(src) {
  const out = src
    .replace("await import('/vendor/three.module.min.js')", "await globalThis.__imp('three')")
    .replace("await import('/vendor/OrbitControls.module.js')", "await globalThis.__imp('orbit')")
    .replace("import('/vendor/jsm/postprocessing/EffectComposer.js')", "globalThis.__imp('composer')")
    .replace("import('/vendor/jsm/postprocessing/RenderPass.js')", "globalThis.__imp('renderpass')")
    .replace("import('/vendor/jsm/postprocessing/UnrealBloomPass.js')", "globalThis.__imp('bloom')");
  // Guard: confirm every /vendor import was rewritten (catches upstream line drift).
  if (out.includes("import('/vendor/")) {
    throw new Error('rewriteImports: an unrewritten /vendor import remains — line drift in harbordiorama.js');
  }
  return out;
}

/* ---------------- scene-introspection helpers ---------------- */

// Walk a scene's children collecting the first light/fog of each kind.
export function lightRig(scene) {
  let sun = null, hemi = null;
  scene.traverse((o) => {
    if (o.isDirectionalLight && !sun) sun = o;
    if (o.isHemisphereLight && !hemi) hemi = o;
  });
  return { sun, hemi, fog: scene.fog };
}
