import express from "express";
import path from "node:path";
import fs from "node:fs";
import { nanoid } from "nanoid";
import { z } from "zod";
import { fileURLToPath } from "node:url";
import {
  readDb,
  mutate,
  auditEvent,
  scoreJob,
  summarize,
  seedJobs,
  findLocalMatches,
  DB_PATH,
} from "./store.mjs";
import { renderResumeDocument, renderCoverLetterDocument } from "./render.mjs";
import { auditProfessionalProfile } from "./profile-audit.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_VERSION = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
).version;
const app = express();
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
app.disable("x-powered-by");
app.use((req, res, next) => {
  const requestHost = String(req.headers.host || "");
  let hostname = "";
  try {
    hostname = new URL(`http://${requestHost}`).hostname.toLowerCase();
  } catch {}
  if (!LOOPBACK_HOSTS.has(hostname))
    return res
      .status(421)
      .json({ error: "JobHuntr accepts loopback requests only" });
  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== requestHost)
        return res.status(403).json({ error: "Cross-origin request blocked" });
    } catch {
      return res.status(403).json({ error: "Invalid request origin" });
    }
  }
  next();
});
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
  );
  next();
});
app.use(express.json({ limit: "2mb" }));

const timestamp = () => new Date().toISOString();
const safeText = (value, max = 10000) =>
  String(value ?? "")
    .trim()
    .slice(0, max);
const isUsableResumeText = (value) => {
  const text = String(value ?? "").trim();
  return (
    text.length >= 80 &&
    !text.toLowerCase().startsWith("paste your resume here")
  );
};
const safeDueDate = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : "";
const isSafeHttpUrl = (value) => {
  if (!value) return true;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};
const JobStatusSchema = z.enum([
  "saved",
  "interested",
  "submitting",
  "applied",
  "interview",
  "offer",
  "rejected",
  "failed",
  "skipped",
  "removed",
]);

const ProfileSchema = z.object({
  onboarded: z.boolean().optional(),
  name: z.string().max(200).optional(),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  nickname: z.string().max(100).optional(),
  headline: z.string().max(1000).optional(),
  location: z.string().max(300).optional(),
  targetRoles: z.array(z.string().max(200)).max(100).optional(),
  skills: z.array(z.string().max(200)).max(200).optional(),
  resumeText: z.string().max(200000).optional(),
  additionalInfo: z.string().max(100000).optional(),
  faqAnswers: z
    .array(
      z.object({
        id: z.string().max(200).optional(),
        question: z.string().max(1000),
        answer: z.string().max(30000).optional().default(""),
      }),
    )
    .max(100)
    .optional(),
  preferences: z
    .object({
      remote: z.boolean().optional(),
      locations: z.array(z.string().max(300)).max(100).optional(),
      minSalary: z.coerce.number().min(0).max(100000000).optional(),
      weeklyApplicationGoal: z.coerce.number().int().min(1).max(100).optional(),
      atsThreshold: z.coerce.number().min(0).max(100).optional(),
    })
    .optional(),
});

const JobSchema = z.object({
  company: z.string().trim().min(1).max(300),
  title: z.string().trim().min(1).max(500),
  location: z.string().max(500).optional().default(""),
  url: z
    .string()
    .trim()
    .max(2000)
    .refine(isSafeHttpUrl, "Job URL must use HTTP or HTTPS")
    .optional()
    .default(""),
  source: z.string().max(200).optional().default("Manual"),
  salary: z.string().max(300).optional().default(""),
  description: z.string().max(100000).optional().default(""),
  tags: z.array(z.string().max(200)).max(100).optional().default([]),
  status: JobStatusSchema.optional().default("saved"),
});
const JobPatchSchema = z.object({
  company: z.string().trim().min(1).max(300).optional(),
  title: z.string().trim().min(1).max(500).optional(),
  location: z.string().max(500).optional(),
  url: z
    .string()
    .trim()
    .max(2000)
    .refine(isSafeHttpUrl, "Job URL must use HTTP or HTTPS")
    .optional(),
  source: z.string().max(200).optional(),
  salary: z.string().max(300).optional(),
  description: z.string().max(100000).optional(),
  tags: z.array(z.string().max(200)).max(100).optional(),
  status: JobStatusSchema.optional(),
  interviewRounds: z
    .array(
      z.object({
        id: z.string().max(200),
        roundType: z.string().max(200).optional().default("Interview Round"),
        number: z.string().max(50).optional().default(""),
        date: z.string().max(50).optional().default(""),
        notes: z.string().max(10000).optional().default(""),
        status: z.string().max(50).optional().default("scheduled"),
        outcome: z.string().max(50).optional().default("pending"),
        createdAt: z.string().max(100).optional(),
        updatedAt: z.string().max(100).optional(),
      }),
    )
    .max(50)
    .optional(),
});
const ContactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  role: z.string().trim().max(100).optional().default(""),
  email: z
    .union([z.literal(""), z.string().trim().email().max(200)])
    .optional()
    .default(""),
  linkedIn: z
    .string()
    .trim()
    .max(500)
    .refine(isSafeHttpUrl, "LinkedIn URL must use HTTP or HTTPS")
    .optional()
    .default(""),
});
const TemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().default(""),
  originalResume: z.string().max(200000).optional().default(""),
  editedResume: z.string().max(200000).optional().default(""),
  additionalExperience: z.string().max(10000).optional().default(""),
  testJobId: z.string().max(200).optional().default(""),
  sections: z
    .array(z.string().trim().min(1).max(100))
    .min(1)
    .max(20)
    .optional()
    .default(["Summary", "Skills", "Experience", "Education"]),
});
const GigSchema = z.object({
  client: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  source: z.string().max(200).optional().default("Manual"),
  url: z.string().max(2000).optional().default(""),
  budget: z.coerce.number().min(0).max(100000000).optional().default(0),
  earned: z.coerce.number().min(0).max(100000000).optional().default(0),
  dueDate: z.string().optional().default(""),
  description: z.string().max(50000).optional().default(""),
  proposal: z.string().max(100000).optional().default(""),
  status: z
    .enum([
      "lead",
      "proposal",
      "negotiation",
      "won",
      "in-progress",
      "waiting-approval",
      "completed",
      "lost",
    ])
    .optional()
    .default("lead"),
});

app.get("/api/health", async (_req, res) =>
  res.json({
    ok: true,
    storage: DB_PATH,
    mode: "local-only",
    host: HOST,
    version: APP_VERSION,
  }),
);
app.get("/api/state", async (_req, res) => {
  const db = await readDb();
  res.json({ ...db, summary: summarize(db) });
});
app.get("/api/summary", async (_req, res) => {
  const db = await readDb();
  res.json(summarize(db));
});
app.put("/api/profile", async (req, res) => {
  const profile = ProfileSchema.parse(req.body || {});
  const db = await mutate((db) => {
    db.profile = {
      ...db.profile,
      ...profile,
      preferences: {
        ...db.profile.preferences,
        ...(profile.preferences || {}),
      },
    };
    auditEvent(db, "profile", "Updated local profile.");
  });
  res.json(db.profile);
});

