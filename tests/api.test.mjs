import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const dir = await fs.mkdtemp(path.join(os.tmpdir(), "jobhuntr-test-"));
process.env.NODE_ENV = "test";
process.env.JOBHUNTR_DATA_DIR = dir;
const app = (await import("../server/index.mjs")).default;
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const req = async (url, options = {}) => {
  const res = await fetch(base + url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  return { res, body: res.status === 204 ? null : await res.json() };
};

test("health and initial state are local-only", async () => {
  const { res, body } = await req("/api/health");
  assert.equal(body.ok, true);
  assert.equal(body.mode, "local-only");
  assert.equal(body.host, "127.0.0.1");
  assert.equal(res.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.equal(res.headers.get("x-powered-by"), null);
  const state = (await req("/api/state")).body;
  assert.ok(state.jobs.length >= 2);
  assert.ok(state.summary.totalJobs >= 2);
});

test("serialized local writes do not lose concurrent jobs", async () => {
  const jobs = Array.from({ length: 12 }, (_, i) => ({
    company: `Concurrent ${i}`,
    title: "Engineer",
    url: `https://concurrent.example/${i}`,
  }));
  const results = await Promise.all(
    jobs.map((job) =>
      req("/api/jobs", { method: "POST", body: JSON.stringify(job) }),
    ),
  );
  assert.ok(results.every(({ res }) => res.status === 201));
  const state = (await req("/api/state")).body;
  assert.equal(
    state.jobs.filter((job) => job.company.startsWith("Concurrent ")).length,
    jobs.length,
  );
});

test("can add and update a tracked job", async () => {
  const create = await req("/api/jobs", {
    method: "POST",
    body: JSON.stringify({
      company: "TestCo",
      title: "React Engineer",
      location: "Remote",
      description: "React TypeScript role",
      tags: ["React"],
    }),
  });
  assert.equal(create.res.status, 201);
  assert.equal(create.body.company, "TestCo");
  const patch = await req(`/api/jobs/${create.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "applied" }),
  });
  assert.equal(patch.body.status, "applied");
  assert.equal(patch.body.statusHistory[0].status, "applied");
  const interview = await req(`/api/jobs/${create.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "interview",
      interviewRounds: [
        {
          id: "round-api-1",
          roundType: "Interview Round 1",
          notes: "Technical screen",
          status: "scheduled",
          outcome: "pending",
        },
      ],
    }),
  });
  assert.equal(interview.body.interviewRounds[0].notes, "Technical screen");
  const contact = await req(`/api/jobs/${create.body.id}/contacts`, {
    method: "POST",
    body: JSON.stringify({
      name: "Alex Recruiter",
      role: "Recruiter",
      email: "alex@example.test",
    }),
  });
  assert.equal(contact.res.status, 201);
  assert.equal(contact.body.name, "Alex Recruiter");
});

test("v2 personal profile details persist with bounded local input", async () => {
  const updated = await req("/api/profile", {
    method: "PUT",
    body: JSON.stringify({
      firstName: "Ada",
      lastName: "Lovelace",
      nickname: "Analytical Builder",
    }),
  });
  assert.equal(updated.res.status, 200);
  assert.equal(updated.body.firstName, "Ada");
  assert.equal(updated.body.lastName, "Lovelace");
  assert.equal(updated.body.nickname, "Analytical Builder");
  const invalid = await req("/api/profile", {
    method: "PUT",
    body: JSON.stringify({ nickname: "x".repeat(101) }),
  });
  assert.equal(invalid.res.status, 400);
});

