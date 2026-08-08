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
  const { res, body } = await req('/api/health');
  assert.equal(body.ok, true); assert.equal(body.mode, 'local-only');
  assert.equal(body.host, '127.0.0.1'); assert.equal(res.headers.get('x-frame-options'), 'DENY'); assert.equal(res.headers.get('x-powered-by'), null);
  const state = (await req('/api/state')).body;
  assert.ok(state.jobs.length >= 4); assert.ok(state.summary.totalJobs >= 4);
});

test('serialized local writes do not lose concurrent jobs', async () => {
  const jobs = Array.from({ length: 12 }, (_, i) => ({ company: `Concurrent ${i}`, title: 'Engineer', url: `https://concurrent.example/${i}` }));
  const results = await Promise.all(jobs.map((job) => req('/api/jobs', { method: 'POST', body: JSON.stringify(job) })));
  assert.ok(results.every(({ res }) => res.status === 201));
  const state = (await req('/api/state')).body;
  assert.equal(state.jobs.filter((job) => job.company.startsWith('Concurrent ')).length, jobs.length);
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

test('submission queue enforces review before local submission', async () => {
  const state = (await req('/api/state')).body;
  const packet = await req('/api/submissions', { method: 'POST', body: JSON.stringify({ jobId: state.jobs[0].id }) });
  assert.equal(packet.res.status, 201); assert.equal(packet.body.status, 'draft');
  const blocked = await req(`/api/submissions/${packet.body.id}/submit`, { method: 'POST', body: '{}' });
  assert.equal(blocked.res.status, 409);
  const checklist = packet.body.checklist.map((item) => ({ ...item, done: true }));
  const ready = await req(`/api/submissions/${packet.body.id}`, { method: 'PATCH', body: JSON.stringify({ checklist, status: 'ready' }) });
  assert.equal(ready.body.status, 'ready');
  const submitted = await req(`/api/submissions/${packet.body.id}/submit`, { method: 'POST', body: '{}' });
  assert.equal(submitted.res.status, 200); assert.equal(submitted.body.status, 'submitted');
  const refreshed = (await req('/api/state')).body;
  assert.equal(refreshed.jobs.find((j) => j.id === state.jobs[0].id).status, 'applied');
});

test('coach and outreach create private role-specific drafts', async () => {
  const state = (await req('/api/state')).body; const job = state.jobs[0];
  const coach = await req('/api/coach/prepare', { method: 'POST', body: JSON.stringify({ jobId: job.id }) });
  assert.equal(coach.res.status, 201); assert.equal(coach.body.questions.length, 4); assert.match(coach.body.questions[0], new RegExp(job.company));
  const outreach = await req('/api/outreach/draft', { method: 'POST', body: JSON.stringify({ jobId: job.id }) });
  assert.equal(outreach.res.status, 201); assert.match(outreach.body.body, new RegExp(job.company));
});

test('full restore accepts only bounded JobHuntr backup keys', async () => {
  const state = (await req('/api/state')).body;
  const restored = await req('/api/import', { method: 'POST', body: JSON.stringify({ ...state, unexpectedCloudConfig: { token: 'not-copied' } }) });
  assert.equal(restored.res.status, 200);
  const after = (await req('/api/state')).body;
  assert.equal(after.unexpectedCloudConfig, undefined);
});

test('malformed primary storage recovers from the local backup', async () => {
  await req('/api/profile', { method: 'PUT', body: JSON.stringify({ headline: 'Recovery checkpoint' }) });
  await fs.writeFile(path.join(dir, 'jobhuntr.json'), '{malformed json');
  const recovered = await req('/api/state');
  assert.equal(recovered.res.status, 200); assert.ok(Array.isArray(recovered.body.jobs));
  const files = await fs.readdir(dir); assert.ok(files.some((name) => name.startsWith('jobhuntr.corrupt-')));
});

test.after(async () => { await new Promise((resolve)=>server.close(resolve)); await fs.rm(dir, { recursive: true, force: true }); });
