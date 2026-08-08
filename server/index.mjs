import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { fileURLToPath } from 'node:url';
import { readDb, mutate, auditEvent, scoreJob, summarize, seedJobs, DB_PATH } from './store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 8787);
app.use(express.json({ limit: '2mb' }));

const JobSchema = z.object({
  company: z.string().min(1), title: z.string().min(1), location: z.string().optional().default(''),
  url: z.string().optional().default(''), source: z.string().optional().default('Manual'), salary: z.string().optional().default(''),
  description: z.string().optional().default(''), tags: z.array(z.string()).optional().default([]), status: z.string().optional().default('saved')
});

app.get('/api/health', async (_req, res) => res.json({ ok: true, storage: DB_PATH, mode: 'local-only' }));
app.get('/api/state', async (_req, res) => { const db = await readDb(); res.json({ ...db, summary: summarize(db) }); });
app.get('/api/summary', async (_req, res) => { const db = await readDb(); res.json(summarize(db)); });
app.put('/api/profile', async (req, res) => {
  const profile = req.body || {};
  const db = await mutate((db) => { db.profile = { ...db.profile, ...profile, preferences: { ...db.profile.preferences, ...(profile.preferences || {}) } }; auditEvent(db, 'profile', 'Updated local profile.'); });
  res.json(db.profile);
});

app.get('/api/jobs', async (_req, res) => { const db = await readDb(); res.json(db.jobs); });
app.post('/api/jobs', async (req, res) => {
  const parsed = JobSchema.parse(req.body);
  const job = await mutate((db) => {
    const item = { id: nanoid(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), notes: [], tasks: [], contacts: [], fitScore: scoreJob(parsed, db.profile), ...parsed };
    db.jobs.unshift(item); auditEvent(db, 'job', `Added ${item.title} at ${item.company}.`, { jobId: item.id }); return item;
  });
  res.status(201).json(job);
});
app.patch('/api/jobs/:id', async (req, res) => {
  const job = await mutate((db) => {
    const item = db.jobs.find((j) => j.id === req.params.id); if (!item) return null;
    Object.assign(item, req.body, { updatedAt: new Date().toISOString() });
    item.fitScore = scoreJob(item, db.profile);
    auditEvent(db, 'job', `Updated ${item.title} at ${item.company}.`, { jobId: item.id }); return item;
  });
  if (!job) return res.status(404).json({ error: 'Job not found' }); res.json(job);
});
app.delete('/api/jobs/:id', async (req, res) => {
  const ok = await mutate((db) => { const before = db.jobs.length; db.jobs = db.jobs.filter((j) => j.id !== req.params.id); if (db.jobs.length !== before) auditEvent(db, 'job', 'Deleted job.', { jobId: req.params.id }); return db.jobs.length !== before; });
  res.status(ok ? 204 : 404).end();
});
app.post('/api/jobs/:id/notes', async (req, res) => {
  const note = await mutate((db) => { const job = db.jobs.find((j) => j.id === req.params.id); if (!job) return null; const note = { id: nanoid(), at: new Date().toISOString(), text: String(req.body.text || '') }; job.notes.unshift(note); auditEvent(db, 'note', `Added note to ${job.company}.`, { jobId: job.id }); return note; });
  if (!note) return res.status(404).json({ error: 'Job not found' }); res.status(201).json(note);
});
app.post('/api/jobs/:id/tasks', async (req, res) => {
  const task = await mutate((db) => { const job = db.jobs.find((j) => j.id === req.params.id); if (!job) return null; const task = { id: nanoid(), text: String(req.body.text || 'Follow up'), due: req.body.due || '', done: false }; job.tasks.unshift(task); auditEvent(db, 'task', `Added task for ${job.company}.`, { jobId: job.id }); return task; });
  if (!task) return res.status(404).json({ error: 'Job not found' }); res.status(201).json(task);
});
app.patch('/api/jobs/:id/tasks/:taskId', async (req, res) => {
  const task = await mutate((db) => { const job = db.jobs.find((j) => j.id === req.params.id); const task = job?.tasks.find((t) => t.id === req.params.taskId); if (!task) return null; Object.assign(task, req.body); auditEvent(db, 'task', `${task.done ? 'Completed' : 'Updated'} task for ${job.company}.`); return task; });
  if (!task) return res.status(404).json({ error: 'Task not found' }); res.json(task);
});

