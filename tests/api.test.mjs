import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";

const dir = await fs.mkdtemp(path.join(os.tmpdir(), "jobhuntr-test-"));
process.env.NODE_ENV = "test";
process.env.JOBHUNTR_DATA_DIR = dir;
const serverModule = await import("../server/index.mjs");
const app = serverModule.default;
const { claimScheduledHunt, isApplicationQuestionReady, runScheduledHunt } =
  serverModule;
const { mutate } = await import("../server/store.mjs");
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
  assert.match(
    res.headers.get("content-security-policy"),
    /base-uri 'none'.*object-src 'none'.*form-action 'self'/,
  );
  const hostileHostStatus = await new Promise((resolve, reject) => {
    const request = http.get(
      `${base}/api/health`,
      { headers: { Host: "attacker.example" } },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );
    request.on("error", reject);
  });
  assert.equal(hostileHostStatus, 421);
  const hostileOrigin = await fetch(`${base}/api/health`, {
    headers: { Origin: "https://attacker.example" },
  });
  assert.equal(hostileOrigin.status, 403);
  const sameOrigin = await fetch(`${base}/api/health`, {
    headers: { Origin: base },
  });
  assert.equal(sameOrigin.status, 200);
  const state = (await req("/api/state")).body;
  assert.ok(state.jobs.length >= 2);
  assert.ok(state.summary.totalJobs >= 2);
  if (process.platform !== "win32") {
    const dbPath = path.join(dir, "jobhuntr.json");
    await fs.chmod(dir, 0o755);
    await fs.chmod(dbPath, 0o644);
    await req("/api/state");
    assert.equal((await fs.stat(dir)).mode & 0o777, 0o700);
    assert.equal((await fs.stat(dbPath)).mode & 0o777, 0o600);
  }
});

test("optional application questions can be safely skipped but answered questions require verification", () => {
  assert.equal(
    isApplicationQuestionReady({
      required: false,
      answer: "",
      verified: false,
    }),
    true,
  );
  assert.equal(
    isApplicationQuestionReady({
      required: false,
      answer: "Prefer not to answer",
      verified: false,
    }),
    false,
  );
  assert.equal(
    isApplicationQuestionReady({
      required: false,
      answer: "Prefer not to answer",
      verified: true,
    }),
    true,
  );
  assert.equal(
    isApplicationQuestionReady({ required: true, answer: "", verified: true }),
    false,
  );
  assert.equal(
    isApplicationQuestionReady({
      required: true,
      questionType: "dropdown",
      options: ["Yes", "No"],
      answer: "Maybe",
      verified: true,
    }),
    false,
  );
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
  assert.equal(patch.res.status, 409);
  const confirmedPatch = await req(`/api/jobs/${create.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "applied", confirmedByUser: true }),
  });
  assert.equal(confirmedPatch.body.status, "applied");
  assert.equal(confirmedPatch.body.statusHistory[0].status, "applied");
  assert.equal(
    confirmedPatch.body.statusHistory[0].source,
    "manual-confirmation",
  );
  assert.ok(confirmedPatch.body.applicationDatetime);
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
      linkedIn: "https://www.linkedin.com/in/alex-recruiter",
    }),
  });
  assert.equal(contact.res.status, 201);
  assert.equal(contact.body.name, "Alex Recruiter");
  assert.equal(
    contact.body.linkedIn,
    "https://www.linkedin.com/in/alex-recruiter",
  );
  const editedContact = await req(
    `/api/jobs/${create.body.id}/contacts/${contact.body.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ role: "Senior Recruiter" }),
    },
  );
  assert.equal(editedContact.res.status, 200);
  assert.equal(editedContact.body.role, "Senior Recruiter");
  const unsafeContact = await req(`/api/jobs/${create.body.id}/contacts`, {
    method: "POST",
    body: JSON.stringify({
      name: "Unsafe contact",
      linkedIn: "javascript:alert(1)",
    }),
  });
  assert.equal(unsafeContact.res.status, 400);
  const removedContact = await req(
    `/api/jobs/${create.body.id}/contacts/${contact.body.id}`,
    { method: "DELETE" },
  );
  assert.equal(removedContact.res.status, 204);
});