app.get("/api/jobs", async (_req, res) => {
  const db = await readDb();
  res.json(db.jobs);
});
app.get("/api/gigs", async (_req, res) => {
  const db = await readDb();
  res.json(db.gigs);
});
app.post("/api/gigs", async (req, res) => {
  const parsed = GigSchema.parse(req.body);
  parsed.dueDate = safeDueDate(parsed.dueDate);
  const gig = await mutate((db) => {
    const item = {
      id: nanoid(),
      ...parsed,
      createdAt: timestamp(),
      updatedAt: timestamp(),
      statusHistory: [{ status: parsed.status, at: timestamp() }],
    };
    db.gigs.unshift(item);
    auditEvent(db, "gig", `Added gig “${item.title}” for ${item.client}.`, {
      gigId: item.id,
    });
    return item;
  });
  res.status(201).json(gig);
});
app.patch("/api/gigs/:id", async (req, res) => {
  const gig = await mutate((db) => {
    const item = db.gigs.find((entry) => entry.id === req.params.id);
    if (!item) return null;
    const previous = item.status;
    const merged = GigSchema.parse({ ...item, ...req.body });
    merged.dueDate = safeDueDate(merged.dueDate);
    Object.assign(item, merged, {
      id: item.id,
      createdAt: item.createdAt,
      updatedAt: timestamp(),
    });
    if (item.status !== previous)
      item.statusHistory.unshift({ status: item.status, at: timestamp() });
    auditEvent(db, "gig", `Updated gig “${item.title}” for ${item.client}.`, {
      gigId: item.id,
    });
    return item;
  });
  if (!gig) return res.status(404).json({ error: "Gig not found" });
  res.json(gig);
});
app.delete("/api/gigs/:id", async (req, res) => {
  const removed = await mutate((db) => {
    const before = db.gigs.length;
    db.gigs = db.gigs.filter((gig) => gig.id !== req.params.id);
    return before !== db.gigs.length;
  });
  res.status(removed ? 204 : 404).end();
});
app.post("/api/jobs", async (req, res) => {
  const parsed = JobSchema.parse(req.body);
  const job = await mutate((db) => {
    const existing =
      parsed.url && db.jobs.find((item) => item.url === parsed.url);
    if (existing) return { ...existing, deduplicated: true };
    const item = {
      id: nanoid(),
      createdAt: timestamp(),
      updatedAt: timestamp(),
      notes: [],
      tasks: [],
      contacts: [],
      statusHistory: [{ status: parsed.status, at: timestamp() }],
      fitScore: scoreJob(parsed, db.profile),
      ...parsed,
    };
    db.jobs.unshift(item);
    auditEvent(db, "job", `Added ${item.title} at ${item.company}.`, {
      jobId: item.id,
    });
    return item;
  });
  res.status(job.deduplicated ? 200 : 201).json(job);
});
app.patch("/api/jobs/:id", async (req, res) => {
  const changes = JobPatchSchema.parse(req.body || {});
  const job = await mutate((db) => {
    const item = db.jobs.find((j) => j.id === req.params.id);
    if (!item) return null;
    const previousStatus = item.status;
    const hasSubmittedApplication = db.submissions.some(
      (submission) =>
        submission.jobId === item.id && submission.status === "submitted",
    );
    if (
      changes.status === "applied" &&
      previousStatus !== "applied" &&
      req.body.confirmedByUser !== true &&
      !hasSubmittedApplication
    )
      return { blockedApplied: true };
    if (
      hasSubmittedApplication &&
      ["saved", "interested", "submitting"].includes(changes.status)
    )
      return { blockedRegression: true };
    Object.assign(item, changes, { updatedAt: timestamp() });
    if (changes.status === "applied" && previousStatus !== "applied")
      item.applicationDatetime = timestamp();
    if (changes.status && changes.status !== previousStatus)
      (item.statusHistory ||= []).unshift({
        status: req.body.status,
        at: timestamp(),
        source:
          changes.status === "applied"
            ? "manual-confirmation"
            : "tracker-update",
      });
    item.fitScore = scoreJob(item, db.profile);
    auditEvent(db, "job", `Updated ${item.title} at ${item.company}.`, {
      jobId: item.id,
    });
    return item;
  });
  if (!job) return res.status(404).json({ error: "Job not found" });
  if (job.blockedApplied)
    return res.status(409).json({
      error: "Explicit confirmation is required before marking a job applied",
    });
  if (job.blockedRegression)
    return res.status(409).json({
      error:
        "A submitted application cannot return to a pre-application status",
    });
  res.json(job);
});
app.delete("/api/jobs/:id", async (req, res) => {
  const ok = await mutate((db) => {
    const before = db.jobs.length;
    db.jobs = db.jobs.filter((j) => j.id !== req.params.id);
    if (db.jobs.length !== before) {
      db.submissions = db.submissions.filter((x) => x.jobId !== req.params.id);
      db.coverLetters = db.coverLetters.filter(
        (x) => x.jobId !== req.params.id,
      );
      db.coachingSessions = db.coachingSessions.filter(
        (x) => x.jobId !== req.params.id,
      );
      db.coachConversations = db.coachConversations.filter(
        (x) => x.jobId !== req.params.id,
      );
      db.outreachDrafts = db.outreachDrafts.filter(
        (x) => x.jobId !== req.params.id,
      );
      auditEvent(db, "job", "Deleted job and related local records.", {
        jobId: req.params.id,
      });
    }
    return db.jobs.length !== before;
  });
  res.status(ok ? 204 : 404).end();
});
app.post("/api/jobs/:id/notes", async (req, res) => {
  const text = safeText(req.body.text, 4000);
  if (!text) return res.status(400).json({ error: "Note text is required" });
  const note = await mutate((db) => {
    const job = db.jobs.find((j) => j.id === req.params.id);
    if (!job) return null;
    const note = {
      id: nanoid(),
      at: timestamp(),
      text,
    };
    job.notes.unshift(note);
    auditEvent(db, "note", `Added note to ${job.company}.`, { jobId: job.id });
    return note;
  });
  if (!note) return res.status(404).json({ error: "Job not found" });
  res.status(201).json(note);
});
app.delete("/api/jobs/:id/notes/:noteId", async (req, res) => {
  const removed = await mutate((db) => {
    const job = db.jobs.find((item) => item.id === req.params.id);
    if (!job) return false;
    const before = job.notes.length;
    job.notes = job.notes.filter((note) => note.id !== req.params.noteId);
    if (job.notes.length !== before)
      auditEvent(db, "note", `Deleted note from ${job.company}.`, {
        jobId: job.id,
      });
    return job.notes.length !== before;
  });
  res.status(removed ? 204 : 404).end();
});

app.post("/api/jobs/:id/contacts", async (req, res) => {
  const parsed = ContactSchema.parse(req.body || {});
  const contact = await mutate((db) => {
    const job = db.jobs.find((j) => j.id === req.params.id);
    if (!job) return null;
    const item = {
      id: nanoid(),
      ...parsed,
      createdAt: timestamp(),
    };
    job.contacts.unshift(item);
    auditEvent(db, "contact", `Added contact for ${job.company}.`, {
      jobId: job.id,
    });
    return item;
  });
  if (!contact) return res.status(404).json({ error: "Job not found" });
  res.status(201).json(contact);
});
app.patch("/api/jobs/:id/contacts/:contactId", async (req, res) => {
  const contact = await mutate((db) => {
    const job = db.jobs.find((item) => item.id === req.params.id);
    const item = job?.contacts.find(
      (candidate) => candidate.id === req.params.contactId,
    );
    if (!item) return null;
    const parsed = ContactSchema.safeParse({ ...item, ...req.body });
    if (!parsed.success) return false;
    Object.assign(item, parsed.data, { updatedAt: timestamp() });
    auditEvent(db, "contact", `Updated contact for ${job.company}.`, {
      jobId: job.id,
    });
    return item;
  });
  if (contact === false)
    return res.status(400).json({ error: "Invalid contact details" });
  if (!contact) return res.status(404).json({ error: "Contact not found" });
  res.json(contact);
});
app.delete("/api/jobs/:id/contacts/:contactId", async (req, res) => {
  const removed = await mutate((db) => {
    const job = db.jobs.find((item) => item.id === req.params.id);
    if (!job) return false;
    const before = job.contacts.length;
    job.contacts = job.contacts.filter(
      (contact) => contact.id !== req.params.contactId,
    );
    if (job.contacts.length !== before)
      auditEvent(db, "contact", `Deleted contact from ${job.company}.`, {
        jobId: job.id,
      });
    return job.contacts.length !== before;
  });
  res.status(removed ? 204 : 404).end();
});

app.get("/api/templates", async (_req, res) => {
  const db = await readDb();
  res.json(db.templates);
});

app.post("/api/templates", async (req, res) => {
  const parsed = TemplateSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Invalid resume template" });
  const template = await mutate((db) => {
    const item = {
      id: nanoid(),
      ...parsed.data,
      createdAt: timestamp(),
      updatedAt: timestamp(),
    };
    db.templates.unshift(item);
    auditEvent(db, "resume", `Created resume template “${item.name}”.`);
    return item;
  });
  res.status(201).json(template);
});

app.patch("/api/templates/:id", async (req, res) => {
  const template = await mutate((db) => {
    const item = db.templates.find(
      (candidate) => candidate.id === req.params.id,
    );
    if (!item) return null;
    const parsed = TemplateSchema.safeParse({ ...item, ...req.body });
    if (!parsed.success) return false;
    Object.assign(item, parsed.data, { updatedAt: timestamp() });
    auditEvent(db, "resume", `Updated resume template “${item.name}”.`);
    return item;
  });
  if (template === false)
    return res.status(400).json({ error: "Invalid resume template" });
  if (!template)
    return res.status(404).json({ error: "Resume template not found" });
  res.json(template);
});

app.delete("/api/templates/:id", async (req, res) => {
  const result = await mutate((db) => {
    if (db.templates.length <= 1) return "last";
    const index = db.templates.findIndex(
      (candidate) => candidate.id === req.params.id,
    );
    if (index < 0) return "missing";
    const [removed] = db.templates.splice(index, 1);
    const fallbackId = db.templates[0].id;
    for (const resume of db.resumes) {
      if (resume.templateId === removed.id) resume.templateId = fallbackId;
    }
    auditEvent(db, "resume", `Deleted resume template “${removed.name}”.`);
    return "deleted";
  });
  if (result === "last")
    return res.status(409).json({ error: "Keep at least one resume template" });
  if (result === "missing")
    return res.status(404).json({ error: "Resume template not found" });
  res.status(204).end();
});

