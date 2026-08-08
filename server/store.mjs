import fs from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';

export const DATA_DIR = path.resolve(process.env.JOBHUNTR_DATA_DIR || './data');
export const DB_PATH = path.join(DATA_DIR, 'jobhuntr.json');

const now = () => new Date().toISOString();

export const seedJobs = [
  { company: 'Acme AI', title: 'Founding Product Engineer', location: 'Remote', url: 'https://example.com/acme-ai-product-engineer', source: 'Seed Board', salary: '$150k-$210k', tags: ['ai', 'startup', 'remote'], description: 'Build AI workflows and customer-facing product surfaces.' },
  { company: 'Northstar Robotics', title: 'Frontend Platform Engineer', location: 'San Francisco, CA', url: 'https://example.com/northstar-frontend', source: 'Seed Board', salary: '$145k-$190k', tags: ['react', 'platform'], description: 'Own design systems, app shell, and frontend reliability.' },
  { company: 'Civic Health Labs', title: 'Full Stack Engineer', location: 'New York, NY', url: 'https://example.com/civic-fullstack', source: 'Seed Board', salary: '$130k-$175k', tags: ['fullstack', 'impact'], description: 'Ship local-first health workflow software.' },
  { company: 'Orbit Data', title: 'Developer Tools Engineer', location: 'Remote US', url: 'https://example.com/orbit-devtools', source: 'Seed Board', salary: '$160k-$220k', tags: ['devtools', 'typescript'], description: 'Design SDKs, CLI tools, and diagnostics for data teams.' }
];

export function emptyDb() {
  const createdAt = now();
  return {
    meta: { version: 1, createdAt, updatedAt: createdAt },
    profile: {
      name: 'Local Job Hunter',
      headline: 'Full-stack builder looking for high-impact teams',
      location: 'United States',
      targetRoles: ['Software Engineer', 'Product Engineer'],
      skills: ['TypeScript', 'React', 'Python', 'Automation'],
      resumeText: 'Paste your resume here. JobHuntr stores it only on this machine.',
      preferences: { remote: true, locations: ['Remote'], minSalary: 120000 }
    },
    jobs: seedJobs.map((job, index) => ({ id: nanoid(), status: index === 0 ? 'interested' : 'saved', fitScore: 75 + index * 4, createdAt, updatedAt: createdAt, notes: [], tasks: [], contacts: [], ...job })),
    coverLetters: [],
    agentRuns: [],
    activities: [{ id: nanoid(), at: createdAt, type: 'system', message: 'Initialized local JobHuntr workspace.' }]
  };
}

async function ensure() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try { await fs.access(DB_PATH); }
  catch { await writeDb(emptyDb()); }
}

export async function readDb() {
  await ensure();
  const raw = await fs.readFile(DB_PATH, 'utf8');
  return JSON.parse(raw);
}

export async function writeDb(db) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  db.meta = db.meta || {};
  db.meta.updatedAt = now();
  const tmp = `${DB_PATH}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  await fs.rename(tmp, DB_PATH);
  return db;
}

export async function mutate(fn) {
  const db = await readDb();
  const result = await fn(db);
  await writeDb(db);
  return result ?? db;
}

export function auditEvent(db, type, message, data = {}) {
  db.activities.unshift({ id: nanoid(), at: now(), type, message, data });
  db.activities = db.activities.slice(0, 500);
}

export function scoreJob(job, profile) {
  const haystack = `${job.title || ''} ${job.company || ''} ${job.description || ''} ${(job.tags || []).join(' ')}`.toLowerCase();
  const skills = profile.skills || [];
  const roles = profile.targetRoles || [];
  const skillHits = skills.filter((s) => haystack.includes(String(s).toLowerCase())).length;
  const roleHits = roles.filter((r) => haystack.includes(String(r).toLowerCase().split(' ')[0])).length;
  const remoteBoost = profile.preferences?.remote && String(job.location || '').toLowerCase().includes('remote') ? 10 : 0;
  return Math.max(30, Math.min(99, 50 + skillHits * 8 + roleHits * 10 + remoteBoost));
}

export function summarize(db) {
  const byStatus = db.jobs.reduce((acc, job) => { acc[job.status] = (acc[job.status] || 0) + 1; return acc; }, {});
  const openTasks = db.jobs.flatMap((j) => (j.tasks || []).filter((t) => !t.done).map((t) => ({ ...t, jobId: j.id, company: j.company, title: j.title })));
  const avgFit = db.jobs.length ? Math.round(db.jobs.reduce((sum, j) => sum + (j.fitScore || 0), 0) / db.jobs.length) : 0;
  return { totalJobs: db.jobs.length, byStatus, openTasks, avgFit, recentActivities: db.activities.slice(0, 12), activeRuns: db.agentRuns.filter((r) => ['running', 'paused'].includes(r.status)) };
}
