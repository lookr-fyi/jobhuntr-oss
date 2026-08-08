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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_VERSION = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
).version;
const app = express();
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
app.disable("x-powered-by");
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
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
  );
  next();
});
app.use(express.json({ limit: "2mb" }));

const timestamp = () => new Date().toISOString();
const safeText = (value, max = 10000) =>
  String(value ?? "")
    .trim()
    .slice(0, max);
const safeDueDate = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : "";

const JobSchema = z.object({
  company: z.string().min(1),
  title: z.string().min(1),
  location: z.string().optional().default(""),
  url: z.string().optional().default(""),
  source: z.string().optional().default("Manual"),
  salary: z.string().optional().default(""),
  description: z.string().optional().default(""),
  tags: z.array(z.string()).optional().default([]),
  status: z.string().optional().default("saved"),
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
  const profile = req.body || {};
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
  const job = await mutate((db) => {
    const item = db.jobs.find((j) => j.id === req.params.id);
    if (!item) return null;
    const previousStatus = item.status;
    Object.assign(item, req.body, { updatedAt: timestamp() });
    if (req.body.status && req.body.status !== previousStatus)
      (item.statusHistory ||= []).unshift({
        status: req.body.status,
        at: timestamp(),
      });
    item.fitScore = scoreJob(item, db.profile);
    auditEvent(db, "job", `Updated ${item.title} at ${item.company}.`, {
      jobId: item.id,
    });
    return item;
  });
  if (!job) return res.status(404).json({ error: "Job not found" });
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
  const note = await mutate((db) => {
    const job = db.jobs.find((j) => j.id === req.params.id);
    if (!job) return null;
    const note = {
      id: nanoid(),
      at: timestamp(),
      text: safeText(req.body.text, 4000),
    };
    job.notes.unshift(note);
    auditEvent(db, "note", `Added note to ${job.company}.`, { jobId: job.id });
    return note;
  });
  if (!note) return res.status(404).json({ error: "Job not found" });
  res.status(201).json(note);
});