test("agent run saves matches and logs actions", async () => {
  const run = await req("/api/agent-runs/start", {
    method: "POST",
    body: JSON.stringify({
      q: "engineer",
      minFit: 50,
      optimizeResume: true,
      workflows: ["dice", "hiringcafe", "linkedin"],
    }),
  });
  assert.equal(run.res.status, 201);
  assert.equal(run.body.status, "completed");
  assert.equal(run.body.origin, "infinite");
  assert.equal(run.body.runName, "engineer");
  assert.ok(run.body.actions.length > 0);
  assert.equal(run.body.steps.length, 6);
  assert.deepEqual(run.body.workflows, ["dice", "hiringcafe", "linkedin"]);
  assert.ok(run.body.added >= 1);
  assert.equal(run.body.queued, run.body.added);
  assert.equal(
    run.body.optimizedResumes + run.body.originalResumes,
    run.body.queued,
  );
  const state = (await req("/api/state")).body;
  assert.equal(
    state.jobs.filter((job) => job.workflowRunId === run.body.id).length,
    run.body.added,
  );
  assert.ok(
    state.jobs
      .filter((job) => job.workflowRunId === run.body.id)
      .every((job) => job.status === "interested"),
  );
  assert.equal(
    state.submissions.filter((item) => item.atsDecision).length,
    run.body.queued,
  );
  assert.ok(
    state.submissions.every(
      (item) => !item.atsDecision || Number.isFinite(item.atsScore),
    ),
  );
});

test("agent run history can be permanently deleted without deleting saved jobs", async () => {
  const run = await req("/api/agent-runs/start", {
    method: "POST",
    body: JSON.stringify({
      runName: "My Product Search",
      origin: "manual",
      q: "product",
      minFit: 0,
    }),
  });
  assert.equal(run.body.runName, "My Product Search");
  assert.equal(run.body.origin, "manual");
  const jobsBefore = (await req("/api/state")).body.jobs.length;
  const removed = await req(`/api/agent-runs/${run.body.id}`, {
    method: "DELETE",
  });
  assert.equal(removed.res.status, 204);
  const state = (await req("/api/state")).body;
  assert.equal(
    state.agentRuns.some((item) => item.id === run.body.id),
    false,
  );
  assert.equal(state.jobs.length, jobsBefore);
  assert.equal(
    (await req(`/api/agent-runs/${run.body.id}`, { method: "DELETE" })).res
      .status,
    404,
  );
});

test("hunt preview applies role, location, required, excluded, and fit rules truthfully", async () => {
  const preview = await req("/api/agent-runs/preview", {
    method: "POST",
    body: JSON.stringify({
      q: "product engineer",
      location: "Remote",
      minFit: 50,
      requiredKeywords: ["ai"],
    }),
  });
  assert.equal(preview.res.status, 200);
  assert.equal(preview.body.matches.length, 1);
  assert.equal(preview.body.matches[0].company, "Acme AI");
  assert.ok(
    preview.body.matches[0].reasons.some((x) => x.includes("required")),
  );
  const excluded = await req("/api/agent-runs/preview", {
    method: "POST",
    body: JSON.stringify({
      q: "product engineer",
      location: "Remote",
      minFit: 50,
      requiredKeywords: ["ai"],
      excludeKeywords: ["founding"],
    }),
  });
  assert.equal(excluded.body.matches.length, 0);
});

test("hunt presets persist locally and manual URL duplicates are not re-added", async () => {
  const preset = await req("/api/hunt-presets", {
    method: "POST",
    body: JSON.stringify({
      name: "Remote product",
      q: "product",
      location: "Remote",
      minFit: 65,
    }),
  });
  assert.equal(preset.res.status, 201);
  assert.equal(preset.body.options.location, "Remote");
  const presets = (await req("/api/hunt-presets")).body;
  assert.ok(presets.some((x) => x.id === preset.body.id));
  const state = (await req("/api/state")).body;
  const original = state.jobs[0];
  const duplicate = await req("/api/jobs", {
    method: "POST",
    body: JSON.stringify({
      company: original.company,
      title: original.title,
      url: original.url,
    }),
  });
  assert.equal(duplicate.res.status, 200);
  assert.equal(duplicate.body.deduplicated, true);
  await req(`/api/hunt-presets/${preset.body.id}`, { method: "DELETE" });
});

