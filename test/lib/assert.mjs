// Zero-dependency assertion + golden-snapshot helpers for the diorama harness.
// Canonicalizes values (stable key order, fixed-precision numbers) so float noise
// and key ordering never cause spurious golden drift.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = join(__dirname, '..', 'golden');

export function assertEqual(actual, expected, msg) {
  const a = JSON.stringify(canon(actual));
  const e = JSON.stringify(canon(expected));
  if (a !== e) {
    throw new Error(`${msg || 'assertEqual failed'}\n  expected: ${e}\n  actual:   ${a}`);
  }
}

// Round a number to ~6 significant digits to wash out float noise, while keeping
// exact integers and small magnitudes readable. -0 is normalized to 0.
function fixNum(n) {
  if (!Number.isFinite(n)) return n === Infinity ? 'Infinity' : n === -Infinity ? '-Infinity' : 'NaN';
  if (n === 0) return 0;
  const sig = Number(n.toPrecision(6));
  return Object.is(sig, -0) ? 0 : sig;
}

// Deep canonicalization: sort object keys, fix numbers, leave arrays in order.
export function canon(v) {
  if (typeof v === 'number') return fixNum(v);
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = canon(v[k]);
    return out;
  }
  return v;
}

export function assertSnapshot(name, value) {
  const canonical = canon(value);
  const text = JSON.stringify(canonical, null, 2) + '\n';
  const file = join(GOLDEN_DIR, `${name}.json`);
  if (process.env.UPDATE_GOLDEN === '1') {
    mkdirSync(GOLDEN_DIR, { recursive: true });
    writeFileSync(file, text);
    return { updated: true, name };
  }
  if (!existsSync(file)) {
    throw new Error(`golden missing for '${name}' — run with UPDATE_GOLDEN=1 to capture`);
  }
  const golden = readFileSync(file, 'utf8');
  if (golden !== text) {
    throw new Error(`snapshot mismatch for '${name}'\n${diff(golden, text)}`);
  }
  return { updated: false, name };
}

function diff(expected, actual) {
  const e = expected.split('\n');
  const a = actual.split('\n');
  const n = Math.max(e.length, a.length);
  const out = [];
  for (let i = 0; i < n; i++) {
    const el = e[i] ?? '';
    const al = a[i] ?? '';
    if (el !== al) {
      out.push(`  - ${el}`);
      out.push(`  + ${al}`);
    }
  }
  return out.slice(0, 60).join('\n');
}