app.post('/api/board/search', async (req, res) => {
  const q = String(req.body.q || '').toLowerCase(); const location = String(req.body.location || '').toLowerCase();
  const db = await readDb();
  const all = [...seedJobs, ...db.jobs].filter((j, idx, arr) => arr.findIndex((x) => x.url === j.url) === idx);
  const results = all.filter((j) => (!q || `${j.title} ${j.company} ${j.description} ${(j.tags || []).join(' ')}`.toLowerCase().includes(q)) && (!location || String(j.location).toLowerCase().includes(location))).map((j) => ({ ...j, fitScore: scoreJob(j, db.profile) }));
  res.json(results);
});

app.post('/api/cover-letters', async (req, res) => {
  const letter = await mutate((db) => {
    const job = db.jobs.find((j) => j.id === req.body.jobId) || req.body.job || {};
    const skills = (db.profile.skills || []).slice(0, 4).join(', ');
    const body = `Dear ${job.company || 'Hiring Team'},\n\nI am excited to apply for the ${job.title || 'role'} position. My background in ${skills || 'shipping user-focused software'} maps well to your needs, and I am especially interested in ${job.description || 'the opportunity to contribute quickly and thoughtfully'}.\n\nIn prior work I have built reliable product workflows, improved user experience, and operated with strong ownership. I would welcome the chance to discuss how I can help ${job.company || 'your team'} deliver meaningful results.\n\nBest,\n${db.profile.name}`;
    const item = { id: nanoid(), jobId: job.id, createdAt: new Date().toISOString(), title: `${job.company || 'General'} cover letter`, body };
    db.coverLetters.unshift(item); auditEvent(db, 'cover-letter', `Generated cover letter for ${job.company || 'a role'}.`); return item;
  });
  res.status(201).json(letter);
});

app.post('/api/resume/score', async (req, res) => {
  const db = await readDb(); const text = String(req.body.resumeText || db.profile.resumeText || ''); const job = req.body.job || db.jobs.find((j) => j.id === req.body.jobId) || {};
  const jd = `${job.title || ''} ${job.description || ''} ${(job.tags || []).join(' ')}`.toLowerCase();
  const skills = db.profile.skills || []; const hits = skills.filter((s) => text.toLowerCase().includes(String(s).toLowerCase()) || jd.includes(String(s).toLowerCase()));
  const missing = skills.filter((s) => !hits.includes(s)).slice(0, 6);
  res.json({ score: Math.min(98, 55 + hits.length * 7), hits, missing, suggestions: [`Mirror the job title: ${job.title || 'target role'}.`, 'Quantify impact in 2-3 bullets.', missing.length ? `Add evidence for: ${missing.join(', ')}.` : 'Your saved skills align well with this role.'] });
});

app.post('/api/agent-runs/start', async (req, res) => {
  const run = await mutate((db) => {
    const search = { q: req.body.q || db.profile.targetRoles?.[0] || 'Software Engineer', location: req.body.location || db.profile.preferences?.locations?.[0] || 'Remote' };
    const matches = seedJobs.map((j) => ({ ...j, fitScore: scoreJob(j, db.profile) })).filter((j) => j.fitScore >= Number(req.body.minFit || 60));
    for (const m of matches) if (!db.jobs.some((j) => j.url === m.url)) db.jobs.unshift({ ...m, id: nanoid(), status: 'saved', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), notes: [], tasks: [], contacts: [] });
    const item = { id: nanoid(), status: 'completed', createdAt: new Date().toISOString(), completedAt: new Date().toISOString(), search, found: matches.length, actions: matches.map((m) => `Saved ${m.title} at ${m.company} (${m.fitScore}% fit)`) };
    db.agentRuns.unshift(item); auditEvent(db, 'agent', `Completed local autonomous hunt: ${matches.length} matches saved.`, { runId: item.id }); return item;
  });
  res.status(201).json(run);
});

app.get('/api/export', async (_req, res) => { const db = await readDb(); res.setHeader('Content-Disposition', 'attachment; filename="jobhuntr-export.json"'); res.json(db); });
app.post('/api/import', async (req, res) => {
  const imported = req.body; if (!imported || !Array.isArray(imported.jobs)) return res.status(400).json({ error: 'Expected a JobHuntr export with jobs[]' });
  await mutate((db) => { Object.assign(db, imported); auditEvent(db, 'import', 'Imported local JobHuntr data.'); }); res.json({ ok: true });
});

const publicDir = path.join(__dirname, '..', 'dist', 'public');
if (fs.existsSync(publicDir)) { app.use(express.static(publicDir)); app.use((req, res, next) => { if (req.path.startsWith('/api')) return next(); res.sendFile(path.join(publicDir, 'index.html')); }); }

if (process.env.NODE_ENV !== 'test') app.listen(PORT, () => console.log(`JobHuntr OSS running at http://localhost:${PORT} (local data: ${DB_PATH})`));
export default app;