app.post("/api/jobs/:id/contacts", async (req, res) => {
  const contact = await mutate((db) => {
    const job = db.jobs.find((j) => j.id === req.params.id);
    if (!job) return null;
    const item = {
      id: nanoid(),
      name: safeText(req.body.name, 100),
      role: safeText(req.body.role, 100),
      email: safeText(req.body.email, 200),
      linkedIn: safeText(req.body.linkedIn, 500),
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

app.get("/api/templates", async (_req, res) => {
  const db = await readDb();
  res.json(db.templates);
});

app.post("/api/resumes", async (req, res) => {
  const resume = await mutate((db) => {
    const item = {
      id: nanoid(),
      name: safeText(req.body.name, 120) || `Resume ${db.resumes.length + 1}`,
      templateId: safeText(req.body.templateId, 50) || "clean-ats",
      content: safeText(req.body.content || db.profile.resumeText, 100000),
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
  const resume = await mutate((db) => {
    const item = db.resumes.find((r) => r.id === req.params.id);
    if (!item) return null;
    if (req.body.name !== undefined) item.name = safeText(req.body.name, 120);
    if (req.body.templateId !== undefined)
      item.templateId = safeText(req.body.templateId, 50);
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
  const task = await mutate((db) => {
    const job = db.jobs.find((j) => j.id === req.params.id);
    if (!job) return null;
    const task = {
      id: nanoid(),
      text: safeText(req.body.text || "Follow up", 500),
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
  const letter = await mutate((db) => {
    const job =
      db.jobs.find((j) => j.id === req.body.jobId) || req.body.job || {};
    const skills = (db.profile.skills || []).slice(0, 4).join(", ");
    const body = `Dear ${job.company || "Hiring Team"},\n\nI am excited to apply for the ${job.title || "role"} position. My background in ${skills || "shipping user-focused software"} maps well to your needs, and I am especially interested in ${job.description || "the opportunity to contribute quickly and thoughtfully"}.\n\nIn prior work I have built reliable product workflows, improved user experience, and operated with strong ownership. I would welcome the chance to discuss how I can help ${job.company || "your team"} deliver meaningful results.\n\nBest,\n${db.profile.name}`;
    const item = {
      id: nanoid(),
      jobId: job.id,
      createdAt: new Date().toISOString(),
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
      checklist: [
        {
          id: nanoid(),
          text: "Review resume alignment",
          done: Boolean(req.body.resumeId),
        },
        {
          id: nanoid(),
          text: "Review cover letter",
          done: Boolean(req.body.coverLetterId),
        },
        { id: nanoid(), text: "Confirm application details", done: false },
      ],
      createdAt: timestamp(),
      updatedAt: timestamp(),
    };
    db.submissions.unshift(item);
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
    if (req.body.checklist) item.checklist = req.body.checklist;
    if (req.body.resumeId !== undefined)
      item.resumeId = safeText(req.body.resumeId, 50);
    if (req.body.coverLetterId !== undefined)
      item.coverLetterId = safeText(req.body.coverLetterId, 50);
    if (
      req.body.status &&
      ["draft", "ready", "submitted", "archived"].includes(req.body.status)
    )
      item.status = req.body.status;
    item.updatedAt = timestamp();
    return item;
  });
  if (!submission)
    return res.status(404).json({ error: "Submission not found" });
  res.json(submission);
});
app.post("/api/submissions/:id/submit", async (req, res) => {
  const submission = await mutate((db) => {
    const item = db.submissions.find((s) => s.id === req.params.id);
    if (!item) return null;
    if (!item.checklist.every((x) => x.done)) return { blocked: true, item };
    const job = db.jobs.find((j) => j.id === item.jobId);
    item.status = "submitted";
    item.submittedAt = timestamp();
    item.updatedAt = timestamp();
    item.applicationUrl = safeText(req.body.applicationUrl || job?.url, 1000);
    if (job) {
      job.status = "applied";
      job.updatedAt = timestamp();
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
  const draft = await mutate((db) => {
    const job = db.jobs.find((j) => j.id === req.body.jobId);
    if (!job) return null;
    const contact =
      job.contacts.find((c) => c.id === req.body.contactId) || job.contacts[0];
    const recipient = contact?.name || "there";
    const body = `Hi ${recipient},\n\nI’m exploring the ${job.title} opportunity at ${job.company}. My background in ${(db.profile.skills || []).slice(0, 3).join(", ")} looks closely aligned, particularly with ${job.description || "the team’s product goals"}.\n\nIf you’re open to it, I’d appreciate hearing what the team values most in candidates for this role.\n\nBest,\n${db.profile.name}`;
    const item = {
      id: nanoid(),
      jobId: job.id,
      contactId: contact?.id || "",
      channel: req.body.channel === "email" ? "email" : "linkedin",
      subject: `Interest in ${job.title} at ${job.company}`,
      body,
      status: "draft",
      createdAt: timestamp(),
      updatedAt: timestamp(),
    };
    db.outreachDrafts.unshift(item);
    auditEvent(db, "outreach", `Drafted outreach for ${job.company}.`, {
      jobId: job.id,
    });
    return item;
  });
  if (!draft) return res.status(404).json({ error: "Job not found" });
  res.status(201).json(draft);
});
app.patch("/api/outreach/:id", async (req, res) => {
  const draft = await mutate((db) => {
    const item = db.outreachDrafts.find((x) => x.id === req.params.id);
    if (!item) return null;
    if (req.body.subject !== undefined)
      item.subject = safeText(req.body.subject, 300);
    if (req.body.body !== undefined) item.body = safeText(req.body.body, 20000);
    if (["draft", "sent", "replied", "archived"].includes(req.body.status))
      item.status = req.body.status;
    item.updatedAt = timestamp();
    return item;
  });
  if (!draft)
    return res.status(404).json({ error: "Outreach draft not found" });
  res.json(draft);
});

app.post("/api/resume/score", async (req, res) => {
  const db = await readDb();
  const text = String(req.body.resumeText || db.profile.resumeText || "");
  const job =
    req.body.job || db.jobs.find((j) => j.id === req.body.jobId) || {};
  const jd =
    `${job.title || ""} ${job.description || ""} ${(job.tags || []).join(" ")}`.toLowerCase();
  const skills = db.profile.skills || [];
  const hits = skills.filter(
    (s) =>
      text.toLowerCase().includes(String(s).toLowerCase()) ||
      jd.includes(String(s).toLowerCase()),
  );
  const missing = skills.filter((s) => !hits.includes(s)).slice(0, 6);
  const jobWords = [...new Set(jd.match(/[a-z][a-z+#.-]{2,}/g) || [])].filter(
    (w) =>
      !["and", "the", "with", "for", "you", "our", "this", "that"].includes(w),
  );
  const resumeLower = text.toLowerCase();
  const keywordHits = jobWords
    .filter((w) => resumeLower.includes(w))
    .slice(0, 20);
  const missingKeywords = jobWords
    .filter((w) => !resumeLower.includes(w))
    .slice(0, 10);
  const quantified = (text.match(/\b\d+(?:%|x|k|m|\+)?\b/gi) || []).length;
  const score = Math.min(
    98,
    42 +
      hits.length * 6 +
      Math.min(keywordHits.length, 10) * 3 +
      Math.min(quantified, 5) * 2,
  );
  res.json({
    score,
    hits,
    missing,
    keywordHits,
    missingKeywords,
    quantifiedBullets: quantified,
    suggestions: [
      `Mirror the job title: ${job.title || "target role"}.`,
      quantified < 3
        ? "Add at least three quantified outcomes."
        : "Strong use of quantified outcomes.",
      missingKeywords.length
        ? `Consider truthful evidence for: ${missingKeywords.slice(0, 5).join(", ")}.`
        : "Your resume covers the main job-description keywords.",
    ],
  });
});

const HuntSchema = z.object({
  q: z.string().max(200).optional(),
  location: z.string().max(200).optional(),
  minFit: z.coerce.number().min(0).max(100).optional(),
  maxResults: z.coerce.number().min(1).max(100).optional(),
  requiredKeywords: z.array(z.string().max(100)).max(20).optional(),
  excludeKeywords: z.array(z.string().max(100)).max(20).optional(),
});
const huntOptions = (input, profile) =>
  HuntSchema.parse({
    q: input.q || profile.targetRoles?.[0] || "Software Engineer",
    location: input.location ?? profile.preferences?.locations?.[0] ?? "",
    minFit: input.minFit ?? 60,
    maxResults: input.maxResults ?? 25,
    requiredKeywords: input.requiredKeywords || [],
    excludeKeywords: input.excludeKeywords || [],
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
  const run = await mutate((db) => {
    const options = huntOptions(req.body, db.profile);
    const matches = findLocalMatches(seedJobs, db.profile, options);
    let added = 0;
    let duplicates = 0;
    for (const match of matches) {
      if (db.jobs.some((job) => job.url && job.url === match.url)) {
        duplicates++;
        continue;
      }
      const job = { ...match };
      delete job.eligible;
      delete job.rejectedBecause;
      db.jobs.unshift({
        ...job,
        id: nanoid(),
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
      });
      added++;
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
    const item = {
      id: nanoid(),
      status: "completed",
      createdAt: timestamp(),
      completedAt: timestamp(),
      search: { q: options.q, location: options.location },
      options,
      inspected: seedJobs.length,
      found: matches.length,
      added,
      duplicates,
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
app.post("/api/import", async (req, res) => {
  const imported = req.body;
  if (
    !imported ||
    typeof imported !== "object" ||
    Array.isArray(imported) ||
    !Array.isArray(imported.jobs)
  )
    return res
      .status(400)
      .json({ error: "Expected a JobHuntr export with jobs[]" });
  if (imported.jobs.length > 5000 || (imported.activities?.length || 0) > 10000)
    return res
      .status(400)
      .json({ error: "Backup exceeds safe local import limits" });
  const allowed = [
    "meta",
    "profile",
    "jobs",
    "resumes",
    "coverLetters",
    "templates",
    "submissions",
    "coachingSessions",
    "outreachDrafts",
    "huntPresets",
    "careerStories",
    "agentRuns",
    "activities",
  ];
  await mutate((db) => {
    for (const key of allowed)
      if (imported[key] !== undefined) db[key] = imported[key];
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

if (process.env.NODE_ENV !== "test")
  app.listen(PORT, HOST, () =>
    console.log(
      `JobHuntr OSS running at http://${HOST}:${PORT} (local data: ${DB_PATH})`,
    ),
  );
export default app;