app.post("/api/resumes", async (req, res) => {
  const db = await readDb();
  const content = safeText(req.body.content || db.profile.resumeText, 100000);
  if (!isUsableResumeText(content))
    return res.status(400).json({
      error: "Replace the placeholder with a real resume before saving",
    });
  const resume = await mutate((db) => {
    const item = {
      id: nanoid(),
      name: safeText(req.body.name, 120) || `Resume ${db.resumes.length + 1}`,
      templateId: safeText(req.body.templateId, 50) || "clean-ats",
      jobId: safeText(req.body.jobId, 50),
      content,
      createdAt: timestamp(),
      updatedAt: timestamp(),
    };
    db.resumes.unshift(item);
    auditEvent(db, "resume", `Saved resume version “${item.name}”.`);
    return item;
  });
  res.status(201).json(resume);
});

app.patch("/api/resumes/:id", async (req, res) => {
  if (req.body.content !== undefined && !isUsableResumeText(req.body.content))
    return res.status(400).json({
      error: "Replace the placeholder with a real resume before saving",
    });
  const resume = await mutate((db) => {
    const item = db.resumes.find((r) => r.id === req.params.id);
    if (!item) return null;
    if (req.body.name !== undefined) item.name = safeText(req.body.name, 120);
    if (req.body.templateId !== undefined)
      item.templateId = safeText(req.body.templateId, 50);
    if (req.body.jobId !== undefined) item.jobId = safeText(req.body.jobId, 50);
    if (req.body.content !== undefined)
      item.content = safeText(req.body.content, 100000);
    item.updatedAt = timestamp();
    auditEvent(db, "resume", `Updated resume “${item.name}”.`);
    return item;
  });
  if (!resume) return res.status(404).json({ error: "Resume not found" });
  res.json(resume);
});

app.delete("/api/resumes/:id", async (req, res) => {
  const ok = await mutate((db) => {
    const before = db.resumes.length;
    db.resumes = db.resumes.filter((r) => r.id !== req.params.id);
    for (const submission of db.submissions)
      if (submission.resumeId === req.params.id) submission.resumeId = "";
    return before !== db.resumes.length;
  });
  res.status(ok ? 204 : 404).end();
});

const downloadName = (name) =>
  safeText(name, 80)
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-|-$/g, "") || "jobhuntr-document";
app.get("/print/resume/:id", async (req, res) => {
  const db = await readDb();
  const resume = db.resumes.find((x) => x.id === req.params.id);
  if (!resume) return res.status(404).type("text").send("Resume not found");
  if (req.query.download === "1")
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${downloadName(resume.name)}.html"`,
    );
  res.type("html").send(renderResumeDocument(resume, db.profile));
});
app.get("/print/cover-letter/:id", async (req, res) => {
  const db = await readDb();
  const letter = db.coverLetters.find((x) => x.id === req.params.id);
  if (!letter)
    return res.status(404).type("text").send("Cover letter not found");
  const job = db.jobs.find((x) => x.id === letter.jobId);
  if (req.query.download === "1")
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${downloadName(letter.title)}.html"`,
    );
  res.type("html").send(renderCoverLetterDocument(letter, db.profile, job));
});
app.post("/api/jobs/:id/tasks", async (req, res) => {
  const text = safeText(req.body.text, 500);
  if (!text) return res.status(400).json({ error: "Task text is required" });
  if (req.body.due && !safeDueDate(req.body.due))
    return res.status(400).json({ error: "Task due date is invalid" });
  const task = await mutate((db) => {
    const job = db.jobs.find((j) => j.id === req.params.id);
    if (!job) return null;
    const task = {
      id: nanoid(),
      text,
      due: safeDueDate(req.body.due),
      done: false,
      createdAt: timestamp(),
    };
    job.tasks.unshift(task);
    auditEvent(db, "task", `Added task for ${job.company}.`, { jobId: job.id });
    return task;
  });
  if (!task) return res.status(404).json({ error: "Job not found" });
  res.status(201).json(task);
});
app.patch("/api/jobs/:id/tasks/:taskId", async (req, res) => {
  if (req.body.text !== undefined && !safeText(req.body.text, 500))
    return res.status(400).json({ error: "Task text is required" });
  if (req.body.due && !safeDueDate(req.body.due))
    return res.status(400).json({ error: "Task due date is invalid" });
  if (req.body.done !== undefined && typeof req.body.done !== "boolean")
    return res.status(400).json({ error: "Task completion must be a boolean" });
  const task = await mutate((db) => {
    const job = db.jobs.find((j) => j.id === req.params.id);
    const task = job?.tasks.find((t) => t.id === req.params.taskId);
    if (!task) return null;
    if (req.body.text !== undefined) task.text = safeText(req.body.text, 500);
    if (req.body.due !== undefined) task.due = safeDueDate(req.body.due);
    if (req.body.done !== undefined) task.done = Boolean(req.body.done);
    auditEvent(
      db,
      "task",
      `${task.done ? "Completed" : "Updated"} task for ${job.company}.`,
    );
    return task;
  });
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json(task);
});
app.delete("/api/jobs/:id/tasks/:taskId", async (req, res) => {
  const removed = await mutate((db) => {
    const job = db.jobs.find((item) => item.id === req.params.id);
    if (!job) return false;
    const before = job.tasks.length;
    job.tasks = job.tasks.filter((task) => task.id !== req.params.taskId);
    if (job.tasks.length !== before)
      auditEvent(db, "task", `Deleted task from ${job.company}.`, {
        jobId: job.id,
      });
    return before !== job.tasks.length;
  });
  res.status(removed ? 204 : 404).end();
});

app.post("/api/board/search", async (req, res) => {
  const q = String(req.body.q || "").toLowerCase();
  const location = String(req.body.location || "").toLowerCase();
  const db = await readDb();
  const all = [...seedJobs, ...db.jobs].filter(
    (j, idx, arr) => arr.findIndex((x) => x.url === j.url) === idx,
  );
  const results = all
    .filter(
      (j) =>
        (!q ||
          `${j.title} ${j.company} ${j.description} ${(j.tags || []).join(" ")}`
            .toLowerCase()
            .includes(q)) &&
        (!location || String(j.location).toLowerCase().includes(location)),
    )
    .map((j) => ({ ...j, fitScore: scoreJob(j, db.profile) }));
  res.json(results);
});

