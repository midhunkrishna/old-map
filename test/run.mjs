#!/usr/bin/env node
// Characterization test runner for the harbour diorama.
// Re-execs itself with --experimental-vm-modules (required by vm.SourceTextModule)
// so that plain `node test/run.mjs` works.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function hasVmModules() {
  return process.execArgv.some((a) => a.includes('experimental-vm-modules'))
    || (process.env.NODE_OPTIONS || '').includes('experimental-vm-modules');
}

if (!hasVmModules()) {
  const r = spawnSync(
    process.execPath,
    ['--experimental-vm-modules', '--no-warnings', fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: 'inherit', env: process.env },
  );
  process.exit(r.status == null ? 1 : r.status);
}

async function collectCases() {
  const dir = join(__dirname, 'cases');
  const files = [];
  for (const f of readdirSync(dir).sort()) {
    if (f.endsWith('.mjs')) files.push(join(dir, f));
  }
  // gl layer (optional, auto-skips if `gl` missing)
  const glDir = join(dir, 'gl');
  try {
    for (const f of readdirSync(glDir).sort()) {
      if (f.endsWith('.mjs')) files.push(join(glDir, f));
    }
  } catch { /* no gl dir */ }
  return files;
}

async function main() {
  const files = await collectCases();
  const results = [];
  for (const file of files) {
    const name = file.split('/cases/')[1];
    try {
      const mod = await import(pathToFileURL(file).href);
      if (typeof mod.default !== 'function') {
        results.push({ name, status: 'SKIP', msg: 'no default export' });
        continue;
      }
      const out = await mod.default();
      if (out && out.skipped) results.push({ name, status: 'SKIP', msg: out.reason || '' });
      else results.push({ name, status: 'PASS' });
    } catch (e) {
      results.push({ name, status: 'FAIL', msg: e && e.message ? e.message : String(e), stack: e && e.stack });
    }
  }

  let pass = 0, fail = 0, skip = 0;
  console.log('');
  for (const r of results) {
    if (r.status === 'PASS') { pass++; console.log(`  PASS  ${r.name}`); }
    else if (r.status === 'SKIP') { skip++; console.log(`  SKIP  ${r.name}${r.msg ? '  (' + r.msg + ')' : ''}`); }
    else {
      fail++;
      console.log(`  FAIL  ${r.name}`);
      console.log(`        ${String(r.msg).split('\n').join('\n        ')}`);
    }
  }
  console.log('');
  console.log(`  ${pass} passed, ${fail} failed, ${skip} skipped`);
  if (process.env.UPDATE_GOLDEN === '1') console.log('  (UPDATE_GOLDEN=1 — goldens written)');
  console.log('');
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
