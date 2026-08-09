import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";

export const DATA_DIR = path.resolve(process.env.JOBHUNTR_DATA_DIR || "./data");
export const DB_PATH = path.join(DATA_DIR, "jobhuntr.json");
export const BACKUP_PATH = path.join(DATA_DIR, "jobhuntr.backup.json");
const secureMode = async (target, mode) => {
  try {
    await fs.chmod(target, mode);
  } catch {}
};

const now = () => new Date().toISOString();
const hoursAgo = (hours) =>
  new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

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
    postedAt: hoursAgo(2),
    collectedAt: hoursAgo(1),
    numApplicants: 38,
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
    postedAt: hoursAgo(5),
    collectedAt: hoursAgo(3),
    numApplicants: 74,
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
    postedAt: hoursAgo(8),
    collectedAt: hoursAgo(6),
    numApplicants: 29,
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
    postedAt: hoursAgo(12),
    collectedAt: hoursAgo(10),
    numApplicants: 51,
  },
];

export function emptyDb() {
  const createdAt = now();
  return {
    meta: { version: 9, createdAt, updatedAt: createdAt },
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
    jobs: seedJobs.slice(0, 2).map((job) => ({
      id: nanoid(),
      status: "interested",
      statusHistory: [{ status: "interested", at: createdAt }],
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
    coachConversations: [],
    coachingSessions: [],
    outreachDrafts: [],
    huntPresets: [],
    careerStories: [],
    profileAudits: [],
    gigs: [],
    agentRuns: [],
    infiniteHunt: {
      enabled: false,
      generation: null,
      intervalMinutes: 60,
      options: null,
      startedAt: null,
      nextRunAt: null,
      lastRunAt: null,
      lastError: "",
    },
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

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const records = (value) => (Array.isArray(value) ? value.filter(isRecord) : []);
const strings = (value) =>
  Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
const boundedText = (value, max) =>
  String(value ?? "")
    .trim()
    .slice(0, max);
const SUBMISSION_CHECKLIST = [
  "Review resume alignment",
  "Review cover letter",
  "Confirm application details",
];
const APPLICATION_QUESTION_TYPES = new Set([
  "text_input",
  "dropdown",
  "multiple_choice",
]);
const normalizeApplicationQuestions = (value) => {
  const seenIds = new Set();
  return records(value)
    .slice(0, 100)
    .map((question, index) => {
      let id = boundedText(question.id, 80) || nanoid();
      if (seenIds.has(id)) id = nanoid();
      seenIds.add(id);
      const questionType = APPLICATION_QUESTION_TYPES.has(question.questionType)
        ? question.questionType
        : "text_input";
      const options = [
        ...new Set(
          strings(question.options)
            .map((option) => boundedText(option, 500))
            .filter(Boolean),
        ),
      ].slice(0, 100);
      const answer = boundedText(question.answer, 10000);
      const required = question.required !== false;
      const validAnswer =
        (!answer && !required) ||
        (Boolean(answer) &&
          (!["dropdown", "multiple_choice"].includes(questionType) ||
            options.includes(answer)));
      return {
        id,
        question:
          boundedText(question.question, 1000) ||
          `Application question ${index + 1}`,
        answer,
        questionType,
        options,
        required,
        confident: validAnswer,
        verified: Boolean(question.verified) && validAnswer,
      };
    });
};
const normalizeSubmissionChecklist = (value) => {
  const entries = records(value);
  const seenIds = new Set();
  return SUBMISSION_CHECKLIST.map((text) => {
    const existing = entries.find(
      (entry) => boundedText(entry.text, 200) === text,
    );
    let id = boundedText(existing?.id, 80) || nanoid();
    if (seenIds.has(id)) id = nanoid();
    seenIds.add(id);
    return { id, text, done: existing?.done === true };
  });
};
const isNormalizedApplicationQuestionReady = (question) =>
  (!question.answer && question.required === false) ||
  (Boolean(question.answer) &&
    (!["dropdown", "multiple_choice"].includes(question.questionType) ||
      question.options.includes(question.answer)) &&
    question.verified === true);
const HUNT_WORKFLOWS = new Set([
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
]);
const normalizeHuntOptions = (value, fallbackName = "Software Engineer") => {
  const source = isRecord(value) ? value : {};
  const q = String(source.q || fallbackName || "Software Engineer")
    .trim()
    .slice(0, 200);
  const workflows = [
    ...new Set(
      strings(source.workflows)
        .map((workflow) => workflow.toLowerCase())
        .filter((workflow) => HUNT_WORKFLOWS.has(workflow)),
    ),
  ].slice(0, 10);
  return {
    runName: String(source.runName || q || "Software Engineer")
      .trim()
      .slice(0, 200),
    origin: source.origin === "manual" ? "manual" : "infinite",
    q: q || "Software Engineer",
    location: String(source.location || "").slice(0, 200),
    minFit: Math.min(100, Math.max(0, Number(source.minFit ?? 60) || 0)),
    maxResults: Math.min(100, Math.max(1, Number(source.maxResults) || 25)),
    requiredKeywords: strings(source.requiredKeywords)
      .map((keyword) => keyword.trim().slice(0, 100))
      .filter(Boolean)
      .slice(0, 20),
    excludeKeywords: strings(source.excludeKeywords)
      .map((keyword) => keyword.trim().slice(0, 100))
      .filter(Boolean)
      .slice(0, 20),
    workflows: workflows.length ? workflows : ["linkedin", "indeed"],
    optimizeResume: Boolean(source.optimizeResume),
  };
};
const JOB_STATUSES = new Set([
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
const normalizeJobStatus = (value, fallback = "interested") => {
  const status = String(value || "").toLowerCase();
  if (JOB_STATUSES.has(status)) return status;
  return (
    {
      saved: "interested",
      started: "interested",
      queued: "interested",
      submitted: "applied",
      interviewing: "interview",
      archived: "removed",
    }[status] || fallback
  );
};
const normalizeSubmissionStatus = (value) => {
  const status = String(value || "").toLowerCase();
  if (["draft", "ready", "submitted", "archived"].includes(status))
    return status;
  if (status === "applied") return "submitted";
  if (["removed", "failed", "skipped"].includes(status)) return "archived";
  return "draft";
};

function migrate(input) {
  const db = isRecord(input) ? input : {};
  db.meta = isRecord(db.meta) ? db.meta : {};
  db.profile = isRecord(db.profile) ? db.profile : emptyDb().profile;
  db.profile.preferences = isRecord(db.profile.preferences)
    ? db.profile.preferences
    : {};
  db.profile.targetRoles = strings(db.profile.targetRoles);
  db.profile.skills = strings(db.profile.skills);
  db.profile.preferences.locations = strings(db.profile.preferences.locations);
  db.profile.faqAnswers = records(db.profile.faqAnswers);
  db.jobs = records(db.jobs);
  db.resumes = records(db.resumes);
  db.coverLetters = records(db.coverLetters);
  db.templates = Array.isArray(db.templates)
    ? records(db.templates)
    : defaultTemplates();
  for (const template of db.templates)
    template.sections = strings(template.sections);
  db.submissions = records(db.submissions);
  for (const submission of db.submissions) {
    submission.status = normalizeSubmissionStatus(submission.status);
    submission.checklist = normalizeSubmissionChecklist(submission.checklist);
    if (!Array.isArray(submission.applicationQuestions)) {
      submission.applicationQuestions = [
        "Why are you interested in this role?",
        "What are your salary expectations?",
        "When are you available to start?",
        "Will you require work authorization sponsorship?",
      ].map((question) => ({
        id: nanoid(),
        question,
        answer:
          (db.profile.faqAnswers || []).find(
            (item) =>
              String(item.question).trim().toLowerCase() ===
              question.toLowerCase(),
          )?.answer || "",
        questionType: "text_input",
        confident: false,
      }));
    }
    submission.applicationQuestions = normalizeApplicationQuestions(
      submission.applicationQuestions,
    );
    if (["draft", "ready"].includes(submission.status))
      submission.status =
        submission.checklist.every((entry) => entry.done) &&
        submission.applicationQuestions.every(
          isNormalizedApplicationQuestionReady,
        )
          ? "ready"
          : "draft";
  }
  db.coachConversations = records(db.coachConversations);
  for (const conversation of db.coachConversations)
    conversation.messages = records(conversation.messages);
  db.coachingSessions = records(db.coachingSessions);
  db.outreachDrafts = records(db.outreachDrafts);
  db.huntPresets = records(db.huntPresets);
  for (const preset of db.huntPresets) {
    preset.options = normalizeHuntOptions(
      isRecord(preset.options) ? preset.options : preset,
      preset.name,
    );
    delete preset.requiredKeywords;
    delete preset.excludeKeywords;
    delete preset.workflows;
  }
  db.careerStories = records(db.careerStories);
  for (const story of db.careerStories) story.skills = strings(story.skills);
  db.profileAudits = records(db.profileAudits);
  db.gigs = records(db.gigs);
  for (const gig of db.gigs) {
    gig.status ||= "lead";
    gig.statusHistory = records(gig.statusHistory);
    if (!gig.statusHistory.length)
      gig.statusHistory = [{ status: gig.status, at: gig.createdAt || now() }];
  }
  for (const draft of db.outreachDrafts) draft.status ||= "draft";
  for (const session of db.coachingSessions) {
    session.status ||= "in-progress";
    session.questions = strings(session.questions);
    session.answers = isRecord(session.answers)
      ? session.answers
      : Object.fromEntries(session.questions.map((q) => [q, ""]));
    session.matchedStoryIds = strings(session.matchedStoryIds);
    session.researchDone = strings(session.researchDone);
  }
  db.agentRuns = records(db.agentRuns);
  for (const run of db.agentRuns) {
    run.id = String(run.id || nanoid()).slice(0, 200);
    run.runName = String(
      (typeof run.runName === "string" && run.runName) ||
        run.search?.q ||
        run.q ||
        "Local hunt",
    ).slice(0, 200);
    run.status = ["pending", "running", "completed", "failed"].includes(
      run.status,
    )
      ? run.status
      : "completed";
    run.matches = records(run.matches).map((match) => ({
      company: String(match.company || "Unknown company").slice(0, 300),
      title: String(match.title || "Untitled role").slice(0, 500),
      location: String(match.location || "").slice(0, 500),
      url: String(match.url || "").slice(0, 2000),
      fitScore: Math.min(100, Math.max(0, Number(match.fitScore) || 0)),
      reasons: strings(match.reasons).map((reason) => reason.slice(0, 500)),
    }));
    run.steps = records(
      Array.isArray(run.steps) ? run.steps : run.activities,
    ).map((step) => ({
      name: String(step.name || step.title || "Workflow step").slice(0, 200),
      status: ["pending", "running", "completed", "failed"].includes(
        step.status,
      )
        ? step.status
        : "completed",
      detail: String(step.detail || step.description || "").slice(0, 2000),
    }));
    run.actions = strings(run.actions)
      .map((action) => action.slice(0, 2000))
      .slice(0, 500);
    delete run.activities;
    run.options = normalizeHuntOptions(
      isRecord(run.options) ? run.options : { ...run, ...run.search },
      run.runName || run.search?.q,
    );
    run.workflows = run.options.workflows;
    run.minFit = run.options.minFit;
    run.optimizeResume = run.options.optimizeResume;
    run.search = {
      q: run.options.q,
      location: run.options.location,
    };
    for (const counter of [
      "inspected",
      "found",
      "added",
      "duplicates",
      "queued",
      "optimizedResumes",
      "originalResumes",
    ])
      run[counter] = Math.max(0, Number(run[counter]) || 0);
  }
  db.infiniteHunt = isRecord(db.infiniteHunt)
    ? db.infiniteHunt
    : emptyDb().infiniteHunt;
  db.infiniteHunt.enabled = Boolean(db.infiniteHunt.enabled);
  db.infiniteHunt.generation = String(
    db.infiniteHunt.generation || db.infiniteHunt.startedAt || "",
  ).slice(0, 200);
  db.infiniteHunt.intervalMinutes = Math.min(
    1440,
    Math.max(1, Number(db.infiniteHunt.intervalMinutes) || 60),
  );
  db.infiniteHunt.options = isRecord(db.infiniteHunt.options)
    ? normalizeHuntOptions(db.infiniteHunt.options)
    : null;
  db.infiniteHunt.lastError = String(db.infiniteHunt.lastError || "").slice(
    0,
    500,
  );
  db.activities = records(db.activities);
  for (const job of db.jobs) {
    job.status = normalizeJobStatus(job.status);
    job.notes = records(job.notes);
    job.tasks = records(job.tasks);
    job.contacts = records(job.contacts);
    job.tags = strings(job.tags);
    job.matchReasons = strings(job.matchReasons);
    job.interviewRounds = records(job.interviewRounds);
    job.statusHistory = records(job.statusHistory);
    for (const event of job.statusHistory)
      event.status = normalizeJobStatus(event.status, job.status);
    if (!job.statusHistory.length)
      job.statusHistory = [
        { status: job.status || "interested", at: job.createdAt || now() },
      ];
  }
  db.meta.version = 11;
  return db;
}

async function ensure() {
  await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  await secureMode(DATA_DIR, 0o700);
  try {
    await fs.access(DB_PATH);
    await secureMode(DB_PATH, 0o600);
    await secureMode(BACKUP_PATH, 0o600);
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
      await secureMode(DB_PATH, 0o600);
      return backup;
    } catch {
      throw new Error(`Local JobHuntr data is unreadable: ${error.message}`);
    }
  }
}

export async function writeDb(db) {
  await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  await secureMode(DATA_DIR, 0o700);
  db.meta = db.meta || {};
  db.meta.updatedAt = now();
  const tmp = `${DB_PATH}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
  try {
    await fs.copyFile(DB_PATH, BACKUP_PATH);
    await secureMode(BACKUP_PATH, 0o600);
  } catch {}
  await fs.rename(tmp, DB_PATH);
  await secureMode(DB_PATH, 0o600);
  return db;
}

let mutationQueue = Promise.resolve();
export function mutate(fn) {
  const operation = mutationQueue.then(async () => {
    const db = await readDb();
    const result = await fn(db);
    await writeDb(db);
    return result === undefined ? db : result;
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
    [
      "proposal",
      "negotiation",
      "won",
      "in-progress",
      "waiting-approval",
    ].includes(gig.status),
  );
  const gigPipelineValue = db.gigs
    .filter((gig) => ["lead", "proposal", "negotiation"].includes(gig.status))
    .reduce((sum, gig) => sum + Number(gig.budget || 0), 0);
  const gigEarnings = db.gigs
    .filter((gig) =>
      ["won", "in-progress", "waiting-approval", "completed"].includes(
        gig.status,
      ),
    )
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