test("Job Board queueing atomically deduplicates jobs and application packets", async () => {
  const boardJob = {
    company: "Atomic Board Co",
    title: "Queue Reliability Engineer",
    location: "Remote",
    url: "https://jobs.example.com/atomic-board-queue",
    source: "Local board",
    description: "Build resilient application workflows.",
    status: "interested",
  };
  const responses = await Promise.all(
    Array.from({ length: 4 }, () =>
      req("/api/board/queue", {
        method: "POST",
        body: JSON.stringify(boardJob),
      }),
    ),
  );
  assert.equal(responses.filter(({ res }) => res.status === 201).length, 1);
  assert.equal(responses.filter(({ res }) => res.status === 200).length, 3);
  const state = (await req("/api/state")).body;
  const jobs = state.jobs.filter((job) => job.url === boardJob.url);
  assert.equal(jobs.length, 1);
  assert.equal(
    state.submissions.filter((submission) => submission.jobId === jobs[0].id)
      .length,
    1,
  );

  const orphanUrl = "https://jobs.example.com/repair-orphaned-board-job";
  const orphan = await req("/api/jobs", {
    method: "POST",
    body: JSON.stringify({ ...boardJob, url: orphanUrl }),
  });
  const repaired = await req("/api/board/queue", {
    method: "POST",
    body: JSON.stringify({ ...boardJob, url: orphanUrl }),
  });
  assert.equal(repaired.res.status, 201);
  assert.equal(repaired.body.job.id, orphan.body.id);
  assert.equal(repaired.body.submission.jobId, orphan.body.id);
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

test("FAQ deletion is isolated from unrelated profile fields", async () => {
  const faq = {
    id: "atomic-faq-delete",
    question: "What motivates you?",
    answer: "Building useful products.",
  };
  await req("/api/profile", {
    method: "PUT",
    body: JSON.stringify({
      nickname: "Before isolated delete",
      faqAnswers: [faq],
    }),
  });
  await req("/api/profile", {
    method: "PUT",
    body: JSON.stringify({ nickname: "Preserved after isolated delete" }),
  });
  const removed = await req("/api/profile/faqs/delete", {
    method: "POST",
    body: JSON.stringify({ id: faq.id, question: faq.question }),
  });
  assert.equal(removed.res.status, 200);
  assert.deepEqual(removed.body.faqAnswers, []);
  const profile = (await req("/api/state")).body.profile;
  assert.equal(profile.nickname, "Preserved after isolated delete");
  assert.deepEqual(profile.faqAnswers, []);
  assert.equal(
    (
      await req("/api/profile/faqs/delete", {
        method: "POST",
        body: JSON.stringify({ id: faq.id, question: faq.question }),
      })
    ).res.status,
    404,
  );
});

test("concurrent profile saves cannot race a valid resume back to a placeholder", async () => {
  await mutate((db) => {
    db.profile.resumeText = "Paste your resume here.";
  });
  const completeResume =
    "Senior product engineer with eight years of experience shipping accessible React and TypeScript products. Increased conversion by 42%, mentored six engineers, and led reliable cross-functional launches.";
  const requests = [
    req("/api/profile", {
      method: "PUT",
      body: JSON.stringify({ resumeText: completeResume }),
    }),
    ...Array.from({ length: 12 }, (_, index) =>
      req("/api/profile", {
        method: "PUT",
        body: JSON.stringify({
          headline: `Concurrent stale editor ${index}`,
          resumeText: "Paste your resume here.",
        }),
      }),
    ),
  ];
  const results = await Promise.all(requests);
  assert.ok(
    results.slice(1).some(({ res }) => res.status === 409),
    "stale profile editors should be rejected after the valid resume commits",
  );
  assert.equal(
    (await req("/api/state")).body.profile.resumeText,
    completeResume,
    "serialized profile validation must preserve the valid resume",
  );
  await mutate((db) => {
    db.profile.resumeText = "Paste your resume here.";
  });
});

test("agent run saves matches and logs actions", async () => {
  const blocked = await req("/api/agent-runs/start", {
    method: "POST",
    body: JSON.stringify({ q: "engineer", optimizeResume: true }),
  });
  assert.equal(blocked.res.status, 409);
  await req("/api/profile", {
    method: "PUT",
    body: JSON.stringify({
      resumeText:
        "Senior product engineer with eight years of experience. Increased conversion by 42% using React, TypeScript, Python, and customer research.",
    }),
  });
  const clearedResume = await req("/api/profile", {
    method: "PUT",
    body: JSON.stringify({ resumeText: "" }),
  });
  assert.equal(clearedResume.res.status, 409);
  assert.match(clearedResume.body.error, /valid base resume/i);
  assert.match(
    (await req("/api/state")).body.profile.resumeText,
    /Increased conversion by 42%/,
  );
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
  assert.ok(
    state.submissions
      .filter((item) => item.atsDecision)
      .every((item) => item.checklist.every((check) => check.done === false)),
    "generated documents must never auto-complete human review",
  );
});

test("infinite hunt schedule persists and can be stopped safely", async () => {
  const invalid = await req("/api/infinite-hunt/start", {
    method: "POST",
    body: JSON.stringify({ intervalMinutes: 0, options: { q: "engineer" } }),
  });
  assert.equal(invalid.res.status, 400);
  const started = await req("/api/infinite-hunt/start", {
    method: "POST",
    body: JSON.stringify({
      intervalMinutes: 15,
      options: {
        q: "product engineer",
        minFit: 55,
        workflows: ["linkedin", "indeed"],
      },
    }),
  });
  assert.equal(started.res.status, 201);
  assert.equal(started.body.enabled, true);
  assert.equal(started.body.intervalMinutes, 15);
  assert.ok(Date.parse(started.body.nextRunAt) > Date.now());
  const persisted = (await req("/api/state")).body.infiniteHunt;
  assert.equal(persisted.options.q, "product engineer");
  assert.deepEqual(persisted.options.workflows, ["linkedin", "indeed"]);
  const stateBeforeSchedule = (await req("/api/state")).body;
  const runsBefore = stateBeforeSchedule.agentRuns.length;
  const jobsBefore = stateBeforeSchedule.jobs.length;
  await mutate((db) => {
    db.infiniteHunt.nextRunAt = new Date(Date.now() - 1000).toISOString();
  });
  const staleSchedule = (await req("/api/state")).body.infiniteHunt;
  const restarted = await req("/api/infinite-hunt/start", {
    method: "POST",
    body: JSON.stringify({
      intervalMinutes: 30,
      options: {
        q: "frontend platform engineer",
        minFit: 65,
        workflows: ["glassdoor"],
      },
    }),
  });
  assert.equal(await claimScheduledHunt(staleSchedule), null);
  const afterStaleClaim = (await req("/api/state")).body;
  assert.equal(afterStaleClaim.agentRuns.length, runsBefore);
  assert.equal(
    afterStaleClaim.infiniteHunt.nextRunAt,
    restarted.body.nextRunAt,
    "a stale scheduler tick must not advance a restarted schedule",
  );
  assert.equal(
    afterStaleClaim.infiniteHunt.options.q,
    "frontend platform engineer",
  );
  const staleRunAttempt = await req("/api/agent-runs/start", {
    method: "POST",
    body: JSON.stringify({
      q: "stale scheduler request",
      origin: "infinite",
      scheduleGeneration: started.body.generation,
      minFit: 0,
      workflows: ["linkedin"],
    }),
  });
  assert.equal(staleRunAttempt.res.status, 409);
  const afterStaleRunAttempt = (await req("/api/state")).body;
  assert.equal(afterStaleRunAttempt.agentRuns.length, runsBefore);
  assert.equal(
    afterStaleRunAttempt.jobs.length,
    jobsBefore,
    "a stale scheduler request must not create run data",
  );
  const staleConditionalStop = await req("/api/infinite-hunt/stop", {
    method: "POST",
    body: JSON.stringify({ generation: started.body.generation }),
  });
  assert.equal(staleConditionalStop.res.status, 200);
  assert.equal(staleConditionalStop.body.stopped, false);
  assert.equal(staleConditionalStop.body.enabled, true);
  assert.equal(staleConditionalStop.body.generation, restarted.body.generation);
  await mutate((db) => {
    db.infiniteHunt.nextRunAt = new Date(Date.now() - 1000).toISOString();
  });
  let releaseDelayedRun;
  let observeDelayedRun;
  const delayedRunObserved = new Promise(
    (resolve) => (observeDelayedRun = resolve),
  );
  const delayedRunReleased = new Promise(
    (resolve) => (releaseDelayedRun = resolve),
  );
  const delayedServer = http.createServer(async (_request, response) => {
    observeDelayedRun();
    await delayedRunReleased;
    response.writeHead(503, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Delayed old generation failed" }));
  });
  await new Promise((resolve) => delayedServer.listen(0, "127.0.0.1", resolve));
  const delayedRun = runScheduledHunt(
    `http://127.0.0.1:${delayedServer.address().port}`,
  );
  await delayedRunObserved;
  const restartedDuringRun = await req("/api/infinite-hunt/start", {
    method: "POST",
    body: JSON.stringify({
      intervalMinutes: 45,
      options: {
        q: "new schedule generation",
        minFit: 70,
        workflows: ["indeed"],
      },
    }),
  });
  releaseDelayedRun();
  await delayedRun;
  await new Promise((resolve, reject) =>
    delayedServer.close((error) => (error ? reject(error) : resolve())),
  );
  const afterDelayedOldRun = (await req("/api/state")).body.infiniteHunt;
  assert.equal(
    afterDelayedOldRun.generation,
    restartedDuringRun.body.generation,
  );
  assert.equal(afterDelayedOldRun.options.q, "new schedule generation");
  assert.equal(
    afterDelayedOldRun.lastError,
    "",
    "an old in-flight failure must not overwrite a restarted schedule",
  );
  await mutate((db) => {
    db.infiniteHunt.nextRunAt = new Date(Date.now() - 1000).toISOString();
  });
  await runScheduledHunt("http://127.0.0.1:1");
  const afterFailedScheduledRun = (await req("/api/state")).body;
  assert.equal(afterFailedScheduledRun.infiniteHunt.enabled, true);
  assert.ok(
    afterFailedScheduledRun.infiniteHunt.lastError,
    "a failed scheduled hunt must preserve a user-visible diagnostic",
  );
  assert.ok(
    Date.parse(afterFailedScheduledRun.infiniteHunt.nextRunAt) > Date.now(),
    "a failed run must advance its schedule instead of retrying continuously",
  );
  await mutate((db) => {
    db.infiniteHunt.nextRunAt = new Date(Date.now() - 1000).toISOString();
  });
  await runScheduledHunt(base);
  const afterScheduledRun = (await req("/api/state")).body;
  assert.equal(afterScheduledRun.agentRuns.length, runsBefore + 1);
  assert.ok(afterScheduledRun.infiniteHunt.lastRunAt);
  assert.equal(afterScheduledRun.infiniteHunt.lastError, "");
  assert.ok(Date.parse(afterScheduledRun.infiniteHunt.nextRunAt) > Date.now());
  const stopped = await req("/api/infinite-hunt/stop", { method: "POST" });
  assert.equal(stopped.res.status, 200);
  assert.equal(stopped.body.enabled, false);
  assert.equal(stopped.body.nextRunAt, null);
});

test("Infinite Hunt startup atomically persists its schedule and initial run", async () => {
  const before = (await req("/api/state")).body;
  const invalid = await req("/api/infinite-hunt/start-run", {
    method: "POST",
    body: JSON.stringify({ intervalMinutes: 0, options: { q: "engineer" } }),
  });
  assert.equal(invalid.res.status, 400);
  const afterInvalid = (await req("/api/state")).body;
  assert.equal(afterInvalid.agentRuns.length, before.agentRuns.length);
  assert.equal(
    afterInvalid.infiniteHunt.generation,
    before.infiniteHunt.generation,
    "invalid startup must not replace the existing schedule",
  );

  const started = await req("/api/infinite-hunt/start-run", {
    method: "POST",
    body: JSON.stringify({
      intervalMinutes: 25,
      options: {
        q: "atomic product engineer",
        minFit: 55,
        workflows: ["linkedin", "indeed"],
      },
    }),
  });
  assert.equal(started.res.status, 201);
  assert.equal(started.body.schedule.enabled, true);
  assert.equal(started.body.schedule.intervalMinutes, 25);
  assert.equal(started.body.run.status, "completed");
  const persisted = (await req("/api/state")).body;
  assert.equal(
    persisted.infiniteHunt.generation,
    started.body.schedule.generation,
  );
  assert.equal(persisted.agentRuns[0].id, started.body.run.id);
});

test("a hung scheduled hunt times out and cannot freeze future cycles", async () => {
  await mutate((db) => {
    db.infiniteHunt = {
      enabled: true,
      intervalMinutes: 15,
      startedAt: new Date(Date.now() - 60_000).toISOString(),
      nextRunAt: new Date(Date.now() - 1000).toISOString(),
      lastRunAt: null,
      lastError: "",
      generation: "hung-schedule-generation",
      options: {
        q: "scheduler recovery engineer",
        minFit: 0,
        maxResults: 5,
        workflows: ["indeed"],
      },
    };
  });
  const hungServer = http.createServer((request) => {
    request.resume();
    // Intentionally never respond. JobHuntr must abort this request itself.
  });
  await new Promise((resolve) => hungServer.listen(0, "127.0.0.1", resolve));
  const timedOutRun = runScheduledHunt(
    `http://127.0.0.1:${hungServer.address().port}`,
    25,
  );
  await timedOutRun;
  await new Promise((resolve, reject) => {
    hungServer.close((error) => (error ? reject(error) : resolve()));
    hungServer.closeAllConnections();
  });
  let state = (await req("/api/state")).body;
  assert.match(state.infiniteHunt.lastError, /abort|timeout/i);
  assert.ok(Date.parse(state.infiniteHunt.nextRunAt) > Date.now());

  await mutate((db) => {
    db.infiniteHunt.nextRunAt = new Date(Date.now() - 1000).toISOString();
  });
  await runScheduledHunt(base, 1000);
  state = (await req("/api/state")).body;
  assert.ok(
    state.infiniteHunt.lastRunAt,
    "the scheduler lock must be released so the next due cycle can run",
  );
  assert.equal(state.infiniteHunt.lastError, "");
});

test("agent run history can be permanently deleted without deleting saved jobs", async () => {
  await mutate((db) => {
    db.agentRuns.unshift({
      id: "legacy-run",
      runName: { malformed: true },
      status: "unknown",
      q: "legacy engineer",
      workflows: ["indeed", "retired-board"],
      activities: [
        {
          title: "Legacy workflow step",
          description: "Recovered from the old activity field",
        },
      ],
      steps: "not-an-array",
      actions: ["Saved a role", 42],
      matches: [
        {
          company: "Legacy Co",
          title: "Engineer",
          fitScore: 140,
          reasons: ["Skill match", 42],
        },
      ],
      inspected: "4",
      found: -2,
    });
  });
  const migratedRun = (await req("/api/state")).body.agentRuns.find(
    (item) => item.id === "legacy-run",
  );
  assert.equal(migratedRun.runName, "legacy engineer");
  assert.deepEqual(migratedRun.steps, [
    {
      name: "Legacy workflow step",
      status: "completed",
      detail: "Recovered from the old activity field",
    },
  ]);
  assert.deepEqual(migratedRun.actions, ["Saved a role"]);
  assert.equal(migratedRun.matches[0].fitScore, 100);
  assert.deepEqual(migratedRun.matches[0].reasons, ["Skill match"]);
  assert.equal(migratedRun.inspected, 4);
  assert.equal(migratedRun.found, 0);
  assert.equal("activities" in migratedRun, false);
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

test("bulk agent run deletion is atomic when any selected run is missing", async () => {
  await mutate((db) => {
    for (const id of ["bulk-run-a", "bulk-run-b"])
      db.agentRuns.unshift({
        id,
        runName: id,
        status: "completed",
        search: { q: "engineer" },
        workflows: ["linkedin"],
        steps: [],
        actions: [],
        matches: [],
        createdAt: new Date().toISOString(),
      });
  });
  const rejected = await req("/api/agent-runs/delete", {
    method: "POST",
    body: JSON.stringify({ ids: ["bulk-run-a", "missing-bulk-run"] }),
  });
  assert.equal(rejected.res.status, 404);
  let state = (await req("/api/state")).body;
  assert.ok(state.agentRuns.some((run) => run.id === "bulk-run-a"));
  assert.ok(state.agentRuns.some((run) => run.id === "bulk-run-b"));
  const removed = await req("/api/agent-runs/delete", {
    method: "POST",
    body: JSON.stringify({ ids: ["bulk-run-a", "bulk-run-b"] }),
  });
  assert.equal(removed.res.status, 200);
  assert.equal(removed.body.deleted, 2);
  state = (await req("/api/state")).body;
  assert.equal(
    state.agentRuns.some((run) =>
      ["bulk-run-a", "bulk-run-b"].includes(run.id),
    ),
    false,
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
  await mutate((db) => {
    db.huntPresets.unshift({
      id: "legacy-preset",
      name: "Legacy platform hunt",
      q: "platform engineer",
      location: "Remote",
      minFit: 72,
      requiredKeywords: [" TypeScript ", 42],
      excludeKeywords: ["clearance"],
      workflows: ["indeed", "retired-board", "indeed"],
      optimizeResume: true,
    });
  });
  const migratedPreset = (await req("/api/state")).body.huntPresets.find(
    (item) => item.id === "legacy-preset",
  );
  assert.deepEqual(migratedPreset.options, {
    runName: "platform engineer",
    origin: "infinite",
    q: "platform engineer",
    location: "Remote",
    minFit: 72,
    maxResults: 25,
    requiredKeywords: ["TypeScript"],
    excludeKeywords: ["clearance"],
    workflows: ["indeed"],
    optimizeResume: true,
  });
  assert.equal("workflows" in migratedPreset, false);
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
      content:
        "Senior product engineer who improved conversion by 25% using React and TypeScript. Led cross-functional delivery and reliable product experimentation.",
      updateProfile: true,
    }),
  });
  assert.equal(created.res.status, 201);
  assert.equal(created.body.templateId, "impact");
  assert.equal(created.body.jobId, state.jobs[0].id);
  const savedState = (await req("/api/state")).body;
  assert.equal(savedState.profile.resumeText, created.body.content);
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
  const placeholder = await req("/api/resumes", {
    method: "POST",
    body: JSON.stringify({ content: "Paste your resume here." }),
  });
  assert.equal(placeholder.res.status, 400);
  const placeholderScore = await req("/api/resume/score", {
    method: "POST",
    body: JSON.stringify({ resumeText: "Paste your resume here." }),
  });
  assert.equal(placeholderScore.res.status, 400);
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
  const credentialUrl = await req("/api/jobs", {
    method: "POST",
    body: JSON.stringify({
      company: "Credential leak",
      title: "Unsafe role",
      url: "https://private-token:secret@example.test/apply",
    }),
  });
  assert.equal(credentialUrl.res.status, 400);
  assert.equal(credentialUrl.body.error, "Invalid request");

  const state = (await req("/api/state")).body;
  const originalStatus = state.jobs[0].status;
  const invalidStatus = await req(`/api/jobs/${state.jobs[0].id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "definitely-not-a-stage" }),
  });
  assert.equal(invalidStatus.res.status, 400);
  assert.equal(
    (await req("/api/state")).body.jobs.find(
      (job) => job.id === state.jobs[0].id,
    ).status,
    originalStatus,
  );
  const missingJob = await req("/api/jobs/not-a-real-job", {
    method: "PATCH",
    body: JSON.stringify({ title: "Must not update the workspace object" }),
  });
  assert.equal(missingJob.res.status, 404);
  assert.equal(missingJob.body.error, "Job not found");
  const missingSubmission = await req("/api/submissions/not-a-real-packet", {
    method: "PATCH",
    body: JSON.stringify({ status: "archived" }),
  });
  assert.equal(missingSubmission.res.status, 404);
  assert.equal(missingSubmission.body.error, "Submission not found");
});

test("submission queue enforces review before local submission", async () => {
  const state = (await req("/api/state")).body;
  const customFaq = {
    id: "custom-easy-apply-evidence",
    question: "Describe a project that demonstrates systems thinking.",
    answer: "I redesigned a release process and cut recovery time by 40%.",
  };
  const typedFaqs = [
    {
      id: "availability-as-text",
      question: "When are you available to start?",
      answer: "Tomorrow morning",
      questionType: "text_input",
      options: [],
    },
    {
      id: "availability-incompatible-dropdown",
      question: "When are you available to start?",
      answer: "Tomorrow morning",
      questionType: "dropdown",
      options: ["Tomorrow morning"],
    },
    {
      id: "availability-as-dropdown",
      question: "When are you available to start?",
      answer: "Within 1 month",
      questionType: "dropdown",
      options: ["Immediately", "Within 2 weeks", "Within 1 month", "Other"],
    },
  ];
  await req("/api/profile", {
    method: "PUT",
    body: JSON.stringify({
      ...state.profile,
      faqAnswers: [...state.profile.faqAnswers, customFaq, ...typedFaqs],
    }),
  });
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
    packet.body.applicationQuestions[2].answer,
    "Within 1 month",
    "Easy Apply must match remembered evidence by wording and control type",
  );
  assert.equal(
    packet.body.applicationQuestions[2].confident,
    false,
    "unverified imported FAQ evidence must not become confident implicitly",
  );
  assert.equal(
    packet.body.applicationQuestions[3].questionType,
    "multiple_choice",
  );
  const packetResume = await req("/api/resumes", {
    method: "POST",
    body: JSON.stringify({
      name: "Packet-protected resume",
      content:
        "Product engineer with eight years of experience delivering reliable React and TypeScript products. Improved conversion by 42% and led accessible cross-functional launches.",
    }),
  });
  await req(`/api/submissions/${packet.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ resumeId: packetResume.body.id }),
  });
  const blockedResumeDeletion = await req(
    `/api/resumes/${packetResume.body.id}`,
    { method: "DELETE" },
  );
  assert.equal(blockedResumeDeletion.res.status, 409);
  assert.match(blockedResumeDeletion.body.error, /attached to 1 application/i);
  assert.ok(
    (await req("/api/state")).body.resumes.some(
      (resume) => resume.id === packetResume.body.id,
    ),
    "a packet attachment must survive a direct deletion attempt",
  );
  await req(`/api/submissions/${packet.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ resumeId: "profile-resume" }),
  });
  assert.equal(
    (await req(`/api/resumes/${packetResume.body.id}`, { method: "DELETE" }))
      .res.status,
    204,
  );
  const questions = packet.body.applicationQuestions.map((question, index) =>
    index === 0
      ? {
          ...question,
          answer: "I build products that match this mission.",
          verified: true,
        }
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
  const rememberedAfterAnswer = (await req("/api/state")).body.profile
    .faqAnswers;
  assert.equal(
    rememberedAfterAnswer.find(
      (answer) => answer.question === questions[0].question,
    ).answer,
    "I build products that match this mission.",
  );
  assert.equal(
    rememberedAfterAnswer.find(
      (answer) => answer.question === questions[0].question,
    ).confident,
    true,
    "explicitly verified Easy Apply evidence should be remembered as confident",
  );
  assert.deepEqual(
    rememberedAfterAnswer.find((answer) => answer.id === customFaq.id),
    {
      ...customFaq,
      questionType: "text_input",
      options: [],
      confident: false,
    },
    "reviewing a packet must not erase unrelated About Me evidence",
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
  assert.equal(bypassAttempt.res.status, 400);
  const packetAfterBypass = (await req("/api/state")).body.submissions.find(
    (submission) => submission.id === packet.body.id,
  );
  assert.equal(packetAfterBypass.status, "draft");
  assert.equal(packetAfterBypass.checklist.length, 3);
  assert.equal(
    packetAfterBypass.checklist.every((item) => item.done === false),
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
  const tamperedQuestions = answered.body.applicationQuestions.map(
    (question, index) =>
      index === 2
        ? {
            ...question,
            question: "Attacker-controlled replacement",
            options: ["Invented option"],
            answer: "Invented option",
          }
        : question,
  );
  const tampered = await req(`/api/submissions/${packet.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      checklist,
      status: "ready",
      resumeId: "profile-resume",
      applicationQuestions: tamperedQuestions,
    }),
  });
  assert.equal(tampered.body.status, "draft");
  assert.equal(
    tampered.body.applicationQuestions[2].question,
    "When are you available to start?",
  );
  assert.equal(tampered.body.applicationQuestions[2].confident, false);
  const unansweredSubmit = await req(
    `/api/submissions/${packet.body.id}/submit`,
    {
      method: "POST",
      body: JSON.stringify({ confirmedByUser: true }),
    },
  );
  assert.equal(unansweredSubmit.res.status, 409);
  assert.match(unansweredSubmit.body.error, /required application question/i);
  const unverifiedQuestions = tampered.body.applicationQuestions.map(
    (question, index) => ({
      ...question,
      verified: index !== 0,
      answer:
        index === 0
          ? "Unverified replacement that must not enter About Me."
          : index === 1
            ? "$150,000 base, depending on the complete package."
            : index === 2
              ? "Within 2 weeks"
              : "No",
    }),
  );
  const unverified = await req(`/api/submissions/${packet.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      checklist,
      status: "ready",
      resumeId: "profile-resume",
      applicationQuestions: unverifiedQuestions,
    }),
  });
  assert.equal(unverified.body.status, "draft");
  const rememberedAfterUnverifiedEdit = (await req("/api/state")).body.profile
    .faqAnswers;
  assert.equal(
    rememberedAfterUnverifiedEdit.find(
      (answer) => answer.question === questions[0].question,
    ).answer,
    "I build products that match this mission.",
    "an unverified form edit must not replace the last verified answer",
  );
  assert.deepEqual(
    rememberedAfterUnverifiedEdit.find((answer) => answer.id === customFaq.id),
    {
      ...customFaq,
      questionType: "text_input",
      options: [],
      confident: false,
    },
  );
  const unverifiedSubmit = await req(
    `/api/submissions/${packet.body.id}/submit`,
    {
      method: "POST",
      body: JSON.stringify({ confirmedByUser: true }),
    },
  );
  assert.equal(unverifiedSubmit.res.status, 409);
  assert.match(unverifiedSubmit.body.error, /explicitly verify/i);
  const completeQuestions = tampered.body.applicationQuestions.map(
    (question, index) => ({
      ...question,
      verified: true,
      answer:
        index === 0
          ? "I build products that match this mission."
          : index === 1
            ? "$150,000 base, depending on the complete package."
            : index === 2
              ? "Within 2 weeks"
              : "No",
    }),
  );
  const ready = await req(`/api/submissions/${packet.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      checklist,
      status: "ready",
      resumeId: "profile-resume",
      applicationQuestions: completeQuestions,
    }),
  });
  assert.equal(ready.body.status, "ready");
  const unconfirmed = await req(`/api/submissions/${packet.body.id}/submit`, {
    method: "POST",
    body: "{}",
  });
  assert.equal(unconfirmed.res.status, 409);
  assert.match(unconfirmed.body.error, /explicit user confirmation/i);
  const rejectedMissingLetter = await req(
    `/api/submissions/${packet.body.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        coverLetterId: "missing-cover-letter",
        checklist,
        status: "ready",
      }),
    },
  );
  assert.equal(rejectedMissingLetter.res.status, 400);
  assert.match(rejectedMissingLetter.body.error, /no longer exists/i);
  const packetLetter = await req("/api/cover-letters", {
    method: "POST",
    body: JSON.stringify({
      jobId: state.jobs[0].id,
      resumeId: "profile-resume",
    }),
  });
  assert.equal(packetLetter.res.status, 201);
  const attachedLetter = await req(`/api/submissions/${packet.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      coverLetterId: packetLetter.body.id,
      checklist,
      status: "ready",
    }),
  });
  assert.equal(attachedLetter.body.status, "ready");
  const attachmentChanged = await req(`/api/submissions/${packet.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ coverLetterId: "" }),
  });
  assert.equal(attachmentChanged.body.status, "draft");
  assert.equal(
    attachmentChanged.body.checklist.find(
      (item) => item.text === "Review cover letter",
    ).done,
    false,
  );
  assert.equal(
    attachmentChanged.body.checklist.find(
      (item) => item.text === "Confirm application details",
    ).done,
    false,
  );
  await req(`/api/submissions/${packet.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ checklist, status: "ready" }),
  });
  const submitted = await req(`/api/submissions/${packet.body.id}/submit`, {
    method: "POST",
    body: JSON.stringify({ confirmedByUser: true }),
  });
  assert.equal(submitted.res.status, 200);
  assert.equal(submitted.body.status, "submitted");
  assert.equal(submitted.body.resumeSnapshot.id, "profile-resume");
  assert.match(submitted.body.resumeSnapshot.content, /product engineer/i);
  assert.equal(submitted.body.coverLetterSnapshot, null);
  assert.equal(submitted.body.jobSnapshot.id, state.jobs[0].id);
  assert.equal(submitted.body.jobSnapshot.title, state.jobs[0].title);
  assert.equal(submitted.body.profileSnapshot.name, state.profile.name);
  const submittedResumePreview = await fetch(
    `${base}/print/submission/${packet.body.id}/resume`,
  );
  assert.equal(submittedResumePreview.status, 200);
  const submittedResumeHtml = await submittedResumePreview.text();
  assert.match(submittedResumeHtml, /product engineer/i);
  assert.match(submittedResumeHtml, new RegExp(state.profile.name));
  assert.equal(
    (await fetch(`${base}/print/submission/${packet.body.id}/cover-letter`))
      .status,
    404,
  );
  const submittedAt = submitted.body.submittedAt;
  const submittedResumeContent = submitted.body.resumeSnapshot.content;
  const submittedHistoryLength = (await req("/api/state")).body.jobs
    .find((job) => job.id === state.jobs[0].id)
    .statusHistory.filter((entry) => entry.status === "applied").length;
  const tamperedSubmittedPacket = await req(
    `/api/submissions/${packet.body.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status: "archived",
        resumeId: "",
        applicationQuestions: [],
      }),
    },
  );
  assert.equal(tamperedSubmittedPacket.res.status, 409);
  assert.match(tamperedSubmittedPacket.body.error, /immutable/i);
  const repeatedConfirmation = await req(
    `/api/submissions/${packet.body.id}/submit`,
    {
      method: "POST",
      body: JSON.stringify({ confirmedByUser: true }),
    },
  );
  assert.equal(repeatedConfirmation.res.status, 200);
  assert.equal(repeatedConfirmation.body.submittedAt, submittedAt);
  const preservedSubmissionState = (await req("/api/state")).body;
  assert.equal(
    preservedSubmissionState.submissions.find(
      (submission) => submission.id === packet.body.id,
    ).resumeId,
    "profile-resume",
  );
  assert.equal(
    preservedSubmissionState.jobs
      .find((job) => job.id === state.jobs[0].id)
      .statusHistory.filter((entry) => entry.status === "applied").length,
    submittedHistoryLength,
    "repeated confirmation must not duplicate application history",
  );
  await req("/api/profile", {
    method: "PUT",
    body: JSON.stringify({
      resumeText:
        "Updated product leader with ten years of experience delivering accessible platforms. Increased retention by 51%, mentored eight engineers, and led reliable TypeScript launches.",
    }),
  });
  assert.equal(
    (await req("/api/state")).body.submissions.find(
      (submission) => submission.id === packet.body.id,
    ).resumeSnapshot.content,
    submittedResumeContent,
    "later profile edits must not rewrite submitted resume evidence",
  );
  const regressed = await req(`/api/jobs/${state.jobs[0].id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "saved" }),
  });
  assert.equal(regressed.res.status, 409);
  const refreshed = (await req("/api/state")).body;
  assert.equal(
    refreshed.jobs.find((j) => j.id === state.jobs[0].id).status,
    "applied",
  );
});

