#!/usr/bin/env node
import { spawnSync, spawn } from 'node:child_process';
import fs from 'node:fs';

const hasNodeModules = fs.existsSync('node_modules/.package-lock.json') || fs.existsSync('node_modules');
if (!hasNodeModules) {
  console.log('Installing dependencies locally (first run only)…');
  const install = spawnSync('npm', ['install'], { stdio: 'inherit' });
  if (install.status !== 0) process.exit(install.status || 1);
}
console.log('Starting JobHuntr OSS. Open http://localhost:5173');
const child = spawn('npm', ['run', 'dev'], { stdio: 'inherit', env: { ...process.env, JOBHUNTR_DATA_DIR: process.env.JOBHUNTR_DATA_DIR || './data' } });
child.on('exit', (code) => process.exit(code ?? 0));