test("resume versions and ATS details are persisted locally", async () => {
  const state = (await req("/api/state")).body;
  const created = await req("/api/resumes", {
    method: "POST",
    body: JSON.stringify({
      name: "Product version",
      templateId: "impact",
      jobId: state.jobs[0].id,
      content: "React TypeScript improved conversion 25%",
    }),
  });
  assert.equal(created.res.status, 201);
  assert.equal(created.body.templateId, "impact");
  assert.equal(created.body.jobId, state.jobs[0].id);
  const score = await req("/api/resume/score", {
    method: "POST",
    body: JSON.stringify({
      resumeText: created.body.content,
      jobId: state.jobs[0].id,
    }),
  });
  assert.equal(score.res.status, 200);
  assert.ok(Array.isArray(score.body.keywordHits));
  assert.ok(score.body.quantifiedBullets >= 1);
  const printable = await fetch(`${base}/print/resume/${created.body.id}`);
  const html = await printable.text();
  assert.equal(printable.status, 200);
  assert.match(printable.headers.get("content-type"), /text\/html/);
  assert.match(html, /Product version/);
});

test("bulk import deduplicates URLs and CSV export is available", async () => {
  const imported = await req("/api/import/jobs", {
    method: "POST",
    body: JSON.stringify({
      jobs: [
        {
          company: "CSV Co",
          title: "Engineer",
          url: "https://example.test/unique",
        },
        {
          company: "CSV Co",
          title: "Engineer",
          url: "https://example.test/unique",
        },
      ],
    }),
  });
  assert.equal(imported.res.status, 201);
  assert.equal(imported.body.added, 1);
  assert.equal(imported.body.skipped, 1);
  const csv = await fetch(base + "/api/export/jobs.csv");
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get("content-type"), /text\/csv/);
  assert.match(await csv.text(), /CSV Co/);
});

test("invalid jobs return a safe 400 response", async () => {
  const bad = await req("/api/jobs", {
    method: "POST",
    body: JSON.stringify({ company: "", title: "" }),
  });
  assert.equal(bad.res.status, 400);
  assert.equal(bad.body.error, "Invalid request");
  const unsafeUrl = await req("/api/jobs", {
    method: "POST",
    body: JSON.stringify({
      company: "Unsafe Co",
      title: "Unsafe role",
      url: "javascript:alert(document.domain)",
    }),
  });
  assert.equal(unsafeUrl.res.status, 400);
  assert.equal(unsafeUrl.body.error, "Invalid request");
});