test("a blank optional application question does not block a reviewed packet", async () => {
  const job = await req("/api/jobs", {
    method: "POST",
    body: JSON.stringify({
      company: "Optional Questions Co",
      title: "Product Engineer",
      url: "https://optional-questions.example/jobs/product-engineer",
    }),
  });
  const packet = await req("/api/submissions", {
    method: "POST",
    body: JSON.stringify({ jobId: job.body.id }),
  });
  await mutate((db) => {
    const stored = db.submissions.find((item) => item.id === packet.body.id);
    stored.applicationQuestions = [
      {
        id: "optional-demographic-question",
        question: "Optional demographic response",
        questionType: "dropdown",
        options: ["Prefer not to answer"],
        required: false,
        answer: "",
        verified: false,
      },
    ];
  });
  const ready = await req(`/api/submissions/${packet.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      resumeId: "profile-resume",
      checklist: packet.body.checklist.map((item) => ({
        ...item,
        done: true,
      })),
      status: "ready",
    }),
  });
  assert.equal(ready.body.status, "ready");
  const submitted = await req(`/api/submissions/${packet.body.id}/submit`, {
    method: "POST",
    body: JSON.stringify({ confirmedByUser: true }),
  });
  assert.equal(submitted.res.status, 200);
  assert.equal(submitted.body.status, "submitted");
  assert.equal(submitted.body.applicationQuestions[0].answer, "");
  assert.equal(submitted.body.applicationQuestions[0].verified, false);
});

test("terminal job stages retire stale application packets", async () => {
  const job = await req("/api/jobs", {
    method: "POST",
    body: JSON.stringify({
      company: "Terminal Stage Co",
      title: "Platform Engineer",
      url: "https://terminal-stage.example/jobs/platform-engineer",
    }),
  });
  const packet = await req("/api/submissions", {
    method: "POST",
    body: JSON.stringify({ jobId: job.body.id, resumeId: "profile-resume" }),
  });
  assert.equal(packet.res.status, 201);

  const rejected = await req(`/api/jobs/${job.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "rejected" }),
  });
  assert.equal(rejected.res.status, 200);
  const archivedPacket = (await req("/api/state")).body.submissions.find(
    (submission) => submission.id === packet.body.id,
  );
  assert.equal(archivedPacket.status, "archived");

  const staleSubmit = await req(`/api/submissions/${packet.body.id}/submit`, {
    method: "POST",
    body: JSON.stringify({ confirmedByUser: true }),
  });
  assert.equal(staleSubmit.res.status, 409);
  assert.match(staleSubmit.body.error, /no longer active/i);

  const duplicatePacket = await req("/api/submissions", {
    method: "POST",
    body: JSON.stringify({ jobId: job.body.id }),
  });
  assert.equal(duplicatePacket.res.status, 409);
  assert.match(duplicatePacket.body.error, /only active opportunities/i);
  assert.equal(
    (await req("/api/state")).body.submissions.filter(
      (submission) => submission.jobId === job.body.id,
    ).length,
    1,
  );
});