app.post("/api/cover-letters", async (req, res) => {
  const current = await readDb();
  const trackedJob = current.jobs.find((job) => job.id === req.body.jobId);
  const manualJob = req.body.job || {};
  const sourceResume =
    req.body.resumeId === "profile-resume" || req.body.atsTemplateId
      ? current.profile.resumeText
      : current.resumes.find((item) => item.id === req.body.resumeId)?.content;
  if (!isUsableResumeText(sourceResume))
    return res.status(409).json({
      error: "Select a valid resume before generating a cover letter",
    });
  if (
    !trackedJob &&
    (!safeText(manualJob.title, 500) || !safeText(manualJob.company, 300))
  )
    return res.status(400).json({
      error: "Select a tracked job or provide a company and role",
    });
  const letter = await mutate((db) => {
    const job = db.jobs.find((j) => j.id === req.body.jobId) || {
      title: safeText(manualJob.title, 500),
      company: safeText(manualJob.company, 300),
      description: safeText(manualJob.description, 5000),
    };
    const style = ["professional", "concise", "story-driven"].includes(
      req.body.style,
    )
      ? req.body.style
      : "professional";
    const opening = safeText(req.body.opening, 1000);
    const emphasis =
      safeText(req.body.emphasis, 2000) ||
      safeText(req.body.coverLetterInstructions, 2000);
    const templateId = safeText(req.body.templateId, 50) || "classic";
    const templateName =
      safeText(req.body.templateName, 100) || "Classic Professional";
    const templateContent = safeText(req.body.templateContent, 20000);
    const jobDescription = safeText(req.body.jobDescription, 5000);
    const resume = db.resumes.find((item) => item.id === req.body.resumeId);
    const atsTemplateId = safeText(req.body.atsTemplateId, 100);
    const skills = (db.profile.skills || []).slice(0, 4).join(", ");
    const styleOpening = {
      professional: `I am excited to apply for the ${job.title || "role"} position.`,
      concise: `I’m applying for the ${job.title || "role"} role because my experience aligns directly with your needs.`,
      "story-driven": `The strongest work in my career has started with a difficult customer problem and a team determined to solve it well. That is what drew me to the ${job.title || "role"} opportunity.`,
    }[style];
    const resumeEvidence =
      sourceResume
        ?.split(/\n+/)
        .map((line) => line.trim())
        .find((line) => line.length > 30)
        ?.slice(0, 260) || sourceResume.replace(/\s+/g, " ").slice(0, 260);
    const values = {
      "{{company}}": job.company || "Hiring Team",
      "{{role}}": job.title || "role",
      "{{opening}}": opening || styleOpening,
      "{{skills}}": skills || "shipping user-focused software",
      "{{evidence}}": emphasis || resumeEvidence,
      "{{closing}}": `I would welcome the chance to discuss how I can help ${job.company || "your team"} deliver meaningful results.`,
      "{{name}}": db.profile.name || "Job Hunter",
    };
    const defaultTemplate = `Dear {{company}},\n\n{{opening}} My background in {{skills}} maps well to the {{role}} opportunity.\n\n{{evidence}}\n\n{{closing}}\n\nBest,\n{{name}}`;
    let body = templateContent || defaultTemplate;
    for (const [placeholder, value] of Object.entries(values))
      body = body.replaceAll(placeholder, value);
    const item = {
      id: nanoid(),
      jobId: job.id,
      resumeId:
        resume?.id ||
        (req.body.resumeId === "profile-resume" ? "profile-resume" : ""),
      atsTemplateId,
      style,
      templateId,
      templateName,
      templateContent: templateContent || defaultTemplate,
      jobDescription: jobDescription || job.description || "",
      opening,
      emphasis,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      title: `${job.company || "General"} cover letter`,
      body,
    };
    db.coverLetters.unshift(item);
    auditEvent(
      db,
      "cover-letter",
      `Generated cover letter for ${job.company || "a role"}.`,
    );
    return item;
  });
  res.status(201).json(letter);
});
app.patch("/api/cover-letters/:id", async (req, res) => {
  const letter = await mutate((db) => {
    const item = db.coverLetters.find((x) => x.id === req.params.id);
    if (!item) return null;
    if (req.body.title !== undefined)
      item.title = safeText(req.body.title, 200);
    if (req.body.body !== undefined)
      item.body = safeText(req.body.body, 100000);
    item.updatedAt = timestamp();
    auditEvent(db, "cover-letter", `Updated cover letter “${item.title}”.`);
    return item;
  });
  if (!letter) return res.status(404).json({ error: "Cover letter not found" });
  res.json(letter);
});
app.delete("/api/cover-letters/:id", async (req, res) => {
  const removed = await mutate((db) => {
    const before = db.coverLetters.length;
    db.coverLetters = db.coverLetters.filter((x) => x.id !== req.params.id);
    for (const submission of db.submissions)
      if (submission.coverLetterId === req.params.id)
        submission.coverLetterId = "";
    return before !== db.coverLetters.length;
  });
  res.status(removed ? 204 : 404).end();
});

app.get("/api/submissions", async (_req, res) => {
  const db = await readDb();
  res.json(
    db.submissions.map((s) => ({
      ...s,
      job: db.jobs.find((j) => j.id === s.jobId) || null,
      resume: db.resumes.find((r) => r.id === s.resumeId) || null,
      coverLetter:
        db.coverLetters.find((c) => c.id === s.coverLetterId) || null,
    })),
  );
});
const applicationQuestionsFor = (db) => {
  const defaults = [
    {
      question: "Why are you interested in this role?",
      questionType: "text_input",
      options: [],
    },
    {
      question: "What are your salary expectations?",
      questionType: "text_input",
      options: [],
    },
    {
      question: "When are you available to start?",
      questionType: "dropdown",
      options: ["Immediately", "Within 2 weeks", "Within 1 month", "Other"],
    },
    {
      question: "Will you require work authorization sponsorship?",
      questionType: "multiple_choice",
      options: ["Yes", "No"],
    },
  ];
  return defaults.map(({ question, questionType, options }) => ({
    id: nanoid(),
    question,
    answer:
      (db.profile.faqAnswers || []).find(
        (item) =>
          String(item.question).trim().toLowerCase() === question.toLowerCase(),
      )?.answer || "",
    questionType,
    options,
    required: true,
    confident: false,
  }));
};
const isValidApplicationAnswer = (question) => {
  const answer = safeText(question?.answer, 10000);
  if (!answer) return question?.required === false;
  if (["dropdown", "multiple_choice"].includes(question?.questionType))
    return (question.options || []).includes(answer);
  return true;
};
app.post("/api/submissions", async (req, res) => {
  const submission = await mutate((db) => {
    const job = db.jobs.find((j) => j.id === req.body.jobId);
    if (!job) return null;
    const existing = db.submissions.find(
      (s) => s.jobId === job.id && ["draft", "ready"].includes(s.status),
    );
    if (existing) return existing;
    const item = {
      id: nanoid(),
      jobId: job.id,
      resumeId: safeText(req.body.resumeId, 50),
      coverLetterId: safeText(req.body.coverLetterId, 50),
      status: "draft",
      applicationQuestions: applicationQuestionsFor(db),
      checklist: [
        {
          id: nanoid(),
          text: "Review resume alignment",
          done: false,
        },
        {
          id: nanoid(),
          text: "Review cover letter",
          done: false,
        },
        { id: nanoid(), text: "Confirm application details", done: false },
      ],
      createdAt: timestamp(),
      updatedAt: timestamp(),
    };
    db.submissions.unshift(item);
    if (["saved", "interested"].includes(job.status)) {
      job.status = "interested";
      job.updatedAt = timestamp();
      if (job.statusHistory?.[0]?.status !== "interested")
        (job.statusHistory ||= []).unshift({
          status: "interested",
          at: timestamp(),
          source: "submission-queue",
        });
    }
    auditEvent(
      db,
      "submission",
      `Created application packet for ${job.company}.`,
      { jobId: job.id, submissionId: item.id },
    );
    return item;
  });
  if (!submission) return res.status(404).json({ error: "Job not found" });
  res.status(201).json(submission);
});
app.patch("/api/submissions/:id", async (req, res) => {
  const submission = await mutate((db) => {
    const item = db.submissions.find((s) => s.id === req.params.id);
    if (!item) return null;
    if (Array.isArray(req.body.checklist)) {
      item.checklist = item.checklist.map((existing) => ({
        ...existing,
        done: Boolean(
          req.body.checklist.find((candidate) => candidate?.id === existing.id)
            ?.done,
        ),
      }));
    }
    if (req.body.resumeId !== undefined)
      item.resumeId = safeText(req.body.resumeId, 50);
    if (req.body.coverLetterId !== undefined)
      item.coverLetterId = safeText(req.body.coverLetterId, 50);
    if (Array.isArray(req.body.applicationQuestions)) {
      item.applicationQuestions = item.applicationQuestions.map((existing) => {
        const incoming = req.body.applicationQuestions.find(
          (candidate) => safeText(candidate?.id, 80) === existing.id,
        );
        const updated = {
          ...existing,
          required: existing.required !== false,
          answer: incoming
            ? safeText(incoming.answer, 10000)
            : safeText(existing.answer, 10000),
        };
        updated.confident = isValidApplicationAnswer(updated);
        return updated;
      });
      db.profile.faqAnswers = item.applicationQuestions
        .filter(isValidApplicationAnswer)
        .map((question) => ({
          question: question.question,
          answer: question.answer,
        }));
      auditEvent(
        db,
        "about-me",
        "Remembered application answers in the About Me profile.",
        { submissionId: item.id },
      );
    }
    if (req.body.status === "archived") item.status = "archived";
    else if (["draft", "ready"].includes(req.body.status))
      item.status =
        item.checklist.every((entry) => entry.done) &&
        item.applicationQuestions.every(isValidApplicationAnswer)
          ? "ready"
          : "draft";
    item.updatedAt = timestamp();
    return item;
  });
  if (!submission)
    return res.status(404).json({ error: "Submission not found" });
  res.json(submission);
});
app.post("/api/submissions/:id/submit", async (req, res) => {
  if (req.body?.confirmedByUser !== true)
    return res.status(409).json({
      error:
        "Explicit user confirmation is required before recording an external submission",
    });
  const submission = await mutate((db) => {
    const item = db.submissions.find((s) => s.id === req.params.id);
    if (!item) return null;
    if (
      !Array.isArray(item.checklist) ||
      item.checklist.length < 3 ||
      !item.checklist.every((x) => x.done)
    )
      return { blocked: true, item };
    if (!item.applicationQuestions.every(isValidApplicationAnswer))
      return { blockedQuestions: true, item };
    const attachedResume =
      item.resumeId === "profile-resume"
        ? db.profile.resumeText
        : db.resumes.find((resume) => resume.id === item.resumeId)?.content;
    if (!isUsableResumeText(attachedResume))
      return { blockedResume: true, item };
    const job = db.jobs.find((j) => j.id === item.jobId);
    item.status = "submitted";
    item.submittedAt = timestamp();
    item.updatedAt = timestamp();
    item.applicationUrl = safeText(req.body.applicationUrl || job?.url, 1000);
    if (job) {
      job.status = "applied";
      job.updatedAt = timestamp();
      job.applicationDatetime = item.submittedAt;
      (job.statusHistory ||= []).unshift({
        status: "applied",
        at: timestamp(),
        source: "submission-queue",
      });
    }
    auditEvent(
      db,
      "submission",
      `Marked application to ${job?.company || "a company"} as submitted locally.`,
      { submissionId: item.id, jobId: job?.id },
    );
    return item;
  });
  if (!submission)
    return res.status(404).json({ error: "Submission not found" });
  if (submission.blocked)
    return res
      .status(409)
      .json({ error: "Complete every checklist item before submitting" });
  if (submission.blockedResume)
    return res.status(409).json({
      error: "Attach a valid resume before recording this submission",
    });
  if (submission.blockedQuestions)
    return res.status(409).json({
      error: "Answer every required application question before submitting",
    });
  res.json(submission);
});

