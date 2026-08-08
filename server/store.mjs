import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";

export const DATA_DIR = path.resolve(process.env.JOBHUNTR_DATA_DIR || "./data");
export const DB_PATH = path.join(DATA_DIR, "jobhuntr.json");
export const BACKUP_PATH = path.join(DATA_DIR, "jobhuntr.backup.json");

const now = () => new Date().toISOString();

export const seedJobs = [
  {
    company: "Acme AI",
    title: "Founding Product Engineer",
    location: "Remote",
    url: "https://example.com/acme-ai-product-engineer",
    source: "Seed Board",
    salary: "$150k-$210k",
    tags: ["ai", "startup", "remote"],
    description: "Build AI workflows and customer-facing product surfaces.",
  },
  {
    company: "Northstar Robotics",
    title: "Frontend Platform Engineer",
    location: "San Francisco, CA",
    url: "https://example.com/northstar-frontend",
    source: "Seed Board",
    salary: "$145k-$190k",
    tags: ["react", "platform"],
    description: "Own design systems, app shell, and frontend reliability.",
  },
  {
    company: "Civic Health Labs",
    title: "Full Stack Engineer",
    location: "New York, NY",
    url: "https://example.com/civic-fullstack",
    source: "Seed Board",
    salary: "$130k-$175k",
    tags: ["fullstack", "impact"],
    description: "Ship local-first health workflow software.",
  },
  {
    company: "Orbit Data",
    title: "Developer Tools Engineer",
    location: "Remote US",
    url: "https://example.com/orbit-devtools",
    source: "Seed Board",
    salary: "$160k-$220k",
    tags: ["devtools", "typescript"],
    description: "Design SDKs, CLI tools, and diagnostics for data teams.",
  },
];

export function emptyDb() {
  const createdAt = now();
  return {
    meta: { version: 8, createdAt, updatedAt: createdAt },
    profile: {
      onboarded: false,
      name: "Local Job Hunter",
      headline: "Full-stack builder looking for high-impact teams",
      location: "United States",
      targetRoles: ["Software Engineer", "Product Engineer"],
      skills: ["TypeScript", "React", "Python", "Automation"],
      resumeText:
        "Paste your resume here. JobHuntr stores it only on this machine.",
      preferences: {
        remote: true,
        locations: ["Remote"],
        minSalary: 120000,
        weeklyApplicationGoal: 5,
      },
    },
    jobs: seedJobs.slice(0, 2).map((job, index) => ({
      id: nanoid(),
      status: index === 0 ? "interested" : "saved",
      statusHistory: [
        { status: index === 0 ? "interested" : "saved", at: createdAt },
      ],
      fitScore: scoreJob(job, {
        skills: ["TypeScript", "React", "Python", "Automation"],
        targetRoles: ["Software Engineer", "Product Engineer"],
        preferences: { remote: true },
      }),
      createdAt,
      updatedAt: createdAt,
      notes: [],
      tasks: [],
      contacts: [],
      ...job,
    })),
    resumes: [],
    coverLetters: [],
    templates: defaultTemplates(),
    submissions: [],
    coachingSessions: [],
    outreachDrafts: [],
    huntPresets: [],
    careerStories: [],
    profileAudits: [],
    gigs: [],
    agentRuns: [],
    activities: [
      {
        id: nanoid(),
        at: createdAt,
        type: "system",
        message: "Initialized local JobHuntr workspace.",
      },
    ],
  };
}

export function defaultTemplates() {
  return [
    {
      id: "clean-ats",
      name: "Clean ATS",
      description: "Single-column, keyword-forward resume structure.",
      sections: ["Summary", "Skills", "Experience", "Projects", "Education"],
    },
    {
      id: "impact",
      name: "Impact Builder",
      description: "Prioritizes quantified outcomes and ownership.",
      sections: [
        "Headline",
        "Selected impact",
        "Experience",
        "Skills",
        "Education",
      ],
    },
    {
      id: "career-switch",
      name: "Career Switch",
      description: "Leads with transferable skills and relevant projects.",
      sections: [
        "Target summary",
        "Relevant skills",
        "Projects",
        "Experience",
        "Education",
      ],
    },
  ];
}

function migrate(db) {
  db.meta ||= {};
  db.profile ||= emptyDb().profile;
  db.jobs ||= [];
  db.resumes ||= [];
  db.coverLetters ||= [];
  db.templates ||= defaultTemplates();
  db.submissions ||= [];
  db.coachingSessions ||= [];
  db.outreachDrafts ||= [];
  db.huntPresets ||= [];
  db.careerStories ||= [];
  db.profileAudits ||= [];
  db.gigs ||= [];
  for (const gig of db.gigs) {
    gig.status ||= "lead";
    gig.statusHistory ||= [{ status: gig.status, at: gig.createdAt || now() }];
  }
  for (const draft of db.outreachDrafts) draft.status ||= "draft";
  for (const session of db.coachingSessions) {
    session.status ||= "in-progress";
    session.answers ||= Object.fromEntries(
      (session.questions || []).map((q) => [q, ""]),
    );
    session.matchedStoryIds ||= [];
    session.researchDone ||= [];
  }
  db.agentRuns ||= [];
  db.activities ||= [];
  for (const job of db.jobs) {
    job.notes ||= [];
    job.tasks ||= [];
    job.contacts ||= [];
    job.tags ||= [];
    job.statusHistory ||= [
      { status: job.status || "saved", at: job.createdAt || now() },
    ];
  }
  db.meta.version = 8;
  return db;
}