test("bulk packet archiving is atomic when any packet is invalid", async () => {
  const packetIds = [];
  for (const suffix of ["one", "two"]) {
    const job = await req("/api/jobs", {
      method: "POST",
      body: JSON.stringify({
        company: "Atomic Archive Co",
        title: `Engineer ${suffix}`,
        url: `https://atomic-archive.example/jobs/${suffix}`,
      }),
    });
    const packet = await req("/api/submissions", {
      method: "POST",
      body: JSON.stringify({ jobId: job.body.id, resumeId: "profile-resume" }),
    });
    packetIds.push(packet.body.id);
  }

  const rejected = await req("/api/submissions/archive", {
    method: "POST",
    body: JSON.stringify({ ids: [...packetIds, "missing-packet"] }),
  });
  assert.equal(rejected.res.status, 404);
  let state = (await req("/api/state")).body;
  assert.deepEqual(
    packetIds.map(
      (id) => state.submissions.find((packet) => packet.id === id).status,
    ),
    ["draft", "draft"],
  );

  const archived = await req("/api/submissions/archive", {
    method: "POST",
    body: JSON.stringify({ ids: packetIds }),
  });
  assert.equal(archived.res.status, 200);
  assert.equal(archived.body.count, 2);
  state = (await req("/api/state")).body;
  assert.deepEqual(
    packetIds.map(
      (id) => state.submissions.find((packet) => packet.id === id).status,
    ),
    ["archived", "archived"],
  );
  const rejectedArchivedSubmission = await req(
    `/api/submissions/${packetIds[0]}/submit`,
    {
      method: "POST",
      body: JSON.stringify({ confirmedByUser: true }),
    },
  );
  assert.equal(rejectedArchivedSubmission.res.status, 409);
  assert.match(
    rejectedArchivedSubmission.body.error,
    /ready application packet/i,
  );
  assert.equal(
    (await req("/api/state")).body.submissions.find(
      (packet) => packet.id === packetIds[0],
    ).status,
    "archived",
  );
});

test("rapid application review edits cannot overwrite each other", async () => {
  const job = await req("/api/jobs", {
    method: "POST",
    body: JSON.stringify({
      company: "Parallel Review Co",
      title: "Reliability Engineer",
      url: "https://parallel-review.example/apply",
    }),
  });
  const packet = await req("/api/submissions", {
    method: "POST",
    body: JSON.stringify({ jobId: job.body.id, resumeId: "profile-resume" }),
  });
  const [firstQuestion, secondQuestion] = packet.body.applicationQuestions;
  const [firstCheck, secondCheck] = packet.body.checklist;

  const updates = await Promise.all([
    req(`/api/submissions/${packet.body.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        applicationQuestion: {
          id: firstQuestion.id,
          answer: "I have directly relevant reliability experience.",
          verified: true,
        },
      }),
    }),
    req(`/api/submissions/${packet.body.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        applicationQuestion: {
          id: secondQuestion.id,
          answer: "$160,000 base, depending on total compensation.",
          verified: true,
        },
      }),
    }),
    req(`/api/submissions/${packet.body.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        checklistItem: { id: firstCheck.id, done: true },
      }),
    }),
    req(`/api/submissions/${packet.body.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        checklistItem: { id: secondCheck.id, done: true },
      }),
    }),
  ]);
  assert.ok(updates.every(({ res }) => res.status === 200));

  const persisted = (await req("/api/state")).body.submissions.find(
    (submission) => submission.id === packet.body.id,
  );
  assert.equal(
    persisted.applicationQuestions.find(
      (question) => question.id === firstQuestion.id,
    ).answer,
    "I have directly relevant reliability experience.",
  );
  assert.equal(
    persisted.applicationQuestions.find(
      (question) => question.id === secondQuestion.id,
    ).answer,
    "$160,000 base, depending on total compensation.",
  );
  assert.equal(
    persisted.applicationQuestions
      .filter((question) =>
        [firstQuestion.id, secondQuestion.id].includes(question.id),
      )
      .every((question) => question.verified),
    true,
  );
  assert.equal(
    persisted.checklist
      .filter((item) => [firstCheck.id, secondCheck.id].includes(item.id))
      .every((item) => item.done),
    true,
  );
});

test("editing one Easy Apply answer does not re-remember unrelated verified answers", async () => {
  const job = await req("/api/jobs", {
    method: "POST",
    body: JSON.stringify({
      company: "Focused Memory Co",
      title: "Application Integrity Engineer",
      url: "https://focused-memory.example/apply",
    }),
  });
  const packet = await req("/api/submissions", {
    method: "POST",
    body: JSON.stringify({ jobId: job.body.id, resumeId: "profile-resume" }),
  });
  const [verifiedQuestion, editedQuestion] = packet.body.applicationQuestions;
  const verified = await req(`/api/submissions/${packet.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      applicationQuestion: {
        id: verifiedQuestion.id,
        answer: "A focused answer that should be remembered exactly once.",
        verified: true,
      },
    }),
  });
  assert.equal(verified.res.status, 200);
  const beforeEdit = (await req("/api/state")).body;
  const memoryEventsBefore = beforeEdit.activities.filter(
    (activity) =>
      activity.type === "about-me" &&
      activity.data?.submissionId === packet.body.id,
  ).length;
  const rememberedBefore = structuredClone(beforeEdit.profile.faqAnswers);

  const edited = await req(`/api/submissions/${packet.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      applicationQuestion: {
        id: editedQuestion.id,
        answer: "$175,000 base depending on the complete package.",
        verified: false,
      },
    }),
  });
  assert.equal(edited.res.status, 200);
  const afterEdit = (await req("/api/state")).body;
  assert.deepEqual(
    afterEdit.profile.faqAnswers,
    rememberedBefore,
    "an unverified edit must not rewrite any remembered application answer",
  );
  assert.equal(
    afterEdit.activities.filter(
      (activity) =>
        activity.type === "about-me" &&
        activity.data?.submissionId === packet.body.id,
    ).length,
    memoryEventsBefore,
    "an unverified edit must not claim unrelated answers were remembered again",
  );
});