app.post("/api/coach/prepare", async (req, res) => {
  const session = await mutate((db) => {
    const job = db.jobs.find((j) => j.id === req.body.jobId);
    if (!job) return null;
    const skills = db.profile.skills || [];
    const haystack =
      `${job.title} ${job.description} ${(job.tags || []).join(" ")}`.toLowerCase();
    const relevant = skills.filter((s) =>
      haystack.includes(String(s).toLowerCase()),
    );
    const matchedStories = db.careerStories
      .map((story) => ({
        story,
        hits: (story.skills || []).filter((skill) =>
          haystack.includes(String(skill).toLowerCase()),
        ).length,
      }))
      .sort((a, b) => b.hits - a.hits)
      .filter((x) => x.hits > 0)
      .slice(0, 3)
      .map((x) => x.story.id);
    const questions = [
      `Why are you interested in ${job.company} and this ${job.title} role?`,
      `Describe a project where you used ${relevant[0] || skills[0] || "your core skills"} to create measurable impact.`,
      "Tell me about a difficult tradeoff you made with incomplete information.",
      `What would your first 30 days at ${job.company} look like?`,
    ];
    const item = {
      id: nanoid(),
      jobId: job.id,
      status: "in-progress",
      createdAt: timestamp(),
      updatedAt: timestamp(),
      questions,
      answers: Object.fromEntries(questions.map((q) => [q, ""])),
      matchedStoryIds: matchedStories,
      talkingPoints: [
        `Connect your headline—“${db.profile.headline}”—to the role.`,
        `Use a STAR story with a quantified outcome for ${relevant.slice(0, 3).join(", ") || "your most relevant experience"}.`,
        `Ask how success is measured for the ${job.title} role.`,
      ],
      companyResearch: [
        `Review the company website and product before the interview.`,
        `Prepare one informed question about ${job.description || "the team’s current priorities"}.`,
      ],
      researchDone: [],
      notes: "",
    };
    db.coachingSessions.unshift(item);
    auditEvent(
      db,
      "coach",
      `Prepared local interview plan for ${job.company}.`,
      { jobId: job.id },
    );
    return item;
  });
  if (!session) return res.status(404).json({ error: "Job not found" });
  res.status(201).json(session);
});
const CoachConversationSchema = z.object({
  id: z.string().max(200).optional(),
  jobId: z.string().max(200).optional().default(""),
  title: z.string().trim().min(1).max(300),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(30000),
      }),
    )
    .max(200),
});
const CoachPromptSchema = z.object({
  prompt: z.string().trim().min(1).max(5000),
  jobId: z.string().max(200).optional().default(""),
});
const localCoachResponse = (prompt, job, profile) => {
  const lower = prompt.toLowerCase();
  const role = job?.title || profile.targetRoles?.[0] || "your target role";
  const company = job?.company || "the employer";
  const skills = (profile.skills || []).slice(0, 3).join(", ");
  const evidence = skills
    ? `Connect your evidence to ${skills}`
    : "Name the two skills that mattered most";
  if (/interview|question|tell me about|behavioral/.test(lower))
    return `For your ${role} interview at ${company}, choose one relevant example and answer in four parts: context, your specific decision, the action you personally took, and the measurable result. ${evidence}. Rehearse it once in under two minutes, then prepare one thoughtful question about how success is measured in the role.`;
  if (/story|star|experience|accomplish|achievement/.test(lower))
    return `Build one reusable STAR story for ${role}. Write one sentence each for the situation and task, spend most of the answer on your actions, and end with a number or observable outcome. ${evidence}. Keep the final story under 200 words so you can adapt it during an interview.`;
  if (/week|priorit|plan|next|today/.test(lower))
    return `Use a focused plan for ${role}: first review your highest-fit queued applications, then tailor one resume using only truthful evidence, and finally send one personalized follow-up. Reserve a final 20-minute block to update your tracker and capture what you learned. Favor one complete, reviewed application over several rushed ones.`;
  if (/resume|ats|cv|bullet/.test(lower))
    return `For a ${role} resume, mirror the role language only where it truthfully matches your experience. Start bullets with the action you owned, include scope and a measurable outcome, and remove generic claims that lack evidence. ${evidence}. Run the local ATS analysis afterward and manually review every suggested keyword.`;
  if (/outreach|message|recruiter|network|follow.?up/.test(lower))
    return `Draft a short note for ${company}: mention the specific ${role} opening, connect one relevant result from your experience, and ask one easy-to-answer question. Keep it under 100 words, avoid invented familiarity, and verify the recipient and company before sending it yourself.`;
  return `For ${role}, turn this into one concrete next step. Choose a specific example, state the action you personally took, quantify the outcome where possible, and explain why it matters for ${company}. ${evidence}. Then review the result for accuracy before using it in an application or conversation.`;
};
app.post("/api/coach/respond", async (req, res) => {
  const parsed = CoachPromptSchema.parse(req.body || {});
  const db = await readDb();
  const job = db.jobs.find((item) => item.id === parsed.jobId);
  res.json({
    response: localCoachResponse(parsed.prompt, job, db.profile),
    mode: "local-rules",
  });
});
app.post("/api/coach/conversations", async (req, res) => {
  const parsed = CoachConversationSchema.parse(req.body);
  const conversation = await mutate((db) => {
    const id = parsed.id || nanoid();
    const existing = db.coachConversations.find((item) => item.id === id);
    if (existing) return existing;
    const item = {
      ...parsed,
      id,
      createdAt: timestamp(),
      updatedAt: timestamp(),
    };
    db.coachConversations.unshift(item);
    auditEvent(db, "coach", "Saved a private Career Coach conversation.", {
      conversationId: id,
    });
    return item;
  });
  res.status(201).json(conversation);
});
app.patch("/api/coach/conversations/:id", async (req, res) => {
  const conversation = await mutate((db) => {
    const item = db.coachConversations.find(
      (entry) => entry.id === req.params.id,
    );
    if (!item) return null;
    const parsed = CoachConversationSchema.parse({ ...item, ...req.body });
    Object.assign(item, parsed, {
      id: item.id,
      createdAt: item.createdAt,
      updatedAt: timestamp(),
    });
    return item;
  });
  if (!conversation)
    return res.status(404).json({ error: "Coach conversation not found" });
  res.json(conversation);
});
app.delete("/api/coach/conversations/:id", async (req, res) => {
  const removed = await mutate((db) => {
    const before = db.coachConversations.length;
    db.coachConversations = db.coachConversations.filter(
      (item) => item.id !== req.params.id,
    );
    if (db.coachConversations.length !== before)
      auditEvent(db, "coach", "Deleted a private Career Coach conversation.", {
        conversationId: req.params.id,
      });
    return db.coachConversations.length !== before;
  });
  res.status(removed ? 204 : 404).end();
});
app.patch("/api/coach/sessions/:id", async (req, res) => {
  const session = await mutate((db) => {
    const item = db.coachingSessions.find((x) => x.id === req.params.id);
    if (!item) return null;
    if (req.body.answers && typeof req.body.answers === "object")
      item.answers = Object.fromEntries(
        item.questions.map((q) => [q, safeText(req.body.answers[q], 10000)]),
      );
    if (req.body.notes !== undefined)
      item.notes = safeText(req.body.notes, 20000);
    if (Array.isArray(req.body.researchDone))
      item.researchDone = req.body.researchDone.filter((x) =>
        item.companyResearch.includes(x),
      );
    if (["in-progress", "completed"].includes(req.body.status))
      item.status = req.body.status;
    item.updatedAt = timestamp();
    auditEvent(db, "coach", `Updated interview practice session.`, {
      sessionId: item.id,
    });
    return item;
  });
  if (!session)
    return res.status(404).json({ error: "Coaching session not found" });
  res.json(session);
});