test("submission queue enforces review before local submission", async () => {
  const state = (await req("/api/state")).body;
  const packet = await req("/api/submissions", {
    method: "POST",
    body: JSON.stringify({ jobId: state.jobs[0].id }),
  });
  assert.equal(packet.res.status, 201);
  assert.equal(packet.body.status, "draft");
  const queuedJob = (await req("/api/state")).body.jobs.find(
    (job) => job.id === state.jobs[0].id,
  );
  assert.equal(queuedJob.status, "interested");
  assert.equal(queuedJob.statusHistory[0].status, "interested");
  assert.equal(packet.body.applicationQuestions.length, 4);
  assert.equal(packet.body.applicationQuestions[2].questionType, "dropdown");
  assert.deepEqual(packet.body.applicationQuestions[2].options, [
    "Immediately",
    "Within 2 weeks",
    "Within 1 month",
    "Other",
  ]);
  assert.equal(
    packet.body.applicationQuestions[3].questionType,
    "multiple_choice",
  );
  const questions = packet.body.applicationQuestions.map((question, index) =>
    index === 0
      ? { ...question, answer: "I build products that match this mission." }
      : question,
  );
  const answered = await req(`/api/submissions/${packet.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ applicationQuestions: questions }),
  });
  assert.equal(
    answered.body.applicationQuestions[0].answer,
    "I build products that match this mission.",
  );
  assert.equal(
    (await req("/api/state")).body.profile.faqAnswers[0].answer,
    "I build products that match this mission.",
  );
  const blocked = await req(`/api/submissions/${packet.body.id}/submit`, {
    method: "POST",
    body: JSON.stringify({ confirmedByUser: true }),
  });
  assert.equal(blocked.res.status, 409);
  const bypassAttempt = await req(`/api/submissions/${packet.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ checklist: [], status: "submitted" }),
  });
  assert.equal(bypassAttempt.body.status, "draft");
  assert.equal(bypassAttempt.body.checklist.length, 3);
  assert.equal(
    bypassAttempt.body.checklist.every((item) => item.done === false),
    true,
  );
  const bypassSubmit = await req(`/api/submissions/${packet.body.id}/submit`, {
    method: "POST",
    body: JSON.stringify({ confirmedByUser: true }),
  });
  assert.equal(bypassSubmit.res.status, 409);
  const checklist = packet.body.checklist.map((item) => ({
    ...item,
    done: true,
  }));
  const ready = await req(`/api/submissions/${packet.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ checklist, status: "ready" }),
  });
  assert.equal(ready.body.status, "ready");
  const unconfirmed = await req(`/api/submissions/${packet.body.id}/submit`, {
    method: "POST",
    body: "{}",
  });
  assert.equal(unconfirmed.res.status, 409);
  assert.match(unconfirmed.body.error, /explicit user confirmation/i);
  const submitted = await req(`/api/submissions/${packet.body.id}/submit`, {
    method: "POST",
    body: JSON.stringify({ confirmedByUser: true }),
  });
  assert.equal(submitted.res.status, 200);
  assert.equal(submitted.body.status, "submitted");
  const refreshed = (await req("/api/state")).body;
  assert.equal(
    refreshed.jobs.find((j) => j.id === state.jobs[0].id).status,
    "applied",
  );
});

test("command center reports weekly goals and due-date priorities", async () => {
  const state = (await req("/api/state")).body;
  const job = state.jobs[0];
  const day = (offset) => {
    const date = new Date(Date.now() + offset * 864e5);
    return date.toISOString().slice(0, 10);
  };
  const overdue = await req(`/api/jobs/${job.id}/tasks`, {
    method: "POST",
    body: JSON.stringify({ text: "Overdue follow-up", due: day(-2) }),
  });
  const upcoming = await req(`/api/jobs/${job.id}/tasks`, {
    method: "POST",
    body: JSON.stringify({ text: "Upcoming interview prep", due: day(3) }),
  });
  const invalid = await req(`/api/jobs/${job.id}/tasks`, {
    method: "POST",
    body: JSON.stringify({ text: "Safe date", due: "not-a-date" }),
  });
  assert.equal(invalid.body.due, "");
  await req("/api/profile", {
    method: "PUT",
    body: JSON.stringify({ preferences: { weeklyApplicationGoal: 1 } }),
  });
  const summary = (await req("/api/summary")).body;
  assert.ok(summary.overdueTasks.some((task) => task.id === overdue.body.id));
  assert.ok(summary.upcomingTasks.some((task) => task.id === upcoming.body.id));
  assert.equal(summary.weeklyGoal, 1);
  assert.ok(summary.weeklyGoalProgress >= 100);
  const removed = await req(`/api/jobs/${job.id}/tasks/${invalid.body.id}`, {
    method: "DELETE",
  });
  assert.equal(removed.res.status, 204);
});

test("coach and outreach create private role-specific drafts", async () => {
  const state = (await req("/api/state")).body;
  const job = state.jobs[0];
  const coach = await req("/api/coach/prepare", {
    method: "POST",
    body: JSON.stringify({ jobId: job.id }),
  });
  assert.equal(coach.res.status, 201);
  assert.equal(coach.body.questions.length, 4);
  assert.match(coach.body.questions[0], new RegExp(job.company));
  const outreach = await req("/api/outreach/draft", {
    method: "POST",
    body: JSON.stringify({ jobId: job.id }),
  });
  assert.equal(outreach.res.status, 201);
  assert.match(outreach.body.body, new RegExp(job.company));
});

test("AI Coach conversations persist in portable local storage", async () => {
  const state = (await req("/api/state")).body;
  const created = await req("/api/coach/conversations", {
    method: "POST",
    body: JSON.stringify({
      jobId: state.jobs[0].id,
      title: "Prepare my product story",
      messages: [
        { role: "user", content: "Help me sharpen my product story." },
        { role: "assistant", content: "Start with a measurable outcome." },
      ],
    }),
  });
  assert.equal(created.res.status, 201);
  const updated = await req(`/api/coach/conversations/${created.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      messages: [
        ...created.body.messages,
        { role: "user", content: "How should I structure it?" },
        { role: "assistant", content: "Use situation, action, and result." },
      ],
    }),
  });
  assert.equal(updated.res.status, 200);
  assert.equal(updated.body.messages.length, 4);
  assert.equal(
    (await req("/api/state")).body.coachConversations[0].messages.length,
    4,
  );
  const removed = await req(`/api/coach/conversations/${created.body.id}`, {
    method: "DELETE",
  });
  assert.equal(removed.res.status, 204);
});

