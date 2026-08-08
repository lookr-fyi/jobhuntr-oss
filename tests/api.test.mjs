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
  assert.equal(patch.body.statusHistory[0].status, 'applied');
  const contact = await req(`/api/jobs/${create.body.id}/contacts`, { method: 'POST', body: JSON.stringify({ name: 'Alex Recruiter', role: 'Recruiter', email: 'alex@example.test' }) });
  assert.equal(contact.res.status, 201); assert.equal(contact.body.name, 'Alex Recruiter');
});

test('agent run saves matches and logs actions', async () => {
  const run = await req('/api/agent-runs/start', { method: 'POST', body: JSON.stringify({ q: 'engineer', minFit: 50 }) });
  assert.equal(run.res.status, 201); assert.equal(run.body.status, 'completed'); assert.ok(run.body.actions.length > 0); assert.equal(run.body.steps.length, 4);
});

test('resume versions and ATS details are persisted locally', async () => {
  const state = (await req('/api/state')).body;
  const created = await req('/api/resumes', { method: 'POST', body: JSON.stringify({ name: 'Product version', templateId: 'impact', content: 'React TypeScript improved conversion 25%' }) });
  assert.equal(created.res.status, 201); assert.equal(created.body.templateId, 'impact');
  const score = await req('/api/resume/score', { method: 'POST', body: JSON.stringify({ resumeText: created.body.content, jobId: state.jobs[0].id }) });
  assert.equal(score.res.status, 200); assert.ok(Array.isArray(score.body.keywordHits)); assert.ok(score.body.quantifiedBullets >= 1);
});

test('bulk import deduplicates URLs and CSV export is available', async () => {
  const imported = await req('/api/import/jobs', { method: 'POST', body: JSON.stringify({ jobs: [{ company: 'CSV Co', title: 'Engineer', url: 'https://example.test/unique' }, { company: 'CSV Co', title: 'Engineer', url: 'https://example.test/unique' }] }) });
  assert.equal(imported.res.status, 201); assert.equal(imported.body.added, 1); assert.equal(imported.body.skipped, 1);
  const csv = await fetch(base + '/api/export/jobs.csv');
  assert.equal(csv.status, 200); assert.match(csv.headers.get('content-type'), /text\/csv/); assert.match(await csv.text(), /CSV Co/);
});

test('invalid jobs return a safe 400 response', async () => {
  const bad = await req('/api/jobs', { method: 'POST', body: JSON.stringify({ company: '', title: '' }) });
  assert.equal(bad.res.status, 400); assert.equal(bad.body.error, 'Invalid request');
});

test.after(async () => { await new Promise((resolve)=>server.close(resolve)); await fs.rm(dir, { recursive: true, force: true }); });