app.get("/api/career-stories", async (_req, res) => {
  const db = await readDb();
  res.json(db.careerStories);
});
app.post("/api/career-stories", async (req, res) => {
  const story = await mutate((db) => {
    const item = {
      id: nanoid(),
      title: safeText(req.body.title, 160) || "Untitled STAR story",
      situation: safeText(req.body.situation, 10000),
      task: safeText(req.body.task, 10000),
      action: safeText(req.body.action, 20000),
      result: safeText(req.body.result, 10000),
      skills: Array.isArray(req.body.skills)
        ? req.body.skills
            .map((x) => safeText(x, 100))
            .filter(Boolean)
            .slice(0, 30)
        : [],
      createdAt: timestamp(),
      updatedAt: timestamp(),
    };
    db.careerStories.unshift(item);
    auditEvent(db, "career-story", `Saved STAR story “${item.title}”.`);
    return item;
  });
  res.status(201).json(story);
});
app.patch("/api/career-stories/:id", async (req, res) => {
  const story = await mutate((db) => {
    const item = db.careerStories.find((x) => x.id === req.params.id);
    if (!item) return null;
    for (const key of ["title", "situation", "task", "action", "result"])
      if (req.body[key] !== undefined)
        item[key] = safeText(req.body[key], key === "action" ? 20000 : 10000);
    if (Array.isArray(req.body.skills))
      item.skills = req.body.skills
        .map((x) => safeText(x, 100))
        .filter(Boolean)
        .slice(0, 30);
    item.updatedAt = timestamp();
    return item;
  });
  if (!story) return res.status(404).json({ error: "Career story not found" });
  res.json(story);
});
app.delete("/api/career-stories/:id", async (req, res) => {
  const removed = await mutate((db) => {
    const before = db.careerStories.length;
    db.careerStories = db.careerStories.filter((x) => x.id !== req.params.id);
    for (const session of db.coachingSessions)
      session.matchedStoryIds = (session.matchedStoryIds || []).filter(
        (id) => id !== req.params.id,
      );
    return before !== db.careerStories.length;
  });
  res.status(removed ? 204 : 404).end();
});

app.post("/api/outreach/draft", async (req, res) => {
  const result = await mutate((db) => {
    const job = db.jobs.find((j) => j.id === req.body.jobId);
    if (!job) return null;
    const requested = req.body.contactId
      ? job.contacts.filter((contact) => contact.id === req.body.contactId)
      : job.contacts;
    const contacts = requested.length ? requested : [null];
    const collected = [];
    let primary = null;
    for (const contact of contacts) {
      const contactId = contact?.id || "";
      const existing = db.outreachDrafts.find(
        (item) => item.jobId === job.id && item.contactId === contactId,
      );
      if (existing) {
        primary ||= existing;
        continue;
      }
      const recipient = contact?.name || "there";
      const contactRole = safeText(contact?.role, 200);
      const category = /recruit/i.test(contactRole)
        ? "recruiter"
        : /hiring|manager|director|head|lead/i.test(contactRole)
          ? "hiring_manager"
          : "peer";
      const body = `Hi ${recipient},\n\nI’m exploring the ${job.title} opportunity at ${job.company}. My background in ${(db.profile.skills || []).slice(0, 3).join(", ")} looks closely aligned, particularly with ${job.description || "the team’s product goals"}.\n\nIf you’re open to it, I’d appreciate hearing what the team values most in candidates for this role.\n\nBest,\n${db.profile.name}`;
      const item = {
        id: nanoid(),
        jobId: job.id,
        contactId,
        recipient: contact?.name || "Hiring team",
        contactRole: contactRole || "Hiring team",
        contactEmail: safeText(contact?.email, 300),
        category,
        connectionDegree: contact ? "Known contact" : "Company contact",
        channel: req.body.channel === "email" ? "email" : "linkedin",
        subject: `Interest in ${job.title} at ${job.company}`,
        body,
        status: "draft",
        createdAt: timestamp(),
        updatedAt: timestamp(),
      };
      db.outreachDrafts.unshift(item);
      collected.push(item);
      primary ||= item;
    }
    if (collected.length)
      auditEvent(
        db,
        "outreach",
        `Collected ${collected.length} outreach contact${collected.length === 1 ? "" : "s"} for ${job.company}.`,
        { jobId: job.id },
      );
    return { primary, collectedCount: collected.length };
  });
  if (!result) return res.status(404).json({ error: "Job not found" });
  res
    .status(result.collectedCount ? 201 : 200)
    .json({ ...result.primary, collectedCount: result.collectedCount });
});
const ProfileAuditSchema = z.object({
  profileUrl: z.string().max(1000).optional().default(""),
  targetContext: z.string().max(50000).optional().default(""),
  headline: z.string().max(1000).optional().default(""),
  about: z.string().max(30000).optional().default(""),
  experience: z.string().max(100000).optional().default(""),
  skills: z
    .union([z.string().max(10000), z.array(z.string().max(200)).max(100)])
    .optional()
    .default(""),
});
app.post("/api/profile-audits", async (req, res) => {
  const input = ProfileAuditSchema.parse(req.body);
  const audit = await mutate((db) => {
    const result = auditProfessionalProfile(input, db.profile);
    const item = { id: nanoid(), createdAt: timestamp(), input, ...result };
    db.profileAudits.unshift(item);
    db.profileAudits = db.profileAudits.slice(0, 50);
    auditEvent(
      db,
      "profile-audit",
      `Completed local professional profile audit: ${item.total}/100.`,
      { auditId: item.id },
    );
    return item;
  });
  res.status(201).json(audit);
});
app.delete("/api/profile-audits/:id", async (req, res) => {
  const removed = await mutate((db) => {
    const before = db.profileAudits.length;
    db.profileAudits = db.profileAudits.filter(
      (audit) => audit.id !== req.params.id,
    );
    return before !== db.profileAudits.length;
  });
  res.status(removed ? 204 : 404).end();
});
app.patch("/api/outreach/:id", async (req, res) => {
  const draft = await mutate((db) => {
    const item = db.outreachDrafts.find((x) => x.id === req.params.id);
    if (!item) return null;
    if (req.body.subject !== undefined)
      item.subject = safeText(req.body.subject, 300);
    if (req.body.body !== undefined) item.body = safeText(req.body.body, 20000);
    if (req.body.recipient !== undefined)
      item.recipient = safeText(req.body.recipient, 200);
    if (req.body.contactRole !== undefined)
      item.contactRole = safeText(req.body.contactRole, 200);
    if (req.body.contactEmail !== undefined)
      item.contactEmail = safeText(req.body.contactEmail, 300);
    if (["recruiter", "peer", "hiring_manager"].includes(req.body.category))
      item.category = req.body.category;
    if (["draft", "sent", "replied", "archived"].includes(req.body.status))
      item.status = req.body.status;
    item.updatedAt = timestamp();
    return item;
  });
  if (!draft)
    return res.status(404).json({ error: "Outreach draft not found" });
  res.json(draft);
});
app.delete("/api/outreach/:id", async (req, res) => {
  const removed = await mutate((db) => {
    const before = db.outreachDrafts.length;
    db.outreachDrafts = db.outreachDrafts.filter(
      (item) => item.id !== req.params.id,
    );
    if (db.outreachDrafts.length !== before)
      auditEvent(db, "outreach", "Deleted a local outreach contact and draft.");
    return db.outreachDrafts.length !== before;
  });
  res.status(removed ? 204 : 404).end();
});