test("malformed Easy Apply updates are rejected without mutating the packet", async () => {
  const job = await req("/api/jobs", {
    method: "POST",
    body: JSON.stringify({
      company: "Atomic Packet Co",
      title: "Application Safety Engineer",
      url: "https://atomic-packet.example/apply",
    }),
  });
  const packet = await req("/api/submissions", {
    method: "POST",
    body: JSON.stringify({ jobId: job.body.id, resumeId: "profile-resume" }),
  });
  const original = (await req("/api/state")).body.submissions.find(
    (submission) => submission.id === packet.body.id,
  );
  const [question] = original.applicationQuestions;
  const [checklistItem] = original.checklist;
  const invalidUpdates = [
    { checklist: [] },
    { checklistItem: { id: "stale-checklist-id", done: true } },
    { checklistItem: { id: checklistItem.id, done: "yes" } },
    {
      applicationQuestions: [
        { id: question.id, answer: "First answer" },
        { id: question.id, answer: "Conflicting answer" },
      ],
    },
    { applicationQuestion: { id: "stale-question-id", verified: true } },
    { applicationQuestion: { id: question.id } },
    { applicationQuestions: [] },
    { applicationQuestion: { id: question.id, answer: { unsafe: true } } },
    { applicationQuestion: { id: question.id, verified: "true" } },
    { resumeId: "deleted-resume-id" },
    { coverLetterId: "deleted-cover-letter-id" },
  ];
  for (const update of invalidUpdates) {
    const rejected = await req(`/api/submissions/${packet.body.id}`, {
      method: "PATCH",
      body: JSON.stringify(update),
    });
    assert.equal(rejected.res.status, 400, JSON.stringify(update));
    const persisted = (await req("/api/state")).body.submissions.find(
      (submission) => submission.id === packet.body.id,
    );
    assert.deepEqual(
      persisted,
      original,
      `invalid update mutated the packet: ${JSON.stringify(update)}`,
    );
  }
});

test("editing attached source documents invalidates pending packet reviews", async () => {
  const state = (await req("/api/state")).body;
  const job = await req("/api/jobs", {
    method: "POST",
    body: JSON.stringify({
      company: "Review Guard",
      title: "Product Engineer",
    }),
  });
  const resume = await req("/api/resumes", {
    method: "POST",
    body: JSON.stringify({
      name: "Review guard resume",
      content:
        "Product engineer with eight years of experience shipping reliable TypeScript products. Increased activation by 38% and led accessible cross-functional delivery.",
    }),
  });
  const letter = await req("/api/cover-letters", {
    method: "POST",
    body: JSON.stringify({
      jobId: job.body.id,
      resumeId: resume.body.id,
      templateContent:
        "Dear {{company}}, {{opening}} {{evidence}} {{closing}} Best, {{name}}",
    }),
  });
  const packet = await req("/api/submissions", {
    method: "POST",
    body: JSON.stringify({
      jobId: job.body.id,
      resumeId: resume.body.id,
      coverLetterId: letter.body.id,
    }),
  });
  const questions = packet.body.applicationQuestions.map((question) => ({
    ...question,
    answer:
      question.questionType === "dropdown"
        ? question.options[0]
        : question.questionType === "multiple_choice"
          ? question.options[1]
          : "I verified this accurate response against the current form.",
    verified: true,
  }));
  const checklist = packet.body.checklist.map((item) => ({
    ...item,
    done: true,
  }));
  const ready = await req(`/api/submissions/${packet.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      checklist,
      applicationQuestions: questions,
      status: "ready",
    }),
  });
  assert.equal(ready.body.status, "ready");

  await req(`/api/resumes/${resume.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      content: `${resume.body.content}\nImproved release reliability by 27%.`,
    }),
  });
  let refreshed = (await req("/api/state")).body.submissions.find(
    (item) => item.id === packet.body.id,
  );
  assert.equal(refreshed.status, "draft");
  assert.equal(refreshed.checklist[0].done, false);
  assert.equal(refreshed.checklist[1].done, true);
  assert.equal(refreshed.checklist[2].done, false);

  await req(`/api/submissions/${packet.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ checklist, status: "ready" }),
  });
  await req(`/api/cover-letters/${letter.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      body: `${letter.body.body}\nThank you for your time.`,
    }),
  });
  refreshed = (await req("/api/state")).body.submissions.find(
    (item) => item.id === packet.body.id,
  );
  assert.equal(refreshed.status, "draft");
  assert.equal(refreshed.checklist[0].done, true);
  assert.equal(refreshed.checklist[1].done, false);
  assert.equal(refreshed.checklist[2].done, false);

  await req(`/api/submissions/${packet.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      resumeId: "profile-resume",
      checklist,
      status: "ready",
    }),
  });
  await req("/api/profile", {
    method: "PUT",
    body: JSON.stringify({
      resumeText: `${state.profile.resumeText}\nDelivered another verified customer outcome of 31%.`,
    }),
  });
  refreshed = (await req("/api/state")).body.submissions.find(
    (item) => item.id === packet.body.id,
  );
  assert.equal(refreshed.status, "draft");
  assert.equal(refreshed.checklist[0].done, false);
  assert.equal(refreshed.checklist[2].done, false);

  await req(`/api/submissions/${packet.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ checklist, status: "ready" }),
  });
  await req(`/api/jobs/${job.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      title: "Senior Product Engineer",
      url: "https://review-guard.example/new-application",
    }),
  });
  refreshed = (await req("/api/state")).body.submissions.find(
    (item) => item.id === packet.body.id,
  );
  assert.equal(refreshed.status, "draft");
  assert.equal(
    refreshed.checklist.every((item) => item.done === false),
    true,
  );
  assert.equal(
    refreshed.applicationQuestions.every(
      (question) => question.verified === false,
    ),
    true,
    "a changed employer form target must require every answer to be verified again",
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
  assert.equal(invalid.res.status, 400);
  assert.match(invalid.body.error, /due date/i);
  const empty = await req(`/api/jobs/${job.id}/tasks`, {
    method: "POST",
    body: JSON.stringify({ text: "   " }),
  });
  assert.equal(empty.res.status, 400);
  await req("/api/profile", {
    method: "PUT",
    body: JSON.stringify({ preferences: { weeklyApplicationGoal: 1 } }),
  });
  const summary = (await req("/api/summary")).body;
  assert.ok(summary.overdueTasks.some((task) => task.id === overdue.body.id));
  assert.ok(summary.upcomingTasks.some((task) => task.id === upcoming.body.id));
  assert.equal(summary.weeklyGoal, 1);
  assert.ok(summary.weeklyGoalProgress >= 100);
  const invalidDone = await req(
    `/api/jobs/${job.id}/tasks/${upcoming.body.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ done: "false" }),
    },
  );
  assert.equal(invalidDone.res.status, 400);
  const removed = await req(`/api/jobs/${job.id}/tasks/${upcoming.body.id}`, {
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
  assert.doesNotMatch(
    outreach.body.body,
    /\.\.(?:\s|$)/,
    "role descriptions with punctuation must not create double periods",
  );
  assert.ok(
    outreach.body.body.trim().split(/\s+/).length <= 100,
    "connection drafts should preserve v2's concise outreach format",
  );
});

