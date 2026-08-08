import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'jobhuntr-test-'));
process.env.NODE_ENV = 'test';
process.env.JOBHUNTR_DATA_DIR = dir;
const app = (await import('../server/index.mjs')).default;
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const req = async (url, options={}) => { const res = await fetch(base + url, { headers: {'Content-Type':'application/json'}, ...options }); return { res, body: res.status === 204 ? null : await res.json() }; };

test('health and initial state are local-only', async () => {
  const { body } = await req('/api/health');
  assert.equal(body.ok, true); assert.equal(body.mode, 'local-only');
  const state = (await req('/api/state')).body;
  assert.ok(state.jobs.length >= 4); assert.ok(state.summary.totalJobs >= 4);
});

test('can add and update a tracked job', async () => {
  const create = await req('/api/jobs', { method: 'POST', body: JSON.stringify({ company: 'TestCo', title: 'React Engineer', location: 'Remote', description: 'React TypeScript role', tags: ['React'] }) });
  assert.equal(create.res.status, 201); assert.equal(create.body.company, 'TestCo');
  const patch = await req(`/api/jobs/${create.body.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'applied' }) });
  assert.equal(patch.body.status, 'applied');
});

test('agent run saves matches and logs actions', async () => {
  const run = await req('/api/agent-runs/start', { method: 'POST', body: JSON.stringify({ q: 'engineer', minFit: 50 }) });
  assert.equal(run.res.status, 201); assert.equal(run.body.status, 'completed'); assert.ok(run.body.actions.length > 0);
});

test.after(async () => { await new Promise((resolve)=>server.close(resolve)); await fs.rm(dir, { recursive: true, force: true }); });