const scoreResumeAgainstJob = (text, job, profile) => {
  const resumeLower = String(text || "").toLowerCase();
  const jd =
    `${job.title || ""} ${job.description || ""} ${(job.tags || []).join(" ")}`.toLowerCase();
  const skills = profile.skills || [];
  const hits = skills.filter((skill) =>
    resumeLower.includes(String(skill).toLowerCase()),
  );
  const missing = skills.filter((skill) => !hits.includes(skill)).slice(0, 6);
  const jobWords = [...new Set(jd.match(/[a-z][a-z+#.-]{2,}/g) || [])].filter(
    (word) =>
      !["and", "the", "with", "for", "you", "our", "this", "that"].includes(
        word,
      ),
  );
  const keywordHits = jobWords
    .filter((word) => resumeLower.includes(word))
    .slice(0, 20);
  const missingKeywords = jobWords
    .filter((word) => !resumeLower.includes(word))
    .slice(0, 10);
  const quantifiedBullets = (
    String(text || "").match(/\b\d+(?:%|x|k|m|\+)?\b/gi) || []
  ).length;
  const score = Math.min(
    98,
    42 +
      hits.length * 6 +
      Math.min(keywordHits.length, 10) * 3 +
      Math.min(quantifiedBullets, 5) * 2,
  );
  return {
    score,
    hits,
    missing,
    keywordHits,
    missingKeywords,
    quantifiedBullets,
  };
};

app.post("/api/resume/score", async (req, res) => {
  const db = await readDb();
  const text = String(req.body.resumeText || db.profile.resumeText || "");
  if (!isUsableResumeText(text))
    return res.status(400).json({
      error: "Replace the placeholder with a real resume before analysis",
    });
  const job =
    req.body.job || db.jobs.find((j) => j.id === req.body.jobId) || {};
  const result = scoreResumeAgainstJob(text, job, db.profile);
  res.json({
    ...result,
    suggestions: [
      `Mirror the job title: ${job.title || "target role"}.`,
      result.quantifiedBullets < 3
        ? "Add at least three quantified outcomes."
        : "Strong use of quantified outcomes.",
      result.missingKeywords.length
        ? `Consider truthful evidence for: ${result.missingKeywords.slice(0, 5).join(", ")}.`
        : "Your resume covers the main job-description keywords.",
    ],
  });
});

const HuntSchema = z.object({
  runName: z.string().trim().min(1).max(200).optional(),
  origin: z.enum(["manual", "infinite"]).optional(),
  q: z.string().max(200).optional(),
  location: z.string().max(200).optional(),
  minFit: z.coerce.number().min(0).max(100).optional(),
  maxResults: z.coerce.number().min(1).max(100).optional(),
  requiredKeywords: z.array(z.string().max(100)).max(20).optional(),
  excludeKeywords: z.array(z.string().max(100)).max(20).optional(),
  workflows: z
    .array(
      z.enum([
        "linkedin",
        "indeed",
        "glassdoor",
        "hiringcafe",
        "jobright",
        "simplify",
        "workatastartup",
        "ziprecruiter",
        "dice",
        "company",
      ]),
    )
    .min(1)
    .max(10)
    .optional(),
  optimizeResume: z.boolean().optional(),
});
const huntOptions = (input, profile) =>
  HuntSchema.parse({
    runName:
      input.runName ||
      input.q ||
      profile.targetRoles?.[0] ||
      "Software Engineer",
    origin: input.origin || "infinite",
    q: input.q || profile.targetRoles?.[0] || "Software Engineer",
    location: input.location ?? profile.preferences?.locations?.[0] ?? "",
    minFit: input.minFit ?? 60,
    maxResults: input.maxResults ?? 25,
    requiredKeywords: input.requiredKeywords || [],
    excludeKeywords: input.excludeKeywords || [],
    workflows: input.workflows || ["linkedin", "indeed"],
    optimizeResume: Boolean(input.optimizeResume),
  });

const InfiniteHuntSchema = z.object({
  intervalMinutes: z.coerce.number().int().min(1).max(1440),
  options: HuntSchema,
});

app.post("/api/infinite-hunt/start", async (req, res) => {
  const parsed = InfiniteHuntSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Invalid infinite hunt schedule" });
  const current = await readDb();
  const options = huntOptions(parsed.data.options, current.profile);
  if (options.optimizeResume && !isUsableResumeText(current.profile.resumeText))
    return res.status(409).json({
      error: "Add a real profile resume before generating tailored resumes",
    });
  const schedule = await mutate((db) => {
    const startedAt = timestamp();
    db.infiniteHunt = {
      enabled: true,
      intervalMinutes: parsed.data.intervalMinutes,
      options,
      startedAt,
      nextRunAt: new Date(
        Date.now() + parsed.data.intervalMinutes * 60_000,
      ).toISOString(),
      lastRunAt: db.infiniteHunt?.lastRunAt || null,
      lastError: "",
    };
    auditEvent(
      db,
      "agent",
      `Started infinite hunt every ${parsed.data.intervalMinutes} minute${parsed.data.intervalMinutes === 1 ? "" : "s"}.`,
    );
    return db.infiniteHunt;
  });
  res.status(201).json(schedule);
});

app.post("/api/infinite-hunt/stop", async (_req, res) => {
  const schedule = await mutate((db) => {
    db.infiniteHunt ||= {};
    db.infiniteHunt.enabled = false;
    db.infiniteHunt.nextRunAt = null;
    auditEvent(db, "agent", "Stopped infinite hunt.");
    return db.infiniteHunt;
  });
  res.json(schedule);
});

app.post("/api/agent-runs/preview", async (req, res) => {
  const db = await readDb();
  const options = huntOptions(req.body, db.profile);
  const matches = findLocalMatches(seedJobs, db.profile, options);
  res.json({
    options,
    inspected: seedJobs.length,
    matches,
    alreadyTracked: matches.filter((match) =>
      db.jobs.some((job) => job.url === match.url),
    ).length,
  });
});
app.post("/api/agent-runs/start", async (req, res) => {
  const current = await readDb();
  const requestedOptions = huntOptions(req.body, current.profile);
  if (
    requestedOptions.optimizeResume &&
    !isUsableResumeText(current.profile.resumeText)
  )
    return res.status(409).json({
      error: "Add a real profile resume before generating tailored resumes",
    });
  const run = await mutate((db) => {
    const runId = nanoid();
    const options = huntOptions(req.body, db.profile);
    const matches = findLocalMatches(seedJobs, db.profile, options);
    let added = 0;
    let duplicates = 0;
    let optimizedResumes = 0;
    let originalResumes = 0;
    let queued = 0;
    for (const match of matches) {
      if (db.jobs.some((job) => job.url && job.url === match.url)) {
        duplicates++;
        continue;
      }
      const job = { ...match };
      delete job.eligible;
      delete job.rejectedBecause;
      const savedJob = {
        ...job,
        id: nanoid(),
        workflowRunId: runId,
        status: "saved",
        matchReasons: match.reasons,
        createdAt: timestamp(),
        updatedAt: timestamp(),
        notes: [],
        tasks: [],
        contacts: [],
        statusHistory: [
          { status: "saved", at: timestamp(), source: "local-hunt" },
        ],
      };
      db.jobs.unshift(savedJob);
      added++;
      if (options.optimizeResume) {
        const original = scoreResumeAgainstJob(
          db.profile.resumeText,
          savedJob,
          db.profile,
        );
        const threshold = Number(db.profile.preferences?.atsThreshold ?? 80);
        let resumeId = "profile-resume";
        let decision = "original";
        if (original.score < threshold) {
          const truthfulKeywords = original.missingKeywords
            .filter((word) =>
              (db.profile.skills || []).some(
                (skill) => String(skill).toLowerCase() === word,
              ),
            )
            .slice(0, 5);
          const tailored = {
            id: nanoid(),
            name: `${savedJob.company} — ${savedJob.title}`,
            templateId: db.templates[0]?.id || "clean-ats",
            jobId: savedJob.id,
            content: [
              db.profile.resumeText,
              truthfulKeywords.length
                ? `\n\nRELEVANT SKILLS\n${truthfulKeywords.join(" · ")}`
                : "",
            ].join(""),
            sourceAtsScore: original.score,
            generatedBy: "infinite-hunt",
            createdAt: timestamp(),
            updatedAt: timestamp(),
          };
          db.resumes.unshift(tailored);
          resumeId = tailored.id;
          decision = "optimized";
          optimizedResumes++;
        } else {
          originalResumes++;
        }
        db.submissions.unshift({
          id: nanoid(),
          jobId: savedJob.id,
          resumeId,
          coverLetterId: "",
          status: "draft",
          atsScore: original.score,
          atsThreshold: threshold,
          atsDecision: decision,
          applicationQuestions: applicationQuestionsFor(db),
          checklist: [
            { id: nanoid(), text: "Review resume alignment", done: false },
            { id: nanoid(), text: "Review cover letter", done: false },
            {
              id: nanoid(),
              text: "Confirm application details",
              done: false,
            },
          ],
          createdAt: timestamp(),
          updatedAt: timestamp(),
        });
        savedJob.status = "interested";
        savedJob.updatedAt = timestamp();
        savedJob.statusHistory.unshift({
          status: "interested",
          at: timestamp(),
          source: "infinite-hunt",
        });
        queued++;
      }
    }
    const steps = [
      {
        name: "Read local profile",
        status: "completed",
        detail: `${db.profile.skills.length} skills and ${db.profile.targetRoles.length} target roles loaded`,
      },
      {
        name: "Apply search rules",
        status: "completed",
        detail: `Query “${options.q}”, location “${options.location || "any"}”, ${options.requiredKeywords.length} required and ${options.excludeKeywords.length} excluded keywords`,
      },
      {
        name: "Run selected workflows",
        status: "completed",
        detail: `${options.workflows.join(", ")} executed in the configured order`,
      },
      {
        name: "Score local catalog",
        status: "completed",
        detail: `${matches.length} of ${seedJobs.length} roles met every rule and the ${options.minFit}% threshold`,
      },
      {
        name: "Save and deduplicate",
        status: "completed",
        detail: `${added} saved, ${duplicates} already tracked`,
      },
    ];
    if (options.optimizeResume) {
      steps.push({
        name: "Prepare application packets",
        status: "completed",
        detail: `${queued} queued · ${optimizedResumes} ATS resumes generated · ${originalResumes} original resumes already met the threshold`,
      });
    }
    const item = {
      id: runId,
      runName: options.runName,
      origin: options.origin,
      status: "completed",
      createdAt: timestamp(),
      completedAt: timestamp(),
      search: { q: options.q, location: options.location },
      options,
      workflows: options.workflows,
      optimizeResume: options.optimizeResume,
      inspected: seedJobs.length,
      found: matches.length,
      added,
      duplicates,
      queued,
      optimizedResumes,
      originalResumes,
      minFit: options.minFit,
      matches: matches.map((m) => ({
        company: m.company,
        title: m.title,
        location: m.location,
        url: m.url,
        fitScore: m.fitScore,
        reasons: m.reasons,
      })),
      steps,
      actions: matches.map(
        (m) => `Matched ${m.title} at ${m.company} (${m.fitScore}% fit)`,
      ),
    };
    db.agentRuns.unshift(item);
    db.agentRuns = db.agentRuns.slice(0, 100);
    auditEvent(
      db,
      "agent",
      `Local hunt inspected ${seedJobs.length} roles, matched ${matches.length}, and saved ${added}.`,
      { runId: item.id },
    );
    return item;
  });
  res.status(201).json(run);
});
app.delete("/api/agent-runs/:id", async (req, res) => {
  const deleted = await mutate((db) => {
    const index = db.agentRuns.findIndex((run) => run.id === req.params.id);
    if (index < 0) return false;
    const [run] = db.agentRuns.splice(index, 1);
    auditEvent(db, "agent", `Deleted agent run ${run.search?.q || run.id}.`, {
      runId: run.id,
    });
    return true;
  });
  if (!deleted) return res.status(404).json({ error: "Agent run not found" });
  res.status(204).end();
});
app.get("/api/hunt-presets", async (_req, res) => {
  const db = await readDb();
  res.json(db.huntPresets);
});
app.post("/api/hunt-presets", async (req, res) => {
  const preset = await mutate((db) => {
    const options = huntOptions(req.body, db.profile);
    const item = {
      id: nanoid(),
      name: safeText(req.body.name, 100) || options.q,
      options,
      createdAt: timestamp(),
      updatedAt: timestamp(),
    };
    db.huntPresets.unshift(item);
    auditEvent(db, "agent", `Saved hunt preset “${item.name}”.`);
    return item;
  });
  res.status(201).json(preset);
});
app.delete("/api/hunt-presets/:id", async (req, res) => {
  const removed = await mutate((db) => {
    const before = db.huntPresets.length;
    db.huntPresets = db.huntPresets.filter((x) => x.id !== req.params.id);
    return before !== db.huntPresets.length;
  });
  res.status(removed ? 204 : 404).end();
});
const csvEscape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
app.get("/api/export/jobs.csv", async (_req, res) => {
  const db = await readDb();
  const columns = [
    "company",
    "title",
    "status",
    "location",
    "salary",
    "url",
    "source",
    "fitScore",
    "tags",
    "description",
  ];
  const rows = [
    columns.join(","),
    ...db.jobs.map((j) =>
      columns
        .map((c) => csvEscape(c === "tags" ? (j.tags || []).join("|") : j[c]))
        .join(","),
    ),
  ];
  res
    .type("text/csv")
    .setHeader(
      "Content-Disposition",
      'attachment; filename="jobhuntr-jobs.csv"',
    );
  res.send(rows.join("\n"));
});

app.post("/api/import/jobs", async (req, res) => {
  const jobs = z
    .array(
      JobSchema.partial().extend({
        company: z.string().min(1),
        title: z.string().min(1),
      }),
    )
    .max(5000)
    .parse(req.body.jobs);
  const result = await mutate((db) => {
    let added = 0,
      skipped = 0;
    for (const raw of jobs) {
      if (raw.url && db.jobs.some((j) => j.url === raw.url)) {
        skipped++;
        continue;
      }
      const parsed = JobSchema.parse(raw);
      db.jobs.unshift({
        id: nanoid(),
        createdAt: timestamp(),
        updatedAt: timestamp(),
        notes: [],
        tasks: [],
        contacts: [],
        statusHistory: [{ status: parsed.status, at: timestamp() }],
        fitScore: scoreJob(parsed, db.profile),
        ...parsed,
      });
      added++;
    }
    auditEvent(
      db,
      "import",
      `Imported ${added} jobs; skipped ${skipped} duplicates.`,
    );
    return { added, skipped };
  });
  res.status(201).json(result);
});

app.get("/api/export", async (_req, res) => {
  const db = await readDb();
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="jobhuntr-export.json"',
  );
  res.json(db);
});

const BackupRecordSchema = z.record(z.string(), z.unknown());
const BackupSchema = z.object({
  meta: BackupRecordSchema.optional(),
  profile: BackupRecordSchema.optional(),
  jobs: z.array(BackupRecordSchema).max(5000),
  resumes: z.array(BackupRecordSchema).max(500).optional(),
  coverLetters: z.array(BackupRecordSchema).max(1000).optional(),
  templates: z.array(BackupRecordSchema).max(500).optional(),
  submissions: z.array(BackupRecordSchema).max(5000).optional(),
  coachConversations: z.array(BackupRecordSchema).max(500).optional(),
  coachingSessions: z.array(BackupRecordSchema).max(1000).optional(),
  outreachDrafts: z.array(BackupRecordSchema).max(5000).optional(),
  huntPresets: z.array(BackupRecordSchema).max(500).optional(),
  careerStories: z.array(BackupRecordSchema).max(1000).optional(),
  profileAudits: z.array(BackupRecordSchema).max(1000).optional(),
  gigs: z.array(BackupRecordSchema).max(5000).optional(),
  agentRuns: z.array(BackupRecordSchema).max(5000).optional(),
  infiniteHunt: BackupRecordSchema.optional(),
  activities: z.array(BackupRecordSchema).max(10000).optional(),
});

app.post("/api/import", async (req, res) => {
  const parsed = BackupSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({
      error: "Invalid or oversized JobHuntr backup",
      details: parsed.error.issues,
    });
  const imported = parsed.data;
  await mutate((db) => {
    for (const [key, value] of Object.entries(imported)) db[key] = value;
    auditEvent(db, "import", "Imported and migrated a local JobHuntr backup.");
  });
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  if (err instanceof z.ZodError)
    return res
      .status(400)
      .json({ error: "Invalid request", details: err.issues });
  console.error(err);
  res.status(500).json({ error: "Local server error" });
});

const publicDir = path.join(__dirname, "..", "dist", "public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

let schedulerBusy = false;
export const runScheduledHunt = async (
  baseUrl = `http://127.0.0.1:${PORT}`,
) => {
  if (schedulerBusy) return;
  schedulerBusy = true;
  try {
    const db = await readDb();
    const schedule = db.infiniteHunt;
    if (
      !schedule?.enabled ||
      !schedule.options ||
      !schedule.nextRunAt ||
      Date.parse(schedule.nextRunAt) > Date.now()
    )
      return;
    const nextRunAt = new Date(
      Date.now() + schedule.intervalMinutes * 60_000,
    ).toISOString();
    await mutate((current) => {
      if (!current.infiniteHunt?.enabled) return;
      current.infiniteHunt.nextRunAt = nextRunAt;
      current.infiniteHunt.lastError = "";
    });
    const response = await fetch(`${baseUrl}/api/agent-runs/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...schedule.options, origin: "infinite" }),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || `Hunt failed with ${response.status}`);
    }
    await mutate((current) => {
      if (!current.infiniteHunt) return;
      current.infiniteHunt.lastRunAt = timestamp();
      current.infiniteHunt.lastError = "";
    });
  } catch (error) {
    await mutate((db) => {
      if (!db.infiniteHunt) return;
      db.infiniteHunt.lastError = safeText(error.message, 500);
      auditEvent(db, "agent", "Infinite hunt run failed safely.");
    }).catch(() => {});
  } finally {
    schedulerBusy = false;
  }
};

if (process.env.NODE_ENV !== "test")
  app.listen(PORT, HOST, () => {
    console.log(
      `JobHuntr OSS running at http://${HOST}:${PORT} (local data: ${DB_PATH})`,
    );
    const scheduler = setInterval(runScheduledHunt, 1000);
    scheduler.unref();
    void runScheduledHunt();
  });
export default app;
