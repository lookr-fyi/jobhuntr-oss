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
const latestRecord = (records) =>
  [...(records || [])].sort((left, right) => {
    const date = (record) => {
      const value = new Date(
        record?.updatedAt || record?.createdAt || 0,
      ).getTime();
      return Number.isFinite(value) ? value : 0;
    };
    return date(right) - date(left);
  })[0] || null;
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
    salaryRange: [150000, 210000],
    tags: ["ai", "startup", "remote"],
    description: "Build AI workflows and customer-facing product surfaces.",
    postedAt: hoursAgo(2),
    collectedAt: hoursAgo(1),
    numApplicants: 38,
    eoy: 5,
    provideVisaSponsorship: "Likely",
    jobType: "Full-time",
    remoteType: "Remote",
    seniorLevel: "Lead",
  },
  {
    company: "Northstar Robotics",
    title: "Frontend Platform Engineer",
    location: "San Francisco, CA",
    url: "https://example.com/northstar-frontend",
    source: "Seed Board",
    salary: "$145k-$190k",
    salaryRange: [145000, 190000],
    tags: ["react", "platform"],
    description: "Own design systems, app shell, and frontend reliability.",
    postedAt: hoursAgo(5),
    collectedAt: hoursAgo(3),
    numApplicants: 74,
    eoy: 4,
    jobType: "Full-time",
    remoteType: "On-site",
    seniorLevel: "Mid",
  },
  {
    company: "Civic Health Labs",
    title: "Full Stack Engineer",
    location: "New York, NY",
    url: "https://example.com/civic-fullstack",
    source: "Seed Board",
    salary: "$130k-$175k",
    salaryRange: [130000, 175000],
    tags: ["fullstack", "impact"],
    description: "Ship local-first health workflow software.",
    postedAt: hoursAgo(8),
    collectedAt: hoursAgo(6),
    numApplicants: 29,
    eoy: 3,
    jobType: "Full-time",
    remoteType: "Hybrid",
    seniorLevel: "Mid",
  },
  {
    company: "Orbit Data",
    title: "Developer Tools Engineer",
    location: "Remote US",
    url: "https://example.com/orbit-devtools",
    source: "Seed Board",
    salary: "$160k-$220k",
    salaryRange: [160000, 220000],
    tags: ["devtools", "typescript"],
    description: "Design SDKs, CLI tools, and diagnostics for data teams.",
    postedAt: hoursAgo(12),
    collectedAt: hoursAgo(10),
    numApplicants: 51,
    eoy: 5,
    jobType: "Full-time",
    remoteType: "Remote",
    seniorLevel: "Mid",
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
  String(typeof value === "string" || typeof value === "number" ? value : "")
    .trim()
    .slice(0, max);
const uniqueLegacyId = (value, prefix, index, seenIds) => {
  const requested = boundedText(value, 200);
  let id = requested || `${prefix}-${index + 1}`;
  let suffix = 2;
  while (seenIds.has(id))
    id = `${requested || `${prefix}-${index + 1}`}-${suffix++}`;
  seenIds.add(id);
  return id;
};
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
  const q =
    boundedText(source.q, 200) ||
    boundedText(fallbackName, 200) ||
    "Software Engineer";
  const workflows = [
    ...new Set(
      strings(source.workflows)
        .map((workflow) => workflow.toLowerCase())
        .filter((workflow) => HUNT_WORKFLOWS.has(workflow)),
    ),
  ].slice(0, 10);
  return {
    runName: boundedText(source.runName, 200) || q || "Software Engineer",
    origin: source.origin === "manual" ? "manual" : "infinite",
    q: q || "Software Engineer",
    location: boundedText(source.location, 200),
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
const SUBMISSION_ELIGIBLE_JOB_STATUSES = new Set([
  "interested",
  "submitting",
  "failed",
  "skipped",
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
const GIG_STATUSES = new Set([
  "lead",
  "proposal",
  "negotiation",
  "won",
  "in-progress",
  "waiting-approval",
  "completed",
  "lost",
]);
const boundedMoney = (value) =>
  Math.min(100000000, Math.max(0, Number(value) || 0));
const safeStoredHttpUrl = (value, max = 2000) => {
  const text = boundedText(value, max);
  if (!text) return "";
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? text
      : "";
  } catch {
    return "";
  }
};
const safeStoredTimestamp = (value) => {
  const text = boundedText(value, 100);
  return text && Number.isFinite(Date.parse(text)) ? text : "";
};

function migrate(input) {
  const db = isRecord(input) ? input : {};
  const defaultProfile = emptyDb().profile;
  db.meta = isRecord(db.meta) ? db.meta : {};
  const restoredProfile = isRecord(db.profile) ? db.profile : {};
  const restoredPreferences = isRecord(restoredProfile.preferences)
    ? restoredProfile.preferences
    : {};
  const normalizeProfileList = (value, maxItems, maxLength) =>
    [
      ...new Set(
        strings(value)
          .map((item) => boundedText(item, maxLength))
          .filter(Boolean),
      ),
    ].slice(0, maxItems);
  const faqIds = new Set();
  const faqQuestionTypes = new Set([
    "text_input",
    "dropdown",
    "multiple_choice",
  ]);
  const faqAnswers = records(
    restoredProfile.faqAnswers ?? restoredProfile.faq_answers,
  )
    .map((faq) => {
      const questionType = faq.questionType ?? faq.question_type;
      const rawOptions = Array.isArray(faq.options)
        ? faq.options
        : isRecord(faq.options)
          ? Object.values(faq.options)
          : [];
      return {
        ...faq,
        question: boundedText(faq.question ?? faq.question_text, 1000),
        answer: boundedText(faq.answer, 30000),
        questionType: faqQuestionTypes.has(questionType)
          ? questionType
          : "text_input",
        options: normalizeProfileList(rawOptions, 50, 1000),
        confident: faq.confident === true,
      };
    })
    .filter((faq) => faq.question)
    .map((faq, index) => ({
      id: uniqueLegacyId(faq.id, "faq", index, faqIds),
      question: faq.question,
      answer: faq.answer,
      questionType: faq.questionType,
      options: faq.options,
      confident: faq.confident,
    }))
    .slice(0, 100);
  const numericPreference = (value, fallback, min, max, integer = false) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    const bounded = Math.min(max, Math.max(min, parsed));
    return integer ? Math.round(bounded) : bounded;
  };
  db.profile = {
    ...restoredProfile,
    onboarded: restoredProfile.onboarded === true,
    name: boundedText(restoredProfile.name, 200) || defaultProfile.name,
    firstName: boundedText(
      restoredProfile.firstName ?? restoredProfile.first_name,
      100,
    ),
    lastName: boundedText(
      restoredProfile.lastName ?? restoredProfile.last_name,
      100,
    ),
    nickname: boundedText(restoredProfile.nickname, 100),
    headline:
      boundedText(restoredProfile.headline, 1000) || defaultProfile.headline,
    location:
      boundedText(restoredProfile.location, 300) || defaultProfile.location,
    targetRoles: normalizeProfileList(restoredProfile.targetRoles, 100, 200),
    skills: normalizeProfileList(restoredProfile.skills, 200, 200),
    resumeText: boundedText(
      restoredProfile.resumeText ?? restoredProfile.resume_text,
      200000,
    ),
    additionalInfo: boundedText(
      isRecord(restoredProfile.additionalInfo)
        ? restoredProfile.additionalInfo.body
        : isRecord(restoredProfile.additional_info)
          ? restoredProfile.additional_info.body
          : (restoredProfile.additionalInfo ?? restoredProfile.additional_info),
      100000,
    ),
    faqAnswers,
    preferences: {
      ...restoredPreferences,
      remote:
        typeof restoredPreferences.remote === "boolean"
          ? restoredPreferences.remote
          : defaultProfile.preferences.remote,
      locations: normalizeProfileList(restoredPreferences.locations, 100, 300),
      minSalary: numericPreference(
        restoredPreferences.minSalary,
        defaultProfile.preferences.minSalary,
        0,
        100000000,
      ),
      weeklyApplicationGoal: numericPreference(
        restoredPreferences.weeklyApplicationGoal,
        defaultProfile.preferences.weeklyApplicationGoal,
        1,
        100,
        true,
      ),
      atsThreshold: numericPreference(
        restoredPreferences.atsThreshold ??
          restoredPreferences.ats_threshold ??
          restoredPreferences.ats_threshold_to_apply_template,
        80,
        0,
        100,
      ),
    },
  };
  db.jobs = records(db.jobs);
  const templateIds = new Set();
  const restoredTemplates = records(db.templates);
  db.templates = (
    restoredTemplates.length ? restoredTemplates : defaultTemplates()
  ).map((template, index) => ({
    id: uniqueLegacyId(template.id, "legacy-template", index, templateIds),
    name: boundedText(template.name, 120) || `Resume Template ${index + 1}`,
    description: boundedText(template.description, 500),
    originalResume: boundedText(template.originalResume, 200000),
    editedResume: boundedText(template.editedResume, 200000),
    additionalExperience: boundedText(template.additionalExperience, 2000),
    testJobId: boundedText(template.testJobId, 200),
    jobDescription: boundedText(template.jobDescription, 5000),
    sections:
      strings(template.sections)
        .map((section) => boundedText(section, 100))
        .filter(Boolean)
        .slice(0, 20) || [],
    createdAt: boundedText(template.createdAt, 100),
    updatedAt: boundedText(template.updatedAt, 100),
  }));
  for (const template of db.templates)
    if (!template.sections.length)
      template.sections = ["Summary", "Skills", "Experience", "Education"];
  const fallbackTemplateId = latestRecord(db.templates).id;
  const resumeIds = new Set();
  db.resumes = records(db.resumes).map((resume, index) => ({
    id: uniqueLegacyId(resume.id, "legacy-resume", index, resumeIds),
    name: boundedText(resume.name, 120) || `Resume ${index + 1}`,
    templateId: templateIds.has(boundedText(resume.templateId, 200))
      ? boundedText(resume.templateId, 200)
      : fallbackTemplateId,
    jobId: boundedText(resume.jobId, 200),
    content: boundedText(resume.content, 100000),
    sourceAtsScore: Math.min(
      100,
      Math.max(0, Number(resume.sourceAtsScore) || 0),
    ),
    generatedBy: boundedText(resume.generatedBy, 100),
    createdAt: boundedText(resume.createdAt, 100),
    updatedAt: boundedText(resume.updatedAt, 100),
  }));
  const coverLetterIds = new Set();
  db.coverLetters = records(db.coverLetters).map((letter, index) => ({
    id: uniqueLegacyId(letter.id, "legacy-cover-letter", index, coverLetterIds),
    jobId: boundedText(letter.jobId, 200),
    resumeId: boundedText(letter.resumeId, 200),
    atsTemplateId: boundedText(letter.atsTemplateId, 100),
    style: ["professional", "concise", "story-driven"].includes(letter.style)
      ? letter.style
      : "professional",
    templateId: boundedText(letter.templateId, 100) || "classic",
    templateName:
      boundedText(letter.templateName, 100) || "Classic Professional",
    documentName: boundedText(letter.documentName, 300),
    templateContent: boundedText(letter.templateContent, 20000),
    jobDescription: boundedText(letter.jobDescription, 5000),
    opening: boundedText(letter.opening, 1000),
    emphasis: boundedText(letter.emphasis, 2000),
    title: boundedText(letter.title, 200) || `Cover Letter ${index + 1}`,
    body: boundedText(letter.body, 100000),
    createdAt: boundedText(letter.createdAt, 100),
    updatedAt: boundedText(letter.updatedAt, 100),
  }));
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
                question.toLowerCase() &&
              (item.questionType || "text_input") === "text_input",
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
  const conversationIds = new Set();
  db.coachConversations = records(db.coachConversations)
    .map((conversation, index) => ({
      id: uniqueLegacyId(
        conversation.id,
        "legacy-coach-conversation",
        index,
        conversationIds,
      ),
      jobId: boundedText(conversation.jobId, 200),
      title: boundedText(conversation.title, 300) || "Career coaching session",
      messages: records(conversation.messages)
        .filter(
          (message) =>
            ["user", "assistant"].includes(message.role) &&
            boundedText(message.content, 30000),
        )
        .map((message) => ({
          role: message.role,
          content: boundedText(message.content, 30000),
        }))
        .slice(0, 200),
      createdAt: boundedText(conversation.createdAt, 100),
      updatedAt: boundedText(conversation.updatedAt, 100),
    }))
    .filter((conversation) => conversation.messages.length)
    .slice(0, 500);
  const sessionIds = new Set();
  db.coachingSessions = records(db.coachingSessions)
    .slice(0, 1000)
    .map((session, index) => {
      const questions = [
        ...new Set(
          strings(session.questions)
            .map((question) => boundedText(question, 1000))
            .filter(Boolean),
        ),
      ].slice(0, 100);
      const answers = isRecord(session.answers) ? session.answers : {};
      const companyResearch = strings(session.companyResearch)
        .map((item) => boundedText(item, 2000))
        .filter(Boolean)
        .slice(0, 100);
      return {
        id: uniqueLegacyId(
          session.id,
          "legacy-coaching-session",
          index,
          sessionIds,
        ),
        jobId: boundedText(session.jobId, 200),
        status: session.status === "completed" ? "completed" : "in-progress",
        questions,
        answers: Object.fromEntries(
          questions.map((question) => [
            question,
            boundedText(answers[question], 10000),
          ]),
        ),
        matchedStoryIds: strings(session.matchedStoryIds)
          .map((id) => boundedText(id, 200))
          .filter(Boolean)
          .slice(0, 100),
        talkingPoints: strings(session.talkingPoints)
          .map((item) => boundedText(item, 2000))
          .filter(Boolean)
          .slice(0, 100),
        companyResearch,
        researchDone: strings(session.researchDone)
          .map((item) => boundedText(item, 2000))
          .filter((item) => companyResearch.includes(item))
          .slice(0, 100),
        notes: boundedText(session.notes, 20000),
        createdAt: boundedText(session.createdAt, 100),
        updatedAt: boundedText(session.updatedAt, 100),
      };
    });
  const outreachIds = new Set();
  db.outreachDrafts = records(db.outreachDrafts)
    .slice(0, 5000)
    .map((draft, index) => ({
      id: uniqueLegacyId(draft.id, "legacy-outreach-draft", index, outreachIds),
      jobId: boundedText(draft.jobId, 200),
      contactId: boundedText(draft.contactId, 200),
      recipient: boundedText(draft.recipient, 200) || "Hiring team",
      contactRole: boundedText(draft.contactRole, 200),
      contactEmail: boundedText(draft.contactEmail, 300),
      category: ["recruiter", "peer", "hiring_manager"].includes(draft.category)
        ? draft.category
        : "peer",
      connectionDegree:
        boundedText(draft.connectionDegree, 100) || "Company contact",
      channel: draft.channel === "email" ? "email" : "linkedin",
      subject: boundedText(draft.subject, 300) || `Outreach draft ${index + 1}`,
      body: boundedText(draft.body, 20000),
      status: ["draft", "sent", "replied", "archived"].includes(draft.status)
        ? draft.status
        : "draft",
      createdAt: boundedText(draft.createdAt, 100),
      updatedAt: boundedText(draft.updatedAt, 100),
    }));
  const presetIds = new Set();
  db.huntPresets = records(db.huntPresets)
    .slice(0, 1000)
    .map((preset, index) => {
      const name = boundedText(preset.name, 100) || `Hunt preset ${index + 1}`;
      return {
        id: uniqueLegacyId(preset.id, "legacy-hunt-preset", index, presetIds),
        name,
        options: normalizeHuntOptions(
          isRecord(preset.options) ? preset.options : preset,
          name,
        ),
        createdAt: boundedText(preset.createdAt, 100),
        updatedAt: boundedText(preset.updatedAt, 100),
      };
    });
  const storyIds = new Set();
  db.careerStories = records(db.careerStories)
    .slice(0, 1000)
    .map((story, index) => ({
      id: uniqueLegacyId(story.id, "legacy-career-story", index, storyIds),
      title: boundedText(story.title, 160) || `STAR Story ${index + 1}`,
      situation: boundedText(story.situation, 10000),
      task: boundedText(story.task, 10000),
      action: boundedText(story.action, 20000),
      result: boundedText(story.result, 10000),
      skills: [
        ...new Set(
          strings(story.skills)
            .map((skill) => boundedText(skill, 100))
            .filter(Boolean),
        ),
      ].slice(0, 30),
      createdAt: boundedText(story.createdAt, 100),
      updatedAt: boundedText(story.updatedAt, 100),
    }));
  const validStoryIds = new Set(db.careerStories.map((story) => story.id));
  for (const session of db.coachingSessions)
    session.matchedStoryIds = session.matchedStoryIds.filter((id) =>
      validStoryIds.has(id),
    );
  const auditIds = new Set();
  db.profileAudits = records(db.profileAudits)
    .slice(0, 50)
    .map((audit, index) => {
      const input = isRecord(audit.input) ? audit.input : {};
      return {
        id: uniqueLegacyId(audit.id, "legacy-profile-audit", index, auditIds),
        createdAt: boundedText(audit.createdAt, 100),
        input: {
          profileUrl: safeStoredHttpUrl(input.profileUrl, 1000),
          targetContext: boundedText(input.targetContext, 50000),
          headline: boundedText(input.headline, 1000),
          about: boundedText(input.about, 30000),
          experience: boundedText(input.experience, 100000),
          skills: Array.isArray(input.skills)
            ? normalizeProfileList(input.skills, 100, 200)
            : boundedText(input.skills, 10000),
        },
        total: numericPreference(audit.total, 0, 0, 100, true),
        checks: records(audit.checks)
          .map((check, checkIndex) => ({
            section:
              boundedText(check.section, 100) || `Section ${checkIndex + 1}`,
            score: numericPreference(check.score, 0, 0, 100, true),
            status: check.status === "strong" ? "strong" : "improve",
            detail: boundedText(check.detail, 2000),
          }))
          .slice(0, 50),
        matchedTerms: normalizeProfileList(audit.matchedTerms, 100, 100),
        metrics: numericPreference(audit.metrics, 0, 0, 100000, true),
        suggestions: normalizeProfileList(audit.suggestions, 100, 2000),
        stats: isRecord(audit.stats)
          ? Object.fromEntries(
              Object.entries(audit.stats)
                .filter(([key]) => /^[A-Za-z][A-Za-z0-9]{0,49}$/.test(key))
                .slice(0, 50)
                .map(([key, value]) => [
                  key,
                  numericPreference(value, 0, 0, 1000000, true),
                ]),
            )
          : {},
      };
    });
  const gigIds = new Set();
  db.gigs = records(db.gigs)
    .slice(0, 5000)
    .map((gig, index) => {
      const status = GIG_STATUSES.has(gig.status) ? gig.status : "lead";
      const createdAt = boundedText(gig.createdAt, 100);
      const statusHistory = records(gig.statusHistory)
        .filter((event) => GIG_STATUSES.has(event.status))
        .map((event) => ({
          status: event.status,
          at: boundedText(event.at, 100) || createdAt || now(),
        }))
        .slice(0, 500);
      if (!statusHistory.some((event) => event.status === status))
        statusHistory.unshift({ status, at: createdAt || now() });
      return {
        id: uniqueLegacyId(gig.id, "legacy-gig", index, gigIds),
        client: boundedText(gig.client, 200) || `Gig client ${index + 1}`,
        title: boundedText(gig.title, 300) || `Gig opportunity ${index + 1}`,
        source: boundedText(gig.source, 200) || "Manual",
        url: boundedText(gig.url, 2000),
        budget: boundedMoney(gig.budget),
        earned: boundedMoney(gig.earned),
        dueDate: /^\d{4}-\d{2}-\d{2}$/.test(boundedText(gig.dueDate, 10))
          ? boundedText(gig.dueDate, 10)
          : "",
        description: boundedText(gig.description, 50000),
        proposal: boundedText(gig.proposal, 100000),
        status,
        statusHistory,
        createdAt,
        updatedAt: boundedText(gig.updatedAt, 100),
      };
    });
  const runIds = new Set();
  db.agentRuns = records(db.agentRuns).slice(0, 100);
  for (const [runIndex, run] of db.agentRuns.entries()) {
    run.id = uniqueLegacyId(run.id, "legacy-agent-run", runIndex, runIds);
    run.runName =
      boundedText(run.runName, 200) ||
      boundedText(run.search?.q, 200) ||
      boundedText(run.q, 200) ||
      "Local hunt";
    run.status = ["pending", "running", "completed", "failed"].includes(
      run.status,
    )
      ? run.status
      : "completed";
    run.matches = records(run.matches)
      .slice(0, 10000)
      .map((match) => ({
        company: boundedText(match.company, 300) || "Unknown company",
        title: boundedText(match.title, 500) || "Untitled role",
        location: boundedText(match.location, 500),
        url: safeStoredHttpUrl(match.url),
        fitScore: Math.min(100, Math.max(0, Number(match.fitScore) || 0)),
        reasons: strings(match.reasons)
          .map((reason) => boundedText(reason, 500))
          .filter(Boolean)
          .slice(0, 100),
      }));
    run.steps = records(
      Array.isArray(run.steps) ? run.steps : run.activities,
    ).map((step) => ({
      name:
        boundedText(step.name, 200) ||
        boundedText(step.title, 200) ||
        "Workflow step",
      status: ["pending", "running", "completed", "failed"].includes(
        step.status,
      )
        ? step.status
        : "completed",
      detail:
        boundedText(step.detail, 2000) || boundedText(step.description, 2000),
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
    run.createdAt = boundedText(run.createdAt, 100);
    run.completedAt = boundedText(run.completedAt, 100);
  }
  const restoredInfiniteHunt = isRecord(db.infiniteHunt) ? db.infiniteHunt : {};
  const infiniteOptions = isRecord(restoredInfiniteHunt.options)
    ? normalizeHuntOptions(restoredInfiniteHunt.options)
    : null;
  const startedAt = safeStoredTimestamp(restoredInfiniteHunt.startedAt);
  const nextRunAt = safeStoredTimestamp(restoredInfiniteHunt.nextRunAt);
  const generation =
    boundedText(restoredInfiniteHunt.generation, 200) || startedAt;
  const enabled =
    restoredInfiniteHunt.enabled === true &&
    Boolean(infiniteOptions && generation && startedAt && nextRunAt);
  db.infiniteHunt = {
    enabled,
    generation: generation || null,
    intervalMinutes: numericPreference(
      restoredInfiniteHunt.intervalMinutes,
      60,
      1,
      1440,
      true,
    ),
    options: infiniteOptions,
    startedAt: startedAt || null,
    nextRunAt: enabled ? nextRunAt : null,
    lastRunAt: safeStoredTimestamp(restoredInfiniteHunt.lastRunAt) || null,
    lastError: boundedText(restoredInfiniteHunt.lastError, 500),
  };
  const activityIds = new Set();
  db.activities = records(db.activities)
    .slice(0, 500)
    .map((activity, index) => ({
      id: uniqueLegacyId(activity.id, "legacy-activity", index, activityIds),
      at: boundedText(activity.at, 100),
      type: boundedText(activity.type, 100) || "system",
      message: boundedText(activity.message, 2000),
      data: isRecord(activity.data)
        ? Object.fromEntries(
            Object.entries(activity.data)
              .filter(([key]) => /^[A-Za-z][A-Za-z0-9]{0,49}$/.test(key))
              .slice(0, 50)
              .map(([key, value]) => [key, boundedText(value, 500)])
              .filter(([, value]) => value),
          )
        : {},
    }))
    .filter((activity) => activity.message);
  const jobIds = new Set();
  db.jobs = db.jobs.slice(0, 10000).map((job, jobIndex) => {
    const id = uniqueLegacyId(job.id, "legacy-job", jobIndex, jobIds);
    const status = normalizeJobStatus(job.status);
    const createdAt = boundedText(job.createdAt, 100);
    const noteIds = new Set();
    const notes = records(job.notes)
      .map((note, index) => ({
        id: uniqueLegacyId(note.id, `legacy-note-${id}`, index, noteIds),
        at: boundedText(note.at, 100) || createdAt || now(),
        text: boundedText(note.text, 4000),
      }))
      .filter((note) => note.text)
      .slice(0, 1000);
    const taskIds = new Set();
    const tasks = records(job.tasks)
      .map((task, index) => ({
        id: uniqueLegacyId(task.id, `legacy-task-${id}`, index, taskIds),
        text: boundedText(task.text, 500),
        due: /^\d{4}-\d{2}-\d{2}$/.test(boundedText(task.due, 10))
          ? boundedText(task.due, 10)
          : "",
        done: task.done === true,
        createdAt: boundedText(task.createdAt, 100),
        updatedAt: boundedText(task.updatedAt, 100),
      }))
      .filter((task) => task.text)
      .slice(0, 1000);
    const contactIds = new Set();
    const contacts = records(job.contacts)
      .slice(0, 1000)
      .map((contact, index) => ({
        id: uniqueLegacyId(
          contact.id,
          `legacy-contact-${boundedText(job.id, 80) || "job"}`,
          index,
          contactIds,
        ),
        name: boundedText(contact.name, 100) || `Contact ${index + 1}`,
        role: boundedText(contact.role, 100),
        email: boundedText(contact.email, 200),
        linkedIn: boundedText(contact.linkedIn, 500),
        createdAt: boundedText(contact.createdAt, 100),
        updatedAt: boundedText(contact.updatedAt, 100),
      }));
    const roundIds = new Set();
    const interviewRounds = records(job.interviewRounds)
      .slice(0, 50)
      .map((round, index) => ({
        id: uniqueLegacyId(round.id, `legacy-round-${id}`, index, roundIds),
        roundType:
          boundedText(round.roundType, 200) || `Interview Round ${index + 1}`,
        number: boundedText(round.number, 50),
        date: boundedText(round.date, 50),
        notes: boundedText(round.notes, 10000),
        status: boundedText(round.status, 50) || "scheduled",
        outcome: boundedText(round.outcome, 50) || "pending",
        createdAt: boundedText(round.createdAt, 100),
        updatedAt: boundedText(round.updatedAt, 100),
      }));
    const statusHistory = records(job.statusHistory)
      .map((event) => ({
        status: normalizeJobStatus(event.status, status),
        at: boundedText(event.at, 100) || createdAt || now(),
        source: boundedText(event.source, 100),
      }))
      .slice(0, 500);
    if (statusHistory[0]?.status !== status)
      statusHistory.unshift({ status, at: createdAt || now(), source: "" });
    return {
      id,
      company: boundedText(job.company, 300) || `Company ${jobIndex + 1}`,
      title: boundedText(job.title, 500) || `Job opportunity ${jobIndex + 1}`,
      location: boundedText(job.location, 500),
      url: safeStoredHttpUrl(job.url),
      source: boundedText(job.source, 200) || "Manual",
      salary: boundedText(job.salary, 300),
      description: boundedText(job.description, 100000),
      tags: [
        ...new Set(
          strings(job.tags)
            .map((tag) => boundedText(tag, 200))
            .filter(Boolean),
        ),
      ].slice(0, 100),
      status,
      statusHistory,
      fitScore: Math.min(100, Math.max(0, Number(job.fitScore) || 0)),
      optimizedAtsScore: Math.min(
        100,
        Math.max(0, Number(job.optimizedAtsScore) || 0),
      ),
      numApplicants: Math.max(0, Number(job.numApplicants) || 0),
      postedAt: boundedText(job.postedAt, 100),
      collectedAt: boundedText(job.collectedAt, 100),
      applicationDatetime: boundedText(job.applicationDatetime, 100),
      workflowRunId: boundedText(job.workflowRunId, 200),
      hiringContactName: boundedText(job.hiringContactName, 200),
      statusInsight: boundedText(job.statusInsight, 1000),
      rejectedBecause: boundedText(job.rejectedBecause, 2000),
      matchReasons: strings(job.matchReasons)
        .map((reason) => boundedText(reason, 500))
        .filter(Boolean)
        .slice(0, 100),
      notes,
      tasks,
      contacts,
      interviewRounds,
      createdAt,
      updatedAt: boundedText(job.updatedAt, 100),
    };
  });
  const jobsById = new Map(db.jobs.map((job) => [job.id, job]));
  for (const submission of db.submissions) {
    if (!["draft", "ready"].includes(submission.status)) continue;
    const job = jobsById.get(submission.jobId);
    if (job && SUBMISSION_ELIGIBLE_JOB_STATUSES.has(job.status)) continue;
    submission.status = "archived";
    submission.updatedAt = submission.updatedAt || now();
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