test("career stories ground coach sessions and practice answers persist", async () => {
  const story = await req("/api/career-stories", {
    method: "POST",
    body: JSON.stringify({
      title: "Scaled TypeScript platform",
      situation: "A slow platform",
      task: "Improve reliability",
      action: "Migrated critical services",
      result: "Reduced incidents 35%",
      skills: ["TypeScript"],
    }),
  });
  assert.equal(story.res.status, 201);
  const state = (await req("/api/state")).body;
  const job =
    state.jobs.find((item) =>
      `${item.title} ${item.description} ${(item.tags || []).join(" ")}`
        .toLowerCase()
        .includes("typescript"),
    ) || state.jobs[0];
  const coach = await req("/api/coach/prepare", {
    method: "POST",
    body: JSON.stringify({ jobId: job.id }),
  });
  assert.ok(coach.body.matchedStoryIds.includes(story.body.id));
  const question = coach.body.questions[0];
  const answers = {
    ...coach.body.answers,
    [question]: "A specific saved answer.",
  };
  const saved = await req(`/api/coach/sessions/${coach.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      answers,
      notes: "Ask about team structure",
      researchDone: [coach.body.companyResearch[0]],
      status: "completed",
    }),
  });
  assert.equal(saved.body.answers[question], "A specific saved answer.");
  assert.equal(saved.body.status, "completed");
  assert.equal(saved.body.researchDone.length, 1);
  const edited = await req(`/api/career-stories/${story.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ result: "Reduced incidents 40%" }),
  });
  assert.match(edited.body.result, /40%/);
  await req(`/api/career-stories/${story.body.id}`, { method: "DELETE" });
});

