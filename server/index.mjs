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

const timestamp = () => new Date().toISOString();
const safeText = (value, max = 10000) => String(value ?? '').trim().slice(0, max);

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
    const item = { id: nanoid(), createdAt: timestamp(), updatedAt: timestamp(), notes: [], tasks: [], contacts: [], statusHistory: [{ status: parsed.status, at: timestamp() }], fitScore: scoreJob(parsed, db.profile), ...parsed };
    db.jobs.unshift(item); auditEvent(db, 'job', `Added ${item.title} at ${item.company}.`, { jobId: item.id }); return item;
  });
  res.status(201).json(job);
});
app.patch('/api/jobs/:id', async (req, res) => {
  const job = await mutate((db) => {
    const item = db.jobs.find((j) => j.id === req.params.id); if (!item) return null;
    const previousStatus = item.status;
    Object.assign(item, req.body, { updatedAt: timestamp() });
    if (req.body.status && req.body.status !== previousStatus) (item.statusHistory ||= []).unshift({ status: req.body.status, at: timestamp() });
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
  const note = await mutate((db) => { const job = db.jobs.find((j) => j.id === req.params.id); if (!job) return null; const note = { id: nanoid(), at: timestamp(), text: safeText(req.body.text, 4000) }; job.notes.unshift(note); auditEvent(db, 'note', `Added note to ${job.company}.`, { jobId: job.id }); return note; });
  if (!note) return res.status(404).json({ error: 'Job not found' }); res.status(201).json(note);
});

app.post('/api/jobs/:id/contacts', async (req, res) => {
  const contact = await mutate((db) => { const job = db.jobs.find((j) => j.id === req.params.id); if (!job) return null; const item = { id: nanoid(), name: safeText(req.body.name, 100), role: safeText(req.body.role, 100), email: safeText(req.body.email, 200), linkedIn: safeText(req.body.linkedIn, 500), createdAt: timestamp() }; job.contacts.unshift(item); auditEvent(db, 'contact', `Added contact for ${job.company}.`, { jobId: job.id }); return item; });
  if (!contact) return res.status(404).json({ error: 'Job not found' }); res.status(201).json(contact);
});

app.get('/api/templates', async (_req, res) => { const db = await readDb(); res.json(db.templates); });

app.post('/api/resumes', async (req, res) => {
  const resume = await mutate((db) => { const item = { id: nanoid(), name: safeText(req.body.name, 120) || `Resume ${db.resumes.length + 1}`, templateId: safeText(req.body.templateId, 50) || 'clean-ats', content: safeText(req.body.content || db.profile.resumeText, 100000), createdAt: timestamp(), updatedAt: timestamp() }; db.resumes.unshift(item); auditEvent(db, 'resume', `Saved resume version “${item.name}”.`); return item; });
  res.status(201).json(resume);
});

app.patch('/api/resumes/:id', async (req, res) => {
  const resume = await mutate((db) => { const item = db.resumes.find((r) => r.id === req.params.id); if (!item) return null; Object.assign(item, req.body, { updatedAt: timestamp() }); auditEvent(db, 'resume', `Updated resume “${item.name}”.`); return item; });
  if (!resume) return res.status(404).json({ error: 'Resume not found' }); res.json(resume);
});

app.delete('/api/resumes/:id', async (req, res) => { const ok = await mutate((db) => { const before = db.resumes.length; db.resumes = db.resumes.filter((r) => r.id !== req.params.id); return before !== db.resumes.length; }); res.status(ok ? 204 : 404).end(); });
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
  const jobWords = [...new Set(jd.match(/[a-z][a-z+#.-]{2,}/g) || [])].filter((w) => !['and','the','with','for','you','our','this','that'].includes(w));
  const resumeLower = text.toLowerCase(); const keywordHits = jobWords.filter((w) => resumeLower.includes(w)).slice(0, 20); const missingKeywords = jobWords.filter((w) => !resumeLower.includes(w)).slice(0, 10);
  const quantified = (text.match(/\b\d+(?:%|x|k|m|\+)?\b/gi) || []).length;
  const score = Math.min(98, 42 + hits.length * 6 + Math.min(keywordHits.length, 10) * 3 + Math.min(quantified, 5) * 2);
  res.json({ score, hits, missing, keywordHits, missingKeywords, quantifiedBullets: quantified, suggestions: [`Mirror the job title: ${job.title || 'target role'}.`, quantified < 3 ? 'Add at least three quantified outcomes.' : 'Strong use of quantified outcomes.', missingKeywords.length ? `Consider truthful evidence for: ${missingKeywords.slice(0,5).join(', ')}.` : 'Your resume covers the main job-description keywords.'] });
});

app.post('/api/agent-runs/start', async (req, res) => {
  const run = await mutate((db) => {
    const search = { q: req.body.q || db.profile.targetRoles?.[0] || 'Software Engineer', location: req.body.location || db.profile.preferences?.locations?.[0] || 'Remote' };
    const matches = seedJobs.map((j) => ({ ...j, fitScore: scoreJob(j, db.profile) })).filter((j) => j.fitScore >= Number(req.body.minFit || 60));
    for (const m of matches) if (!db.jobs.some((j) => j.url === m.url)) db.jobs.unshift({ ...m, id: nanoid(), status: 'saved', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), notes: [], tasks: [], contacts: [] });
    const steps = [
      { name: 'Read local profile', status: 'completed', detail: `${db.profile.skills.length} skills and ${db.profile.targetRoles.length} target roles loaded` },
      { name: 'Search local sources', status: 'completed', detail: `${seedJobs.length} roles inspected` },
      { name: 'Score matches', status: 'completed', detail: `${matches.length} roles met the ${Number(req.body.minFit || 60)}% threshold` },
      { name: 'Save and deduplicate', status: 'completed', detail: 'Matching roles added without duplicate URLs' }
    ];
    const item = { id: nanoid(), status: 'completed', createdAt: timestamp(), completedAt: timestamp(), search, found: matches.length, minFit: Number(req.body.minFit || 60), steps, actions: matches.map((m) => `Saved ${m.title} at ${m.company} (${m.fitScore}% fit)`) };
    db.agentRuns.unshift(item); auditEvent(db, 'agent', `Completed local autonomous hunt: ${matches.length} matches saved.`, { runId: item.id }); return item;
  });
  res.status(201).json(run);
});

const csvEscape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
app.get('/api/export/jobs.csv', async (_req, res) => { const db = await readDb(); const columns = ['company','title','status','location','salary','url','source','fitScore','tags','description']; const rows = [columns.join(','), ...db.jobs.map((j) => columns.map((c) => csvEscape(c === 'tags' ? (j.tags || []).join('|') : j[c])).join(','))]; res.type('text/csv').setHeader('Content-Disposition', 'attachment; filename="jobhuntr-jobs.csv"'); res.send(rows.join('\n')); });

app.post('/api/import/jobs', async (req, res) => {
  const jobs = z.array(JobSchema.partial().extend({ company: z.string().min(1), title: z.string().min(1) })).max(5000).parse(req.body.jobs);
  const result = await mutate((db) => { let added = 0, skipped = 0; for (const raw of jobs) { if (raw.url && db.jobs.some((j) => j.url === raw.url)) { skipped++; continue; } const parsed = JobSchema.parse(raw); db.jobs.unshift({ id: nanoid(), createdAt: timestamp(), updatedAt: timestamp(), notes: [], tasks: [], contacts: [], statusHistory: [{ status: parsed.status, at: timestamp() }], fitScore: scoreJob(parsed, db.profile), ...parsed }); added++; } auditEvent(db, 'import', `Imported ${added} jobs; skipped ${skipped} duplicates.`); return { added, skipped }; });
  res.status(201).json(result);
});

app.get('/api/export', async (_req, res) => { const db = await readDb(); res.setHeader('Content-Disposition', 'attachment; filename="jobhuntr-export.json"'); res.json(db); });
app.post('/api/import', async (req, res) => {
  const imported = req.body; if (!imported || !Array.isArray(imported.jobs)) return res.status(400).json({ error: 'Expected a JobHuntr export with jobs[]' });
  await mutate((db) => { Object.assign(db, imported); auditEvent(db, 'import', 'Imported local JobHuntr data.'); }); res.json({ ok: true });
});

app.use((err, _req, res, _next) => { if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid request', details: err.issues }); console.error(err); res.status(500).json({ error: 'Local server error' }); });

const publicDir = path.join(__dirname, '..', 'dist', 'public');
if (fs.existsSync(publicDir)) { app.use(express.static(publicDir)); app.use((req, res, next) => { if (req.path.startsWith('/api')) return next(); res.sendFile(path.join(publicDir, 'index.html')); }); }

if (process.env.NODE_ENV !== 'test') app.listen(PORT, () => console.log(`JobHuntr OSS running at http://localhost:${PORT} (local data: ${DB_PATH})`));
export default app;