async function ensure() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DB_PATH);
  } catch {
    await writeDb(emptyDb());
  }
}

export async function readDb() {
  await ensure();
  const raw = await fs.readFile(DB_PATH, "utf8");
  try {
    return migrate(JSON.parse(raw));
  } catch (error) {
    try {
      const backup = migrate(
        JSON.parse(await fs.readFile(BACKUP_PATH, "utf8")),
      );
      await fs.rename(
        DB_PATH,
        path.join(DATA_DIR, `jobhuntr.corrupt-${Date.now()}.json`),
      );
      await fs.copyFile(BACKUP_PATH, DB_PATH);
      return backup;
    } catch {
      throw new Error(`Local JobHuntr data is unreadable: ${error.message}`);
    }
  }
}

export async function writeDb(db) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  db.meta = db.meta || {};
  db.meta.updatedAt = now();
  const tmp = `${DB_PATH}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  try {
    await fs.copyFile(DB_PATH, BACKUP_PATH);
  } catch {}
  await fs.rename(tmp, DB_PATH);
  return db;
}

let mutationQueue = Promise.resolve();
export function mutate(fn) {
  const operation = mutationQueue.then(async () => {
    const db = await readDb();
    const result = await fn(db);
    await writeDb(db);
    return result ?? db;
  });
  mutationQueue = operation.catch(() => {});
  return operation;
}

export function auditEvent(db, type, message, data = {}) {
  db.activities.unshift({ id: nanoid(), at: now(), type, message, data });
  db.activities = db.activities.slice(0, 500);
}

export function scoreJob(job, profile) {
  const haystack =
    `${job.title || ""} ${job.company || ""} ${job.description || ""} ${(job.tags || []).join(" ")}`.toLowerCase();
  const skills = profile.skills || [];
  const roles = profile.targetRoles || [];
  const skillHits = skills.filter((s) =>
    haystack.includes(String(s).toLowerCase()),
  ).length;
  const roleHits = roles.filter((r) =>
    haystack.includes(String(r).toLowerCase().split(" ")[0]),
  ).length;
  const remoteBoost =
    profile.preferences?.remote &&
    String(job.location || "")
      .toLowerCase()
      .includes("remote")
      ? 10
      : 0;
  return Math.max(
    30,
    Math.min(99, 50 + skillHits * 8 + roleHits * 10 + remoteBoost),
  );
}

export function findLocalMatches(catalog, profile, options = {}) {
  const q = String(options.q || "")
    .trim()
    .toLowerCase();
  const queryTokens = q
    .split(/\s+/)
    .filter(
      (token) => token.length > 1 && !["and", "or", "the"].includes(token),
    );
  const location = String(options.location || "")
    .trim()
    .toLowerCase();
  const excludes = (options.excludeKeywords || [])
    .map((x) => String(x).trim().toLowerCase())
    .filter(Boolean);
  const required = (options.requiredKeywords || [])
    .map((x) => String(x).trim().toLowerCase())
    .filter(Boolean);
  const minFit = Math.max(0, Math.min(100, Number(options.minFit ?? 60)));
  const maxResults = Math.max(
    1,
    Math.min(100, Number(options.maxResults ?? 25)),
  );
  const unique = catalog.filter(
    (job, index, all) =>
      all.findIndex((item) =>
        item.url
          ? item.url === job.url
          : item.company === job.company && item.title === job.title,
      ) === index,
  );
  return unique
    .map((job) => {
      const haystack =
        `${job.title || ""} ${job.company || ""} ${job.location || ""} ${job.description || ""} ${(job.tags || []).join(" ")}`.toLowerCase();
      const fitScore = scoreJob(job, profile);
      const matchedTerms = queryTokens.filter((term) =>
        haystack.includes(term),
      );
      const excludedTerms = excludes.filter((term) => haystack.includes(term));
      const missingRequired = required.filter(
        (term) => !haystack.includes(term),
      );
      const queryMatch = !queryTokens.length || matchedTerms.length > 0;
      const locationMatch =
        !location ||
        String(job.location || "")
          .toLowerCase()
          .includes(location) ||
        (location === "remote" && /remote|anywhere/.test(haystack));
      const eligible =
        queryMatch &&
        locationMatch &&
        !excludedTerms.length &&
        !missingRequired.length &&
        fitScore >= minFit;
      const reasons = [
        ...matchedTerms.map((term) => `matches “${term}”`),
        ...(fitScore >= minFit ? [`${fitScore}% profile fit`] : []),
        ...(locationMatch && location
          ? [`location matches “${location}”`]
          : []),
        ...required.map((term) => `contains required “${term}”`),
      ];
      return {
        ...job,
        fitScore,
        eligible,
        reasons,
        rejectedBecause: [
          ...(!queryMatch ? ["query mismatch"] : []),
          ...(!locationMatch ? ["location mismatch"] : []),
          ...excludedTerms.map((term) => `excluded keyword “${term}”`),
          ...missingRequired.map((term) => `missing required “${term}”`),
          ...(fitScore < minFit ? [`fit below ${minFit}%`] : []),
        ],
      };
    })
    .filter((job) => job.eligible)
    .sort((a, b) => b.fitScore - a.fitScore)
    .slice(0, maxResults);
}

export function summarize(db) {
  const byStatus = db.jobs.reduce((acc, job) => {
    acc[job.status] = (acc[job.status] || 0) + 1;
    return acc;
  }, {});
  const openTasks = db.jobs.flatMap((j) =>
    (j.tasks || [])
      .filter((t) => !t.done)
      .map((t) => ({ ...t, jobId: j.id, company: j.company, title: j.title })),
  );
  const avgFit = db.jobs.length
    ? Math.round(
        db.jobs.reduce((sum, j) => sum + (j.fitScore || 0), 0) / db.jobs.length,
      )
    : 0;
  const applicationsThisWeek = db.jobs.filter((j) =>
    j.statusHistory?.some(
      (h) =>
        h.status === "applied" &&
        Date.now() - new Date(h.at).getTime() < 7 * 864e5,
    ),
  ).length;
  const interviews = db.jobs.filter((j) => j.status === "interview").length;
  const queue = db.submissions.filter((s) =>
    ["draft", "ready"].includes(s.status),
  );
  const currentTime = Date.now();
  const activeApplications = db.jobs.filter((job) =>
    ["applied", "interview", "offer"].includes(job.status),
  );
  const respondedApplications = db.jobs.filter((job) =>
    (job.statusHistory || []).some((event) =>
      ["interview", "offer"].includes(event.status),
    ),
  );
  const appliedEver = db.jobs.filter((job) =>
    (job.statusHistory || []).some((event) => event.status === "applied"),
  );
  const responseRate = appliedEver.length
    ? Math.min(
        100,
        Math.round((respondedApplications.length / appliedEver.length) * 100),
      )
    : 0;
  const overdueTasks = openTasks.filter(
    (task) =>
      task.due && new Date(`${task.due}T23:59:59`).getTime() < currentTime,
  );
  const upcomingTasks = openTasks
    .filter((task) => {
      const due = task.due && new Date(`${task.due}T23:59:59`).getTime();
      return due && due >= currentTime && due <= currentTime + 7 * 864e5;
    })
    .sort((a, b) => new Date(a.due) - new Date(b.due));
  const staleJobs = db.jobs.filter(
    (job) =>
      !["offer", "rejected"].includes(job.status) &&
      currentTime - new Date(job.updatedAt || job.createdAt).getTime() >
        14 * 864e5,
  );
  const weeklyGoal = Math.max(
    1,
    Number(db.profile.preferences?.weeklyApplicationGoal || 5),
  );
  const activeGigs = db.gigs.filter((gig) =>
    ["proposal", "negotiation", "won", "in-progress"].includes(gig.status),
  );
  const gigPipelineValue = db.gigs
    .filter((gig) => ["lead", "proposal", "negotiation"].includes(gig.status))
    .reduce((sum, gig) => sum + Number(gig.budget || 0), 0);
  const gigEarnings = db.gigs
    .filter((gig) => ["won", "in-progress", "completed"].includes(gig.status))
    .reduce((sum, gig) => sum + Number(gig.earned || 0), 0);
  return {
    totalJobs: db.jobs.length,
    byStatus,
    openTasks,
    avgFit,
    applicationsThisWeek,
    weeklyGoal,
    weeklyGoalProgress: Math.min(
      100,
      Math.round((applicationsThisWeek / weeklyGoal) * 100),
    ),
    interviews,
    activeApplications: activeApplications.length,
    responseRate,
    overdueTasks,
    upcomingTasks,
    staleJobs: staleJobs.map((job) => ({
      id: job.id,
      company: job.company,
      title: job.title,
      status: job.status,
      updatedAt: job.updatedAt,
    })),
    gigs: {
      total: db.gigs.length,
      active: activeGigs.length,
      pipelineValue: gigPipelineValue,
      earnings: gigEarnings,
      dueSoon: db.gigs
        .filter((gig) => {
          const due =
            gig.dueDate && new Date(`${gig.dueDate}T23:59:59`).getTime();
          return (
            due &&
            due >= currentTime &&
            due <= currentTime + 14 * 864e5 &&
            !["completed", "lost"].includes(gig.status)
          );
        })
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .slice(0, 8),
    },
    queueCount: queue.length,
    recentActivities: db.activities.slice(0, 12),
    activeRuns: db.agentRuns.filter((r) =>
      ["running", "paused"].includes(r.status),
    ),
  };
}