test("outreach drafts persist edits and manual delivery status", async () => {
  const state = (await req("/api/state")).body;
  const created = await req("/api/outreach/draft", {
    method: "POST",
    body: JSON.stringify({ jobId: state.jobs[0].id }),
  });
  const updated = await req(`/api/outreach/${created.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      subject: "Personal note",
      body: "Edited locally",
      status: "sent",
    }),
  });
  assert.equal(updated.res.status, 200);
  assert.equal(updated.body.subject, "Personal note");
  assert.equal(updated.body.status, "sent");
  assert.equal(
    updated.body.recipient,
    state.jobs[0].contacts[0]?.name || "Hiring team",
  );
  assert.ok(
    ["recruiter", "hiring_manager", "peer"].includes(updated.body.category),
  );
  const duplicate = await req("/api/outreach/draft", {
    method: "POST",
    body: JSON.stringify({ jobId: state.jobs[0].id }),
  });
  assert.equal(duplicate.res.status, 200);
  assert.equal(duplicate.body.id, created.body.id);
  assert.equal(duplicate.body.collectedCount, 0);
  assert.equal(
    (await req(`/api/outreach/${created.body.id}`, { method: "DELETE" })).res
      .status,
    204,
  );
});

test("professional profile audits stay local, persist history, and validate limits", async () => {
  const created = await req("/api/profile-audits", {
    method: "POST",
    body: JSON.stringify({
      profileUrl: "https://www.linkedin.com/in/local-profile",
      targetContext:
        "Seeking a product engineer who owns activation experiments and automation.",
      headline: "Product Engineer | TypeScript automation",
      about: "I improved activation 24%. Connect with me.",
      experience: "Built React products and reduced incidents 35%.",
      skills: "TypeScript, React, Automation",
    }),
  });
  assert.equal(created.res.status, 201);
  assert.ok(created.body.total > 0);
  assert.ok(created.body.matchedTerms.includes("activation"));
  assert.ok(created.body.stats.targetContextWords > 0);
  const state = (await req("/api/state")).body;
  assert.ok(state.profileAudits.some((audit) => audit.id === created.body.id));
  assert.equal(
    state.profileAudits.find((audit) => audit.id === created.body.id).input
      .profileUrl,
    "https://www.linkedin.com/in/local-profile",
  );
  const invalid = await req("/api/profile-audits", {
    method: "POST",
    body: JSON.stringify({ headline: "x".repeat(1001) }),
  });
  assert.equal(invalid.res.status, 400);
  const removed = await req(`/api/profile-audits/${created.body.id}`, {
    method: "DELETE",
  });
  assert.equal(removed.res.status, 204);
});

test("local gigs track proposals, deadlines, status history, and earnings", async () => {
  const dueDate = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
  const created = await req("/api/gigs", {
    method: "POST",
    body: JSON.stringify({
      client: "Local Client",
      title: "Workflow prototype",
      budget: 5000,
      dueDate,
      description: "Build an offline prototype",
      proposal: "Deliver in two milestones",
      status: "proposal",
    }),
  });
  assert.equal(created.res.status, 201);
  assert.equal(created.body.budget, 5000);
  let summary = (await req("/api/summary")).body;
  assert.ok(summary.gigs.pipelineValue >= 5000);
  assert.ok(summary.gigs.dueSoon.some((gig) => gig.id === created.body.id));
  const updated = await req(`/api/gigs/${created.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "won", earned: 3000 }),
  });
  assert.equal(updated.body.status, "won");
  assert.equal(updated.body.statusHistory[0].status, "won");
  const submitted = await req(`/api/gigs/${created.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "waiting-approval" }),
  });
  assert.equal(submitted.body.status, "waiting-approval");
  assert.equal(submitted.body.statusHistory[0].status, "waiting-approval");
  summary = (await req("/api/summary")).body;
  assert.ok(summary.gigs.earnings >= 3000);
  assert.ok(summary.gigs.active >= 1);
  const invalidDate = await req("/api/gigs", {
    method: "POST",
    body: JSON.stringify({
      client: "Safe Client",
      title: "Safe date",
      dueDate: "tomorrow",
    }),
  });
  assert.equal(invalidDate.body.dueDate, "");
  assert.equal(
    (await req(`/api/gigs/${created.body.id}`, { method: "DELETE" })).res
      .status,
    204,
  );
  assert.equal(
    (await req(`/api/gigs/${invalidDate.body.id}`, { method: "DELETE" })).res
      .status,
    204,
  );
});

test("cover letters can be edited, printed safely, and removed", async () => {
  const state = (await req("/api/state")).body;
  const job = state.jobs[0];
  const created = await req("/api/cover-letters", {
    method: "POST",
    body: JSON.stringify({
      jobId: job.id,
      style: "story-driven",
      opening: "A customer problem first drew me to this team.",
      emphasis: "I improved conversion by 42% while leading delivery.",
      templateId: "modern",
      templateName: "Modern Impact",
      atsTemplateId: "clean-ats",
      jobDescription: "Build accessible React products for customers.",
      templateContent:
        "Hello {{company}} team,\n\n{{opening}}\n\n{{evidence}}\n\n{{name}}",
    }),
  });
  assert.equal(created.body.style, "story-driven");
  assert.equal(created.body.templateName, "Modern Impact");
  assert.equal(created.body.atsTemplateId, "clean-ats");
  assert.equal(
    created.body.jobDescription,
    "Build accessible React products for customers.",
  );
  assert.match(created.body.body, /customer problem first drew me/);
  assert.match(created.body.body, /improved conversion by 42%/);
  const updated = await req(`/api/cover-letters/${created.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      title: "Tailored letter",
      body: "Hello <script>alert(1)</script>",
    }),
  });
  assert.equal(updated.body.title, "Tailored letter");
  const printable = await fetch(
    `${base}/print/cover-letter/${created.body.id}`,
  );
  const html = await printable.text();
  assert.equal(printable.status, 200);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
  const removed = await req(`/api/cover-letters/${created.body.id}`, {
    method: "DELETE",
  });
  assert.equal(removed.res.status, 204);
});

