#!/usr/bin/env node
/**
 * 拉起 vite preview 并跑 smoke-game.mjs。
 * 若 4173 已被占用（Agent 常驻 preview），直接复用。
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SMOKE_URL = process.env.SMOKE_URL || 'http://127.0.0.1:4173/';

async function portAlive() {
  try {
    const r = await fetch(SMOKE_URL, { signal: AbortSignal.timeout(1500) });
    return r.ok || r.status === 200;
  } catch {
    return false;
  }
}

let preview = null;
const kill = () => {
  if (!preview) return;
  try { preview.kill('SIGTERM'); } catch {}
  preview = null;
};
process.on('exit', kill);
process.on('SIGINT', () => { kill(); process.exit(130); });

const already = await portAlive();
if (!already) {
  preview = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let ready = false;
  const onData = (d) => {
    const s = d.toString();
    if (s.includes('4173') || s.includes('Local:')) ready = true;
  };
  preview.stdout.on('data', onData);
  preview.stderr.on('data', onData);
  for (let i = 0; i < 60 && !ready; i++) {
    if (await portAlive()) { ready = true; break; }
    await sleep(250);
  }
  if (!(await portAlive())) {
    console.error('preview failed to start on 4173');
    kill();
    process.exit(1);
  }
} else {
  console.log('reusing existing preview at', SMOKE_URL);
}

const smoke = spawn('node', ['scripts/smoke-game.mjs'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, SMOKE_URL },
});

smoke.on('exit', (code) => {
  kill();
  process.exit(code ?? 1);
});