test("Career Coach conversations persist in portable local storage", async () => {
  const state = (await req("/api/state")).body;
  const interviewAdvice = await req("/api/coach/respond", {
    method: "POST",
    body: JSON.stringify({
      prompt: "Help me prepare for my behavioral interview",
      jobId: state.jobs[0].id,
    }),
  });
  assert.equal(interviewAdvice.res.status, 200);
  assert.equal(interviewAdvice.body.mode, "local-rules");
  assert.match(interviewAdvice.body.response, /interview/i);
  assert.match(interviewAdvice.body.response, /measurable result/i);
  const resumeAdvice = await req("/api/coach/respond", {
    method: "POST",
    body: JSON.stringify({ prompt: "Improve my resume bullets" }),
  });
  assert.match(resumeAdvice.body.response, /ATS analysis/i);
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
  const invalidStory = await req("/api/career-stories", {
    method: "POST",
    body: JSON.stringify({ title: "   " }),
  });
  assert.equal(invalidStory.res.status, 400);
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
  const invalidEdit = await req(`/api/career-stories/${story.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ title: "" }),
  });
  assert.equal(invalidEdit.res.status, 400);
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

test("bulk outreach recording is atomic when any contact is invalid", async () => {
  const ids = [];
  for (const suffix of ["one", "two"]) {
    const job = await req("/api/jobs", {
      method: "POST",
      body: JSON.stringify({
        company: "Atomic Outreach Co",
        title: `Engineer ${suffix}`,
        url: `https://atomic-outreach.example/jobs/${suffix}`,
      }),
    });
    const created = await req("/api/outreach/draft", {
      method: "POST",
      body: JSON.stringify({ jobId: job.body.id }),
    });
    ids.push(created.body.id);
  }
  assert.equal(new Set(ids).size, 2);

  const rejected = await req("/api/outreach/bulk-status", {
    method: "POST",
    body: JSON.stringify({ ids: [...ids, "missing-contact"], status: "sent" }),
  });
  assert.equal(rejected.res.status, 404);
  let workspace = (await req("/api/state")).body;
  assert.deepEqual(
    ids.map(
      (id) => workspace.outreachDrafts.find((draft) => draft.id === id).status,
    ),
    ["draft", "draft"],
  );

  const recorded = await req("/api/outreach/bulk-status", {
    method: "POST",
    body: JSON.stringify({ ids, status: "sent" }),
  });
  assert.equal(recorded.res.status, 200);
  assert.equal(recorded.body.count, 2);
  workspace = (await req("/api/state")).body;
  assert.deepEqual(
    ids.map(
      (id) => workspace.outreachDrafts.find((draft) => draft.id === id).status,
    ),
    ["sent", "sent"],
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
  const ungrounded = await req("/api/cover-letters", {
    method: "POST",
    body: JSON.stringify({ jobId: job.id }),
  });
  assert.equal(ungrounded.res.status, 409);
  const incompleteManual = await req("/api/cover-letters", {
    method: "POST",
    body: JSON.stringify({
      resumeId: "profile-resume",
      job: { description: "Build an accessible product." },
    }),
  });
  assert.equal(incompleteManual.res.status, 400);
  const manual = await req("/api/cover-letters", {
    method: "POST",
    body: JSON.stringify({
      resumeId: "profile-resume",
      job: {
        company: "Manual Company",
        title: "Product Engineer",
        description: "Build an accessible product.",
      },
    }),
  });
  assert.equal(manual.res.status, 201);
  assert.match(manual.body.body, /Manual Company/);
  assert.match(manual.body.body, /Product Engineer/);
  await req(`/api/cover-letters/${manual.body.id}`, { method: "DELETE" });
  const created = await req("/api/cover-letters", {
    method: "POST",
    body: JSON.stringify({
      jobId: job.id,
      style: "story-driven",
      opening: "A customer problem first drew me to this team.",
      emphasis: "I improved conversion by 42% while leading delivery.",
      templateId: "modern",
      templateName: "Modern Impact",
      documentName: "Product leadership letter",
      atsTemplateId: "clean-ats",
      resumeId: "profile-resume",
      jobDescription: "Build accessible React products for customers.",
      templateContent:
        "Hello {{company}} team,\n\n{{opening}}\n\n{{evidence}}\n\n{{name}}",
    }),
  });
  assert.equal(created.body.style, "story-driven");
  assert.equal(created.body.templateName, "Modern Impact");
  assert.equal(created.body.documentName, "Product leadership letter");
  assert.equal(created.body.title, "Product leadership letter");
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
  const packet = await req("/api/submissions", {
    method: "POST",
    body: JSON.stringify({ jobId: job.id }),
  });
  await req(`/api/submissions/${packet.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ coverLetterId: created.body.id }),
  });
  const blockedDeletion = await req(`/api/cover-letters/${created.body.id}`, {
    method: "DELETE",
  });
  assert.equal(blockedDeletion.res.status, 409);
  assert.match(blockedDeletion.body.error, /attached to 1 application/i);
  await req(`/api/submissions/${packet.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ coverLetterId: "" }),
  });
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
    body: JSON.stringify({ jobId, resumeId: "profile-resume" }),
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
  const largePreview = await req("/api/import/preview", {
    method: "POST",
    body: JSON.stringify({
      jobs: [
        {
          id: "large-backup-job",
          company: "Large Backup",
          title: "Restorable role",
          description: "x".repeat(3 * 1024 * 1024),
        },
      ],
    }),
  });
  assert.equal(largePreview.res.status, 200);
  assert.equal(largePreview.body.jobs, 1);
  const oversizedStandardRequest = await req("/api/jobs", {
    method: "POST",
    body: JSON.stringify({
      company: "Oversized",
      title: "Request",
      description: "x".repeat(3 * 1024 * 1024),
    }),
  });
  assert.equal(oversizedStandardRequest.res.status, 413);
  assert.match(oversizedStandardRequest.body.error, /2 MB or smaller/);
  const preview = await req("/api/import/preview", {
    method: "POST",
    body: JSON.stringify(state),
  });
  assert.equal(preview.res.status, 200);
  assert.equal(preview.body.jobs, state.jobs.length);
  assert.equal(preview.body.resumes, state.resumes.length);
  assert.equal(preview.body.profileIncluded, true);
  assert.equal(
    (await req("/api/state")).body.activities.length,
    state.activities.length,
    "previewing a backup must not mutate the current workspace",
  );
  const invalidPreview = await req("/api/import/preview", {
    method: "POST",
    body: JSON.stringify({ jobs: "not-an-array" }),
  });
  assert.equal(invalidPreview.res.status, 400);
  const malformedJsonPreview = await req("/api/import/preview", {
    method: "POST",
    body: "not valid json",
  });
  assert.equal(malformedJsonPreview.res.status, 400);
  assert.match(malformedJsonPreview.body.error, /valid JobHuntr backup JSON/);
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

  const malformedNested = await req("/api/import", {
    method: "POST",
    body: JSON.stringify({
      ...after,
      profile: {
        ...after.profile,
        onboarded: "yes",
        name: { malformed: true },
        firstName: { malformed: true },
        lastName: { malformed: true },
        nickname: { malformed: true },
        headline: { malformed: true },
        location: { malformed: true },
        targetRoles: ["  Product Engineer  ", 42, "Product Engineer", ""],
        skills: ["  React  ", 42, "React", ""],
        resumeText: { malformed: true },
        additionalInfo: { malformed: true },
        preferences: {
          remote: "yes",
          locations: ["  Remote  ", 42, "Remote", ""],
          minSalary: -10,
          weeklyApplicationGoal: 999,
          atsThreshold: -5,
        },
        faqAnswers: [
          {
            id: "duplicate-faq-id",
            question: { malformed: true },
            answer: { malformed: true },
          },
          {
            id: "duplicate-faq-id",
            question_text: "  Valid restored question?  ",
            answer: "  Valid restored answer  ",
            question_type: "dropdown",
            options: { 0: "Valid restored answer", 1: "Another answer" },
            confident: true,
          },
          {
            id: "duplicate-faq-id",
            question: "Second restored question?",
            answer: "Second restored answer",
          },
        ],
      },
      templates: [
        {
          id: "duplicate-document-id",
          name: { malformed: true },
          description: 42,
          sections: "not-an-array",
        },
        {
          id: "duplicate-document-id",
          name: "  Legacy Design  ",
          sections: ["Summary", "", 12, "Experience"],
        },
      ],
      resumes: [
        {
          id: "duplicate-resume-id",
          name: { malformed: true },
          templateId: "missing-template",
          content: { shouldNotRender: true },
        },
        {
          id: "duplicate-resume-id",
          name: "  Imported Resume  ",
          templateId: "duplicate-document-id",
          content: "  Preserved resume content  ",
        },
      ],
      coverLetters: [
        {
          id: "duplicate-letter-id",
          title: { malformed: true },
          body: { shouldNotRender: true },
          style: "unsupported",
        },
        {
          id: "duplicate-letter-id",
          title: "  Imported Letter  ",
          body: "  Preserved letter body  ",
        },
      ],
      jobs: [
        {
          ...after.jobs[0],
          company: { malformed: true },
          title: { malformed: true },
          location: { malformed: true },
          url: "javascript:alert(1)",
          source: { malformed: true },
          salary: { malformed: true },
          description: { malformed: true },
          status: "queued",
          tags: "not-an-array",
          matchReasons: ["  Strong role match  ", 42, ""],
          fitScore: 400,
          optimizedAtsScore: -20,
          numApplicants: -12,
          notes: [
            {
              id: "duplicate-note-id",
              text: { malformed: true },
              at: { malformed: true },
            },
            {
              id: "duplicate-note-id",
              text: "  Preserved private note  ",
              at: "2029-02-01T00:00:00.000Z",
            },
          ],
          tasks: [
            {
              id: "duplicate-task-id",
              text: { malformed: true },
              due: "tomorrow",
              done: true,
            },
            {
              id: "duplicate-task-id",
              text: "  Preserved follow-up task  ",
              due: "2030-04-05",
              done: "yes",
            },
          ],
          contacts: [
            null,
            {
              id: "duplicate-contact-id",
              name: { malformed: true },
              role: { malformed: true },
              email: { malformed: true },
              linkedIn: { malformed: true },
            },
            {
              id: "duplicate-contact-id",
              name: "  Alex Morgan  ",
              role: "  Recruiter  ",
              email: "  alex@example.com  ",
              linkedIn: "  https://www.linkedin.com/in/alex  ",
            },
          ],
          statusHistory: [{ status: "interviewing", at: { malformed: true } }],
          interviewRounds: [
            {
              id: "duplicate-round-id",
              roundType: { malformed: true },
              notes: { malformed: true },
              status: { malformed: true },
              outcome: { malformed: true },
            },
            {
              id: "duplicate-round-id",
              roundType: "  Interview Round 2  ",
              notes: "  Preserved round notes  ",
              status: "  scheduled  ",
              outcome: "  pending  ",
            },
          ],
        },
        {
          id: "terminal-restored-job",
          company: "Closed Company",
          title: "Closed Role",
          status: "rejected",
        },
      ],
      submissions: [
        {
          id: "legacy-v2-submission",
          jobId: after.jobs[0].id,
          status: "applied",
          checklist: [],
        },
        {
          id: "unsafe-legacy-draft",
          jobId: after.jobs[0].id,
          status: "ready",
          checklist: [
            {
              id: "duplicate-check-id",
              text: "Review resume alignment",
              done: true,
            },
            {
              id: "duplicate-check-id",
              text: "Unexpected legacy step",
              done: true,
            },
          ],
          applicationQuestions: [
            {
              id: "duplicate-question-id",
              question: "When can you start?",
              questionType: "dropdown",
              options: "not-an-array",
              answer: "Tomorrow",
              required: true,
              confident: true,
              verified: true,
            },
            {
              id: "duplicate-question-id",
              question: "Optional note",
              questionType: "legacy-widget",
              answer: "  Keep this answer  ",
              required: false,
              verified: true,
            },
          ],
        },
        {
          id: "stale-terminal-packet",
          jobId: "terminal-restored-job",
          status: "ready",
          checklist: [
            "Review resume alignment",
            "Review cover letter",
            "Confirm application details",
          ].map((text, index) => ({ id: `stale-${index}`, text, done: true })),
          applicationQuestions: [],
        },
      ],
      gigs: [
        {
          id: "duplicate-gig-id",
          client: { malformed: true },
          title: { malformed: true },
          source: { malformed: true },
          url: { malformed: true },
          budget: -500,
          earned: 999999999,
          dueDate: "tomorrow",
          description: { malformed: true },
          proposal: { malformed: true },
          status: "paying",
          statusHistory: [{ status: "invalid", at: { malformed: true } }],
        },
        {
          id: "duplicate-gig-id",
          client: "  Restored Client  ",
          title: "  Restored Gig  ",
          source: "  Partner Board  ",
          url: "  https://gigs.example/restored  ",
          budget: "2500",
          earned: "500",
          dueDate: "2030-03-15",
          description: "  Restored description  ",
          proposal: "  Restored proposal  ",
          status: "in-progress",
          statusHistory: [
            { status: "proposal", at: "2029-01-01T00:00:00.000Z" },
            { status: "invalid", at: "2029-01-02T00:00:00.000Z" },
          ],
        },
      ],
      coachConversations: [
        { id: "empty-legacy-chat", messages: "bad" },
        {
          id: "duplicate-coach-id",
          title: { malformed: true },
          messages: [
            { role: "system", content: "must be removed" },
            { role: "user", content: { malformed: true } },
            { role: "user", content: "  Preserved coaching question  " },
            { role: "assistant", content: "  Preserved coaching answer  " },
          ],
        },
        {
          id: "duplicate-coach-id",
          title: "Second conversation",
          messages: [{ role: "assistant", content: "Second answer" }],
        },
      ],
      careerStories: [
        {
          id: "duplicate-story-id",
          title: { malformed: true },
          action: { malformed: true },
          result: "  Increased retention by 20%  ",
          skills: ["React", "", 42, "React"],
        },
        {
          id: "duplicate-story-id",
          title: "  Preserved STAR story  ",
          skills: "bad",
        },
      ],
      coachingSessions: [
        {
          id: "duplicate-session-id",
          status: "unexpected",
          questions: ["  Valid question?  ", "", 42, "Valid question?"],
          answers: {
            "Valid question?": "  Preserved practice answer  ",
            "Removed question": "Must not survive",
          },
          matchedStoryIds: ["duplicate-story-id", "missing-story"],
          talkingPoints: ["  Use specific evidence  ", 42],
          companyResearch: ["  Read the product page  ", 42],
          researchDone: ["Read the product page", "Invented task"],
          notes: { malformed: true },
        },
      ],
      huntPresets: [
        {
          id: "duplicate-preset-id",
          name: { malformed: true },
          options: { q: { malformed: true }, workflows: ["linkedin", 42] },
        },
        {
          id: "duplicate-preset-id",
          name: "  Restored preset  ",
          options: { q: "  Product Engineer  ", workflows: ["indeed"] },
        },
      ],
      profileAudits: [
        {
          id: "restored-audit-id",
          createdAt: { malformed: true },
          input: {
            profileUrl: "javascript:alert(1)",
            headline: { malformed: true },
            skills: ["  React  ", 42, "React"],
          },
          total: 500,
          checks: [
            {
              section: { malformed: true },
              score: -20,
              status: "unsafe",
              detail: { malformed: true },
            },
          ],
          matchedTerms: ["  product  ", 42, "product"],
          metrics: -1,
          suggestions: ["  Add evidence  ", 42],
        },
      ],
      agentRuns: [
        {
          id: "duplicate-run-id",
          runName: { malformed: true },
          status: "unsafe",
          search: { q: { malformed: true } },
          matches: [
            {
              company: { malformed: true },
              title: { malformed: true },
              url: "javascript:alert(1)",
              reasons: ["  Restored reason  ", 42],
            },
          ],
          steps: [{ name: { malformed: true }, detail: { malformed: true } }],
        },
        {
          id: "duplicate-run-id",
          runName: "  Restored run  ",
          search: { q: "  Restored role  " },
        },
      ],
      infiniteHunt: {
        enabled: "true",
        generation: { malformed: true },
        intervalMinutes: 99999,
        options: {
          q: { malformed: true },
          workflows: ["linkedin", "unsafe", 42],
        },
        startedAt: { malformed: true },
        nextRunAt: "not-a-date",
        lastRunAt: "also-not-a-date",
        lastError: { malformed: true },
      },
      activities: [
        {
          id: "duplicate-activity-id",
          message: { malformed: true },
        },
        {
          id: "duplicate-activity-id",
          type: { malformed: true },
          message: "  Restored activity  ",
          data: { runId: "  duplicate-run-id  ", nested: { unsafe: true } },
        },
      ],
      outreachDrafts: [
        {
          id: "duplicate-outreach-id",
          jobId: after.jobs[0].id,
          contactId: "duplicate-contact-id",
          recipient: { malformed: true },
          contactRole: { malformed: true },
          contactEmail: { malformed: true },
          category: "unsupported",
          connectionDegree: { malformed: true },
          channel: "sms",
          subject: { malformed: true },
          body: { malformed: true },
          status: "sending",
        },
        {
          id: "duplicate-outreach-id",
          jobId: after.jobs[0].id,
          recipient: "  Alex Morgan  ",
          contactRole: "  Recruiter  ",
          contactEmail: "  alex@example.com  ",
          category: "recruiter",
          connectionDegree: "  Known contact  ",
          channel: "email",
          subject: "  Preserved outreach subject  ",
          body: "  Preserved outreach body  ",
          status: "replied",
        },
      ],
    }),
  });
  assert.equal(malformedNested.res.status, 200);
  const normalized = (await req("/api/state")).body;
  assert.equal(normalized.profile.onboarded, false);
  assert.equal(normalized.profile.name, "Local Job Hunter");
  assert.equal(normalized.profile.firstName, "");
  assert.equal(
    normalized.profile.headline,
    "Full-stack builder looking for high-impact teams",
  );
  assert.equal(normalized.profile.location, "United States");
  assert.deepEqual(normalized.profile.targetRoles, ["Product Engineer"]);
  assert.deepEqual(normalized.profile.skills, ["React"]);
  assert.equal(normalized.profile.resumeText, "");
  assert.equal(normalized.profile.additionalInfo, "");
  assert.deepEqual(normalized.profile.preferences.locations, ["Remote"]);
  assert.equal(normalized.profile.preferences.remote, true);
  assert.equal(normalized.profile.preferences.minSalary, 0);
  assert.equal(normalized.profile.preferences.weeklyApplicationGoal, 100);
  assert.equal(normalized.profile.preferences.atsThreshold, 0);
  assert.deepEqual(
    normalized.profile.faqAnswers.map(({ id, question, answer }) => ({
      id,
      question,
      answer,
    })),
    [
      {
        id: "duplicate-faq-id",
        question: "Valid restored question?",
        answer: "Valid restored answer",
      },
      {
        id: "duplicate-faq-id-2",
        question: "Second restored question?",
        answer: "Second restored answer",
      },
    ],
  );
  assert.deepEqual(
    normalized.profile.faqAnswers.find(
      (faq) => faq.question === "Valid restored question?",
    ),
    {
      id: "duplicate-faq-id",
      question: "Valid restored question?",
      answer: "Valid restored answer",
      questionType: "dropdown",
      options: ["Valid restored answer", "Another answer"],
      confident: true,
    },
    "authentic v2 FAQ export fields must survive local workspace restore",
  );
  assert.deepEqual(
    normalized.huntPresets.map(({ id, name }) => ({ id, name })),
    [
      { id: "duplicate-preset-id", name: "Hunt preset 1" },
      { id: "duplicate-preset-id-2", name: "Restored preset" },
    ],
  );
  assert.equal(normalized.profileAudits[0].input.profileUrl, "");
  assert.deepEqual(normalized.profileAudits[0].input.skills, ["React"]);
  assert.equal(normalized.profileAudits[0].total, 100);
  assert.equal(normalized.profileAudits[0].checks[0].section, "Section 1");
  assert.equal(normalized.profileAudits[0].checks[0].score, 0);
  assert.equal(normalized.profileAudits[0].checks[0].status, "improve");
  assert.deepEqual(normalized.profileAudits[0].matchedTerms, ["product"]);
  assert.deepEqual(normalized.profileAudits[0].suggestions, ["Add evidence"]);
  assert.deepEqual(
    normalized.agentRuns.map(({ id, runName }) => ({ id, runName })),
    [
      { id: "duplicate-run-id", runName: "Local hunt" },
      { id: "duplicate-run-id-2", runName: "Restored run" },
    ],
  );
  assert.equal(normalized.agentRuns[0].matches[0].company, "Unknown company");
  assert.equal(normalized.agentRuns[0].matches[0].url, "");
  assert.deepEqual(normalized.agentRuns[0].matches[0].reasons, [
    "Restored reason",
  ]);
  assert.deepEqual(normalized.infiniteHunt, {
    enabled: false,
    generation: null,
    intervalMinutes: 1440,
    options: {
      runName: "Software Engineer",
      origin: "infinite",
      q: "Software Engineer",
      location: "",
      minFit: 60,
      maxResults: 25,
      requiredKeywords: [],
      excludeKeywords: [],
      workflows: ["linkedin"],
      optimizeResume: false,
    },
    startedAt: null,
    nextRunAt: null,
    lastRunAt: null,
    lastError: "",
  });
  assert.deepEqual(
    normalized.activities.find(
      (activity) => activity.message === "Restored activity",
    ),
    {
      id: "duplicate-activity-id-2",
      at: "",
      type: "system",
      message: "Restored activity",
      data: { runId: "duplicate-run-id" },
    },
  );
  assert.equal(normalized.templates.length, 2);
  assert.equal(normalized.templates[0].name, "Resume Template 1");
  assert.deepEqual(normalized.templates[0].sections, [
    "Summary",
    "Skills",
    "Experience",
    "Education",
  ]);
  assert.equal(normalized.templates[1].name, "Legacy Design");
  assert.deepEqual(normalized.templates[1].sections, ["Summary", "Experience"]);
  assert.notEqual(normalized.templates[0].id, normalized.templates[1].id);
  assert.equal(normalized.resumes[0].name, "Resume 1");
  assert.equal(normalized.resumes[0].content, "");
  assert.equal(normalized.resumes[0].templateId, normalized.templates[0].id);
  assert.equal(normalized.resumes[1].name, "Imported Resume");
  assert.equal(normalized.resumes[1].content, "Preserved resume content");
  assert.notEqual(normalized.resumes[0].id, normalized.resumes[1].id);
  assert.equal(normalized.coverLetters[0].title, "Cover Letter 1");
  assert.equal(normalized.coverLetters[0].body, "");
  assert.equal(normalized.coverLetters[0].style, "professional");
  assert.equal(normalized.coverLetters[1].title, "Imported Letter");
  assert.equal(normalized.coverLetters[1].body, "Preserved letter body");
  assert.notEqual(normalized.coverLetters[0].id, normalized.coverLetters[1].id);
  assert.equal(normalized.jobs[0].company, "Company 1");
  assert.equal(normalized.jobs[0].title, "Job opportunity 1");
  assert.equal(normalized.jobs[0].location, "");
  assert.equal(normalized.jobs[0].url, "");
  assert.equal(normalized.jobs[0].source, "Manual");
  assert.equal(normalized.jobs[0].salary, "");
  assert.equal(normalized.jobs[0].description, "");
  assert.deepEqual(normalized.jobs[0].tags, []);
  assert.deepEqual(normalized.jobs[0].matchReasons, ["Strong role match"]);
  assert.equal(normalized.jobs[0].fitScore, 100);
  assert.equal(normalized.jobs[0].optimizedAtsScore, 0);
  assert.equal(normalized.jobs[0].numApplicants, 0);
  assert.equal(normalized.jobs[0].notes.length, 1);
  assert.equal(normalized.jobs[0].notes[0].text, "Preserved private note");
  assert.equal(normalized.jobs[0].tasks.length, 1);
  assert.equal(normalized.jobs[0].tasks[0].text, "Preserved follow-up task");
  assert.equal(normalized.jobs[0].tasks[0].due, "2030-04-05");
  assert.equal(normalized.jobs[0].tasks[0].done, false);
  assert.equal(normalized.jobs[0].contacts.length, 2);
  assert.equal(normalized.jobs[0].contacts[0].name, "Contact 1");
  assert.equal(normalized.jobs[0].contacts[0].role, "");
  assert.equal(normalized.jobs[0].contacts[0].email, "");
  assert.equal(normalized.jobs[0].contacts[0].linkedIn, "");
  assert.equal(normalized.jobs[0].contacts[1].name, "Alex Morgan");
  assert.equal(normalized.jobs[0].contacts[1].role, "Recruiter");
  assert.equal(normalized.jobs[0].contacts[1].email, "alex@example.com");
  assert.equal(
    normalized.jobs[0].contacts[1].linkedIn,
    "https://www.linkedin.com/in/alex",
  );
  assert.notEqual(
    normalized.jobs[0].contacts[0].id,
    normalized.jobs[0].contacts[1].id,
  );
  assert.equal(normalized.jobs[0].interviewRounds.length, 2);
  assert.equal(
    normalized.jobs[0].interviewRounds[0].roundType,
    "Interview Round 1",
  );
  assert.equal(normalized.jobs[0].interviewRounds[0].notes, "");
  assert.equal(normalized.jobs[0].interviewRounds[0].status, "scheduled");
  assert.equal(normalized.jobs[0].interviewRounds[0].outcome, "pending");
  assert.equal(
    normalized.jobs[0].interviewRounds[1].roundType,
    "Interview Round 2",
  );
  assert.equal(
    normalized.jobs[0].interviewRounds[1].notes,
    "Preserved round notes",
  );
  assert.notEqual(
    normalized.jobs[0].interviewRounds[0].id,
    normalized.jobs[0].interviewRounds[1].id,
  );
  assert.equal(normalized.jobs[0].status, "interested");
  assert.equal(normalized.jobs[0].statusHistory.length, 2);
  assert.equal(normalized.jobs[0].statusHistory[0].status, "interested");
  assert.equal(normalized.jobs[0].statusHistory[1].status, "interview");
  assert.equal(normalized.submissions[0].status, "submitted");
  assert.equal(normalized.submissions[0].checklist.length, 3);
  assert.equal(
    normalized.submissions[0].checklist.every((item) => item.done === false),
    true,
  );
  const unsafeDraft = normalized.submissions[1];
  assert.equal(unsafeDraft.status, "draft");
  assert.deepEqual(
    unsafeDraft.checklist.map(({ text, done }) => ({ text, done })),
    [
      { text: "Review resume alignment", done: true },
      { text: "Review cover letter", done: false },
      { text: "Confirm application details", done: false },
    ],
  );
  assert.equal(new Set(unsafeDraft.checklist.map((item) => item.id)).size, 3);
  assert.equal(unsafeDraft.applicationQuestions[0].questionType, "dropdown");
  assert.deepEqual(unsafeDraft.applicationQuestions[0].options, []);
  assert.equal(unsafeDraft.applicationQuestions[0].confident, false);
  assert.equal(unsafeDraft.applicationQuestions[0].verified, false);
  assert.equal(unsafeDraft.applicationQuestions[1].questionType, "text_input");
  assert.equal(unsafeDraft.applicationQuestions[1].answer, "Keep this answer");
  assert.equal(unsafeDraft.applicationQuestions[1].verified, true);
  assert.notEqual(
    unsafeDraft.applicationQuestions[0].id,
    unsafeDraft.applicationQuestions[1].id,
  );
  assert.equal(normalized.submissions[2].status, "archived");
  const unsafeSubmit = await req(`/api/submissions/${unsafeDraft.id}/submit`, {
    method: "POST",
    body: JSON.stringify({ confirmedByUser: true }),
  });
  assert.equal(unsafeSubmit.res.status, 409);
  assert.match(unsafeSubmit.body.error, /checklist/i);
  assert.equal(normalized.gigs[0].client, "Gig client 1");
  assert.equal(normalized.gigs[0].title, "Gig opportunity 1");
  assert.equal(normalized.gigs[0].source, "Manual");
  assert.equal(normalized.gigs[0].url, "");
  assert.equal(normalized.gigs[0].budget, 0);
  assert.equal(normalized.gigs[0].earned, 100000000);
  assert.equal(normalized.gigs[0].dueDate, "");
  assert.equal(normalized.gigs[0].description, "");
  assert.equal(normalized.gigs[0].proposal, "");
  assert.equal(normalized.gigs[0].status, "lead");
  assert.deepEqual(
    normalized.gigs[0].statusHistory.map((event) => event.status),
    ["lead"],
  );
  assert.equal(normalized.gigs[1].client, "Restored Client");
  assert.equal(normalized.gigs[1].title, "Restored Gig");
  assert.equal(normalized.gigs[1].source, "Partner Board");
  assert.equal(normalized.gigs[1].url, "https://gigs.example/restored");
  assert.equal(normalized.gigs[1].budget, 2500);
  assert.equal(normalized.gigs[1].earned, 500);
  assert.equal(normalized.gigs[1].dueDate, "2030-03-15");
  assert.equal(normalized.gigs[1].description, "Restored description");
  assert.equal(normalized.gigs[1].proposal, "Restored proposal");
  assert.equal(normalized.gigs[1].status, "in-progress");
  assert.deepEqual(
    normalized.gigs[1].statusHistory.map((event) => event.status),
    ["in-progress", "proposal"],
  );
  assert.notEqual(normalized.gigs[0].id, normalized.gigs[1].id);
  assert.equal(normalized.coachConversations.length, 2);
  assert.equal(
    normalized.coachConversations[0].title,
    "Career coaching session",
  );
  assert.deepEqual(normalized.coachConversations[0].messages, [
    { role: "user", content: "Preserved coaching question" },
    { role: "assistant", content: "Preserved coaching answer" },
  ]);
  assert.notEqual(
    normalized.coachConversations[0].id,
    normalized.coachConversations[1].id,
  );
  assert.equal(normalized.careerStories[0].title, "STAR Story 1");
  assert.equal(normalized.careerStories[0].action, "");
  assert.equal(
    normalized.careerStories[0].result,
    "Increased retention by 20%",
  );
  assert.deepEqual(normalized.careerStories[0].skills, ["React"]);
  assert.equal(normalized.careerStories[1].title, "Preserved STAR story");
  assert.notEqual(
    normalized.careerStories[0].id,
    normalized.careerStories[1].id,
  );
  assert.equal(normalized.coachingSessions[0].status, "in-progress");
  assert.deepEqual(normalized.coachingSessions[0].questions, [
    "Valid question?",
  ]);
  assert.deepEqual(normalized.coachingSessions[0].answers, {
    "Valid question?": "Preserved practice answer",
  });
  assert.deepEqual(normalized.coachingSessions[0].matchedStoryIds, [
    "duplicate-story-id",
  ]);
  assert.deepEqual(normalized.coachingSessions[0].talkingPoints, [
    "Use specific evidence",
  ]);
  assert.deepEqual(normalized.coachingSessions[0].companyResearch, [
    "Read the product page",
  ]);
  assert.deepEqual(normalized.coachingSessions[0].researchDone, [
    "Read the product page",
  ]);
  assert.equal(normalized.coachingSessions[0].notes, "");
  assert.equal(normalized.outreachDrafts[0].recipient, "Hiring team");
  assert.equal(normalized.outreachDrafts[0].contactRole, "");
  assert.equal(normalized.outreachDrafts[0].contactEmail, "");
  assert.equal(normalized.outreachDrafts[0].category, "peer");
  assert.equal(
    normalized.outreachDrafts[0].connectionDegree,
    "Company contact",
  );
  assert.equal(normalized.outreachDrafts[0].channel, "linkedin");
  assert.equal(normalized.outreachDrafts[0].subject, "Outreach draft 1");
  assert.equal(normalized.outreachDrafts[0].body, "");
  assert.equal(normalized.outreachDrafts[0].status, "draft");
  assert.equal(normalized.outreachDrafts[1].recipient, "Alex Morgan");
  assert.equal(normalized.outreachDrafts[1].contactRole, "Recruiter");
  assert.equal(normalized.outreachDrafts[1].contactEmail, "alex@example.com");
  assert.equal(normalized.outreachDrafts[1].category, "recruiter");
  assert.equal(normalized.outreachDrafts[1].connectionDegree, "Known contact");
  assert.equal(normalized.outreachDrafts[1].channel, "email");
  assert.equal(
    normalized.outreachDrafts[1].subject,
    "Preserved outreach subject",
  );
  assert.equal(normalized.outreachDrafts[1].body, "Preserved outreach body");
  assert.equal(normalized.outreachDrafts[1].status, "replied");
  assert.notEqual(
    normalized.outreachDrafts[0].id,
    normalized.outreachDrafts[1].id,
  );
  assert.equal(normalized.meta.version, 11);

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

  const partialRestore = await req("/api/import", {
    method: "POST",
    body: JSON.stringify({
      jobs: [
        {
          id: "restored-only-job",
          company: "Restored Company",
          title: "Restored Role",
          status: "saved",
        },
      ],
    }),
  });
  assert.equal(partialRestore.res.status, 200);
  const replaced = (await req("/api/state")).body;
  assert.deepEqual(
    replaced.jobs.map((job) => job.id),
    ["restored-only-job"],
  );
  assert.equal(
    replaced.jobs[0].status,
    "interested",
    "legacy saved jobs must migrate into the visible v2 Queued column",
  );
  assert.equal(
    replaced.jobs[0].statusHistory[0].status,
    "interested",
    "generated migration history must use a current v2 tracker status",
  );
  for (const collection of [
    "resumes",
    "coverLetters",
    "submissions",
    "coachConversations",
    "coachingSessions",
    "outreachDrafts",
    "huntPresets",
    "careerStories",
    "profileAudits",
    "gigs",
    "agentRuns",
  ])
    assert.deepEqual(
      replaced[collection],
      [],
      `a replacement restore retained private ${collection} omitted by the backup`,
    );
  assert.equal(replaced.profile.onboarded, false);
  assert.equal(replaced.infiniteHunt.enabled, false);

  const authenticV2ProfileRestore = await req("/api/import", {
    method: "POST",
    body: JSON.stringify({
      jobs: [],
      profile: {
        first_name: "Ada",
        last_name: "Lovelace",
        resume_text: "Built the first published algorithm.",
        additional_info: "Prefers analytical engineering roles.",
        faq_answers: [
          {
            question_text: "Are you authorized to work?",
            answer: "Yes",
            question_type: "multiple_choice",
            options: ["Yes", "No"],
            confident: true,
          },
        ],
        preferences: { ats_threshold: 87 },
      },
    }),
  });
  assert.equal(authenticV2ProfileRestore.res.status, 200);
  const authenticV2Profile = (await req("/api/state")).body.profile;
  assert.equal(authenticV2Profile.firstName, "Ada");
  assert.equal(authenticV2Profile.lastName, "Lovelace");
  assert.equal(
    authenticV2Profile.resumeText,
    "Built the first published algorithm.",
  );
  assert.equal(
    authenticV2Profile.additionalInfo,
    "Prefers analytical engineering roles.",
  );
  assert.equal(authenticV2Profile.preferences.atsThreshold, 87);
  assert.deepEqual(authenticV2Profile.faqAnswers[0], {
    id: "faq-1",
    question: "Are you authorized to work?",
    answer: "Yes",
    questionType: "multiple_choice",
    options: ["Yes", "No"],
    confident: true,
  });
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
      jobDescription:
        "Frontend engineer role requiring React and accessible delivery.",
    }),
  });
  assert.equal(created.res.status, 201);
  assert.equal(created.body.name, "Technical Leadership");
  assert.equal(created.body.editedResume, "Edited resume content");
  assert.equal(created.body.additionalExperience, "Mentored five engineers.");
  assert.match(created.body.jobDescription, /accessible delivery/);
  const oversizedExperience = await req("/api/templates", {
    method: "POST",
    body: JSON.stringify({
      name: "Invalid oversized experience",
      additionalExperience: "x".repeat(2001),
    }),
  });
  assert.equal(
    oversizedExperience.res.status,
    400,
    "the API must enforce v2's additional-experience boundary",
  );
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