test("deleting a job cascades its private workflow records", async () => {
  const created = await req("/api/jobs", {
    method: "POST",
    body: JSON.stringify({
      company: "Delete Me",
      title: "Temporary Role",
      url: "https://delete.example/role",
    }),
  });
  const jobId = created.body.id;
  await req("/api/cover-letters", {
    method: "POST",
    body: JSON.stringify({ jobId }),
  });
  await req("/api/coach/prepare", {
    method: "POST",
    body: JSON.stringify({ jobId }),
  });
  await req("/api/coach/conversations", {
    method: "POST",
    body: JSON.stringify({
      jobId,
      title: "Temporary coaching chat",
      messages: [{ role: "user", content: "Help with this role." }],
    }),
  });
  await req("/api/outreach/draft", {
    method: "POST",
    body: JSON.stringify({ jobId }),
  });
  await req("/api/submissions", {
    method: "POST",
    body: JSON.stringify({ jobId }),
  });
  const removed = await req(`/api/jobs/${jobId}`, { method: "DELETE" });
  assert.equal(removed.res.status, 204);
  const state = (await req("/api/state")).body;
  for (const key of [
    "jobs",
    "coverLetters",
    "coachingSessions",
    "coachConversations",
    "outreachDrafts",
    "submissions",
  ])
    assert.equal(
      state[key].some((item) => item.id === jobId || item.jobId === jobId),
      false,
      `${key} retained deleted job data`,
    );
});

test("full restore accepts only bounded JobHuntr backup keys", async () => {
  const state = (await req("/api/state")).body;
  const restored = await req("/api/import", {
    method: "POST",
    body: JSON.stringify({
      ...state,
      unexpectedCloudConfig: { token: "not-copied" },
    }),
  });
  assert.equal(restored.res.status, 200);
  const after = (await req("/api/state")).body;
  assert.equal(after.unexpectedCloudConfig, undefined);

  for (const invalidBackup of [
    { jobs: "not-an-array" },
    { jobs: ["not-a-job-record"] },
    { jobs: [], coachConversations: "not-an-array" },
  ]) {
    const rejected = await req("/api/import", {
      method: "POST",
      body: JSON.stringify(invalidBackup),
    });
    assert.equal(rejected.res.status, 400);
  }

  const stillHealthy = await req("/api/state");
  assert.equal(stillHealthy.res.status, 200);
  assert.equal(Array.isArray(stillHealthy.body.jobs), true);
});

test("resume templates can be created, edited, and safely removed", async () => {
  const created = await req("/api/templates", {
    method: "POST",
    body: JSON.stringify({
      name: "Technical Leadership",
      description: "Highlights architecture and team outcomes.",
      sections: ["Summary", "Leadership", "Experience", "Education"],
      originalResume: "Original resume content",
      editedResume: "Edited resume content",
      additionalExperience: "Mentored five engineers.",
      testJobId: "test-job",
    }),
  });
  assert.equal(created.res.status, 201);
  assert.equal(created.body.name, "Technical Leadership");
  assert.equal(created.body.editedResume, "Edited resume content");
  assert.equal(created.body.additionalExperience, "Mentored five engineers.");
  const updated = await req(`/api/templates/${created.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ name: "Engineering Leadership" }),
  });
  assert.equal(updated.res.status, 200);
  assert.equal(updated.body.name, "Engineering Leadership");
  const removed = await req(`/api/templates/${created.body.id}`, {
    method: "DELETE",
  });
  assert.equal(removed.res.status, 204);
  const templates = (await req("/api/templates")).body;
  assert.equal(
    templates.some((template) => template.id === created.body.id),
    false,
  );
});

test("malformed primary storage recovers from the local backup", async () => {
  await req("/api/profile", {
    method: "PUT",
    body: JSON.stringify({ headline: "Recovery checkpoint" }),
  });
  await fs.writeFile(path.join(dir, "jobhuntr.json"), "{malformed json");
  const recovered = await req("/api/state");
  assert.equal(recovered.res.status, 200);
  assert.ok(Array.isArray(recovered.body.jobs));
  const files = await fs.readdir(dir);
  assert.ok(files.some((name) => name.startsWith("jobhuntr.corrupt-")));
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(dir, { recursive: true, force: true });
});
