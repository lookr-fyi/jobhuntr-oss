import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";

const chromeCandidates = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);

const findChrome = async () => {
  for (const candidate of chromeCandidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {}
  }
  assert.fail(
    `Chrome was not found. Set CHROME_PATH. Checked: ${chromeCandidates.join(", ")}`,
  );
};

const freePort = () =>
  new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

const waitForHealth = async (url, output) => {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert.fail(`JobHuntr did not become healthy:\n${output()}`);
};

const assertAccessible = async (page, surface) => {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  const serious = results.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact),
  );
  assert.deepEqual(
    serious.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target.join(" ")),
      details: violation.nodes.map((node) => node.failureSummary),
    })),
    [],
    `${surface} should have no serious WCAG A/AA violations`,
  );
};

test(
  "a user can onboard, hunt, inspect runs, and persist outreach through the real UI",
  { timeout: 75_000 },
  async () => {
    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "jobhuntr-e2e-"));
    let logs = "";
    const server = spawn(process.execPath, ["server/index.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: String(port),
        HOST: "127.0.0.1",
        JOBHUNTR_DATA_DIR: dataDir,
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    server.stdout.on("data", (chunk) => (logs += chunk));
    server.stderr.on("data", (chunk) => (logs += chunk));

    let browser;
    try {
      await waitForHealth(baseUrl, () => logs);
      const chromePath = await findChrome();
      browser = await chromium.launch({
        executablePath: chromePath,
        headless: true,
      });
      const recoveryContext = await browser.newContext({
        viewport: { width: 1024, height: 760 },
      });
      const recoveryPage = await recoveryContext.newPage();
      let blockInitialState = true;
      await recoveryPage.route("**/api/state", async (route) => {
        if (blockInitialState) await route.abort("failed");
        else await route.continue();
      });
      await recoveryPage.goto(baseUrl);
      await recoveryPage
        .getByRole("heading", {
          name: "JobHuntr couldn't open your workspace",
        })
        .waitFor();
      await assertAccessible(recoveryPage, "Startup recovery");
      blockInitialState = false;
      await recoveryPage
        .getByRole("button", { name: "Retry opening JobHuntr" })
        .click();
      await recoveryPage
        .getByRole("button", { name: "Use demo profile" })
        .waitFor();
      await recoveryContext.close();

      const desktopContext = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        permissions: ["clipboard-read", "clipboard-write"],
      });
      const page = await desktopContext.newPage();
      await page.goto(baseUrl);

      assert.match(
        await page.locator('meta[name="description"]').getAttribute("content"),
        /private, local-first desktop workspace/,
      );
      const robots = await (
        await page.request.get(`${baseUrl}/robots.txt`)
      ).text();
      assert.match(robots, /Disallow: \/$/m);
      const llms = await (await page.request.get(`${baseUrl}/llms.txt`)).text();
      assert.match(llms, /^# JobHuntr/m);
      const onboardingProgress = page.getByRole("progressbar", {
        name: "Setup step 1 of 3",
      });
      await onboardingProgress.waitFor();
      assert.equal(await onboardingProgress.getAttribute("aria-valuenow"), "1");

      assert.equal(
        await page.locator("main").getAttribute("aria-hidden"),
        "true",
        "the workspace behind onboarding must be hidden from assistive technology",
      );
      assert.equal(
        await page.locator("aside.v2-sidebar").getAttribute("inert"),
        "",
        "background navigation must be inert during onboarding",
      );

      await page.getByRole("button", { name: "Use demo profile" }).click();
      await page
        .getByRole("button", { name: "Use demo profile" })
        .waitFor({ state: "hidden" });
      assert.equal(
        await page.locator("main").getAttribute("aria-hidden"),
        null,
      );
      await page.getByRole("heading", { name: /Welcome back/ }).waitFor();
      await page
        .getByRole("heading", { name: /Top Contributors of/ })
        .waitFor();
      await page.getByText(/jobs? contributed/).waitFor();
      await page.getByText(/sent today/).waitFor();
      await page.getByText("From your first signup to today.").waitFor();
      await page.waitForFunction(
        () =>
          (document.querySelector(".v2-momentum b")?.textContent?.trim()
            .length || 0) > 20,
      );
      const initialMotivation = await page
        .locator(".v2-momentum b")
        .innerText();
      const navigationIconBounds = await page
        .locator(".v2-nav button > svg")
        .evaluateAll((icons) =>
          icons.map((icon) => {
            const box = icon.getBoundingClientRect();
            return { left: box.left, right: box.right };
          }),
        );
      assert.ok(
        navigationIconBounds.every(
          ({ left, right }) => left >= 0 && right <= 64,
        ),
        "collapsed desktop navigation icons should remain inside the sidebar",
      );
      assert.equal(
        await page
          .locator('.v2-nav button[title="Agent Runs"] svg')
          .getAttribute("width"),
        "14",
        "sidebar icons should use the compact v2 navigation scale",
      );
      await page.locator(".v2-sidebar").hover({ position: { x: 30, y: 100 } });
      await page.waitForTimeout(200);
      const expandedNavigationBox = await page
        .locator(".v2-sidebar")
        .boundingBox();
      assert.ok(
        expandedNavigationBox?.width >= 275,
        "desktop navigation should expand to the v2 width on hover",
      );
      const overviewLabelBox = await page
        .locator('.v2-nav button[title="Overview"] span')
        .boundingBox();
      assert.ok(
        overviewLabelBox &&
          overviewLabelBox.x + overviewLabelBox.width <=
            expandedNavigationBox.x + expandedNavigationBox.width,
        "expanded navigation labels should not clip outside the sidebar",
      );
      const guidance = page.getByRole("button", { name: /Getting Started/ });
      const firstGuidanceTask = page
        .locator(".v2-guidance-list button")
        .filter({ hasText: "Start Infinite Hunt" });
      await guidance.waitFor();
      await firstGuidanceTask.waitFor();
      assert.match(
        await guidance.innerText(),
        /\d\/6 completed/,
        "expanded v2 navigation should show live setup progress",
      );
      await guidance.click();
      await firstGuidanceTask.waitFor({ state: "hidden" });
      await guidance.click();
      await page.locator("main").hover({ position: { x: 400, y: 200 } });
      await assertAccessible(page, "Overview");
      await page.getByLabel("Applications evaluated").uncheck();
      assert.equal(
        await page.locator(".v2-chart .line.evaluated").count(),
        0,
        "overview chart series controls should hide a line",
      );
      await page.getByLabel("Jobs queued+").uncheck();
      await page.getByText("No lines selected.").waitFor();
      await page.getByLabel("Applications evaluated").check();
      await page.getByLabel("Jobs queued+").check();
      await page.locator(".v2-chart").hover({ position: { x: 320, y: 120 } });
      await page
        .getByRole("status")
        .filter({ hasText: /Jobs queued/ })
        .waitFor();
      await Promise.all([
        page.waitForResponse(
          (response) => response.url().endsWith("/api/state") && response.ok(),
        ),
        page.getByRole("button", { name: "Refresh" }).click(),
      ]);
      await page.waitForFunction((previous) => {
        const text = document
          .querySelector(".v2-momentum b")
          ?.textContent?.trim();
        return Boolean(text && text.length > 20 && text !== previous);
      }, initialMotivation);
      await page.getByRole("button", { name: /I got an offer/ }).click();
      await page.getByRole("dialog", { name: "Congrats!" }).waitFor();
      await page.keyboard.press("Escape");
      await page.getByRole("dialog", { name: "Congrats!" }).waitFor({
        state: "hidden",
      });

      await page.getByRole("button", { name: "ATS Resume" }).click();
      await page
        .getByText("Generate a resume manually", { exact: true })
        .click();
      const initialResume = page.getByLabel("Resume content");
      await initialResume.waitFor();
      assert.equal(
        await page.getByRole("button", { name: "Save version" }).isDisabled(),
        true,
      );
      await initialResume.fill(
        "Senior product engineer with eight years of experience. Increased conversion by 42% using React, TypeScript, Python, and customer research.",
      );
      await page.getByLabel("Resume version name").fill("Profile baseline");
      await page.getByRole("button", { name: "Save version" }).click();
      await page
        .getByText("Profile baseline", { exact: true })
        .first()
        .waitFor();

      await page
        .getByRole("button", { name: "Infinite Hunting", exact: true })
        .click();
      await page.getByRole("heading", { name: "Infinite Hunting" }).waitFor();
      await assertAccessible(page, "Infinite Hunting");
      await page
        .getByLabel("Generate an optimized resume for each job")
        .check();
      await page.getByRole("button", { name: "Move Indeed up" }).click();
      await page.route("**/api/agent-runs/preview", (route) => route.abort());
      await page.getByRole("button", { name: "Preview matches" }).click();
      const apiError = page.getByRole("alert");
      await apiError.getByText("Something went wrong").waitFor();
      await apiError.getByRole("button", { name: "Dismiss error" }).click();
      await page.unroute("**/api/agent-runs/preview");
      await page.route("**/api/agent-runs/preview", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        await route.continue();
      });
      await page.getByRole("button", { name: "Preview matches" }).click();
      await page.getByRole("button", { name: "Previewing matches…" }).waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Previewing matches…" })
          .isDisabled(),
        true,
        "match preview should prevent duplicate submissions while pending",
      );
      await page.getByText(/eligible matches/).waitFor();
      await page.unroute("**/api/agent-runs/preview");
      await page.getByRole("button", { name: "Start infinite hunt" }).click();
      await page.getByText(/eligible matches/).waitFor();
      await page
        .getByText("Infinite Hunt is active every 60 minutes.")
        .waitFor();
      await page.getByRole("heading", { name: "Run history" }).waitFor();
      await page
        .getByRole("button", { name: "View last infinite session" })
        .click();
      const sessionDialog = page.getByRole("dialog", {
        name: "Latest infinite session",
      });
      await sessionDialog.waitFor();
      await sessionDialog.getByText("Inspected", { exact: true }).waitFor();
      await sessionDialog.getByText("Matched", { exact: true }).waitFor();
      await sessionDialog.getByText("Saved", { exact: true }).waitFor();
      await page.keyboard.press("Escape");
      await sessionDialog.waitFor({ state: "hidden" });
      await page.getByRole("button", { name: "Stop Infinite Hunt" }).click();
      await page
        .getByText("Infinite Hunt is active every 60 minutes.")
        .waitFor({ state: "hidden" });

      await page.getByRole("button", { name: "Agent Runs" }).click();
      await page.getByRole("heading", { name: "Agent Runs" }).waitFor();
      await page
        .locator(".v2-run-row", { hasText: "Search" })
        .first()
        .waitFor();
      const manualOnly = page.getByRole("switch", { name: "Manual Only" });
      await manualOnly.click();
      assert.equal(await page.locator(".v2-run-row").count(), 0);
      await manualOnly.click();
      assert.equal(await page.locator(".v2-run-row").count(), 1);
      await page.getByText("Action required", { exact: true }).waitFor();
      await page.getByLabel("Action required only").check();
      assert.equal(await page.locator(".v2-run-row").count(), 1);
      await page.getByLabel("Action required only").uncheck();
      await page.getByLabel("Search runs").fill("Software Engineer");
      assert.equal(await page.locator(".v2-run-row").count(), 1);
      const runTrigger = page.getByRole("button", {
        name: "Software Engineer",
        exact: true,
      });
      await runTrigger.click();
      const runDialog = page.getByRole("dialog", {
        name: "Software Engineer",
      });
      await runDialog.waitFor();
      assert.equal(
        await runDialog
          .getByRole("button", { name: "Close", exact: true })
          .evaluate((button) => button === document.activeElement),
        true,
        "run details should focus its close action",
      );
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      assert.equal(
        await runDialog
          .getByRole("button", { name: "Close run details" })
          .evaluate((button) => button === document.activeElement),
        true,
        "Tab should wrap within run details",
      );
      await runDialog.getByText("Workflow progress").waitFor();
      await runDialog.getByText("Matched jobs").waitFor();
      await page.keyboard.press("Escape");
      await runDialog.waitFor({ state: "hidden" });
      assert.equal(
        await runTrigger.evaluate(
          (button) => button === document.activeElement,
        ),
        true,
        "run details should restore focus to the selected run",
      );
      const runState = await (
        await page.request.get(`${baseUrl}/api/state`)
      ).json();
      const linkedRunId = runState.agentRuns[0].id;
      await page.goto(`${baseUrl}/#/runs?run=${linkedRunId}`);
      const linkedRunDialog = page.getByRole("dialog", {
        name: "Software Engineer",
      });
      await linkedRunDialog.waitFor();
      await page.reload();
      await linkedRunDialog.waitFor();
      assert.match(page.url(), new RegExp(`run=${linkedRunId}`));
      await linkedRunDialog
        .getByRole("button", { name: "Close", exact: true })
        .click();
      await linkedRunDialog.waitFor({ state: "hidden" });
      assert.match(page.url(), /#\/runs$/);
      await page.getByRole("button", { name: "New Run" }).click();
      const newRunDialog = page.getByRole("dialog", {
        name: "Create New Agent Run",
      });
      await newRunDialog.waitFor();
      await newRunDialog
        .getByRole("radio", { name: /Glassdoor Auto Search/ })
        .click();
      await newRunDialog.getByLabel("Run Name").fill("Frontend Engineer");
      await newRunDialog.getByLabel("Generate ATS-optimized resumes").check();
      await newRunDialog.getByRole("button", { name: "Cancel" }).click();
      await newRunDialog.waitFor({ state: "hidden" });
      await page.getByRole("button", { name: "New Run" }).click();
      await newRunDialog
        .getByRole("radio", { name: /Dice Auto Search/ })
        .click();
      assert.equal(
        await newRunDialog
          .getByRole("radio", { name: /Dice Auto Search/ })
          .getAttribute("aria-checked"),
        "true",
      );
      await newRunDialog
        .getByRole("radio", { name: /Company Website Search/ })
        .click();
      await newRunDialog.getByLabel("Run Name").fill("Platform Engineer");
      await newRunDialog.getByLabel("Generate ATS-optimized resumes").check();
      await newRunDialog.getByRole("button", { name: "Create" }).click();
      await page.getByRole("heading", { name: "Infinite Hunting" }).waitFor();
      await page
        .locator(".v2-loop-row", { hasText: "Company Career Page Search" })
        .waitFor();
      assert.equal(
        await page
          .getByLabel("Generate an optimized resume for each job")
          .isChecked(),
        true,
      );
      await page.getByRole("button", { name: "Agent Runs" }).click();
      await page.getByRole("heading", { name: "Agent Runs" }).waitFor();
      await assertAccessible(page, "Agent Runs");
      const huntStatus = page.getByRole("button", {
        name: "Open Infinite Hunting status",
      });
      await huntStatus.hover();
      const huntPopover = page.getByRole("status").filter({
        hasText: "Infinite Hunt",
      });
      await huntPopover.getByText("Inspected", { exact: true }).waitFor();
      await huntPopover.getByText("Matched", { exact: true }).waitFor();
      await huntPopover.getByText("Saved", { exact: true }).waitFor();
      await huntStatus.click();
      await page.getByRole("heading", { name: "Infinite Hunting" }).waitFor();

      await page.getByRole("button", { name: "Job Board" }).click();
      await page.getByRole("heading", { name: "Today's Picks" }).waitFor();
      await page.getByRole("button", { name: "Leaderboard" }).click();
      const leaderboardDialog = page.getByRole("dialog", {
        name: /Top Contributors of/,
      });
      await leaderboardDialog.waitFor();
      await leaderboardDialog
        .getByText(/No community identities or account data/)
        .waitFor();
      await page.keyboard.press("Escape");
      await leaderboardDialog.waitFor({ state: "hidden" });
      await page.getByRole("button", { name: "Filters" }).click();
      await page.getByLabel("Location").fill("Remote");
      await page.getByLabel("Minimum match").selectOption("25");
      await page.getByLabel("Minimum board salary").selectOption("120000");
      await page.getByLabel("Board work arrangement").selectOption("remote");
      await page.getByLabel("Board job type").selectOption("full-time");
      await page.getByLabel("Board seniority").selectOption("lead");
      await page.getByLabel("Board visa sponsorship").selectOption("unknown");
      await page.getByLabel("Board source").selectOption("Seed Board");
      await page.getByLabel("Sort by").selectOption("salary");
      await page
        .getByRole("button", { name: /Filters/ })
        .getByText("8")
        .waitFor();
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/board/search") &&
            response.request().method() === "POST" &&
            response.ok(),
        ),
        page.getByRole("button", { name: "Apply filters" }).click(),
      ]);
      await page.getByText(/opportunities$/).waitFor();
      await page.getByRole("link", { name: /View original post/ }).waitFor();
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/board/search") &&
            response.request().method() === "POST" &&
            response.ok(),
        ),
        page.getByRole("button", { name: "Clear all" }).click(),
      ]);
      await page.getByText("4 opportunities").waitFor();
      await page.getByRole("button", { name: "Saved" }).first().waitFor();
      await page
        .getByRole("button", { name: /Frontend Platform Engineer/ })
        .click();
      const boardDetail = page.locator(".v2-board-detail");
      await boardDetail.getByText("Full-time", { exact: true }).waitFor();
      await boardDetail.getByText("Mid level", { exact: true }).waitFor();
      await boardDetail.getByText("74 applicants", { exact: true }).waitFor();
      await boardDetail.getByText("Contributed by", { exact: true }).waitFor();
      await boardDetail.getByText("Seed Board", { exact: true }).waitFor();
      await boardDetail
        .getByText("Visa status not specified", { exact: true })
        .waitFor();
      await page
        .getByRole("heading", { name: "Frontend Platform Engineer" })
        .waitFor();
      assert.match(
        page.url(),
        /job=https%3A%2F%2Fexample.com%2Fnorthstar-frontend/,
      );
      await page.reload();
      await page
        .getByRole("heading", { name: "Frontend Platform Engineer" })
        .waitFor();
      await assertAccessible(page, "Job Board");

      await page.getByRole("button", { name: "ATS Resume" }).click();
      await page
        .getByRole("heading", { name: "ATS Resume Templates" })
        .waitFor();
      await page.getByRole("button", { name: "Create New Template" }).click();
      const templateDialog = page.getByRole("dialog", {
        name: "Create New Template",
      });
      await templateDialog.getByLabel("Template name").fill("E2E Leadership");
      await templateDialog
        .getByLabel("Upload resume for ATS template")
        .setInputFiles({
          name: "e2e-resume.txt",
          mimeType: "text/plain",
          buffer: Buffer.from(
            "Product engineer with React, TypeScript, leadership, and 40% performance gains.",
          ),
        });
      await templateDialog.getByText(/Resume uploaded successfully/).waitFor();
      await templateDialog.getByRole("button", { name: /Next/ }).click();
      await templateDialog.getByText("Edit your cloned resume").waitFor();
      await templateDialog
        .getByLabel("Cloned resume content")
        .fill(
          "Product engineer who led React delivery and improved performance 40%.",
        );
      await templateDialog.getByRole("button", { name: /Next/ }).click();
      await templateDialog.getByText("Add Additional Experience").waitFor();
      await templateDialog
        .getByLabel("Additional experience and skills")
        .fill("Mentored five engineers and led accessibility delivery.");
      await templateDialog.getByRole("button", { name: /Next/ }).click();
      await templateDialog.getByText("Test your ATS template").waitFor();
      await templateDialog
        .getByLabel("ATS template test job")
        .selectOption({ index: 1 });
      await templateDialog
        .getByRole("button", { name: /Run ATS Test/ })
        .click();
      await templateDialog.getByText("ATS Optimization Complete").waitFor();
      await templateDialog.getByText("ATS match score").waitFor();
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/templates") &&
            response.request().method() === "POST" &&
            response.ok(),
        ),
        templateDialog.getByRole("button", { name: "Save Template" }).click(),
      ]);
      await page
        .locator(".v2-resume-templates")
        .getByText("E2E Leadership", { exact: true })
        .waitFor();
      await page
        .locator(".v2-resume-templates")
        .getByText("+ Additional Experience", { exact: true })
        .waitFor();
      await page.getByLabel("Actions for E2E Leadership").click();
      await page.getByRole("button", { name: "Edit Template" }).click();
      const editTemplateDialog = page.getByRole("dialog", {
        name: "Edit Template",
      });
      await editTemplateDialog.waitFor();
      await page.getByLabel("Close template editor").click();
      await editTemplateDialog.waitFor({ state: "hidden" });
      await page.getByLabel("Search resume templates").fill("E2E Leadership");
      assert.equal(
        await page
          .locator(".v2-resume-templates")
          .getByText("Clean ATS", { exact: true })
          .count(),
        0,
        "template search should filter unrelated templates",
      );
      await page.getByLabel("Search resume templates").fill("");
      await page.getByRole("button", { name: /Modified/ }).click();
      assert.equal(
        await page
          .getByRole("button", { name: /Modified/ })
          .getAttribute("aria-pressed"),
        "true",
      );
      await Promise.all([
        page.waitForResponse(
          (response) => response.url().endsWith("/api/state") && response.ok(),
        ),
        page
          .getByRole("button", { name: "Refresh", exact: true })
          .first()
          .click(),
      ]);
      assert.equal(
        await page.getByLabel("Resume version name").isVisible(),
        false,
        "manual resume generation should not displace the default v2 library/history layout",
      );
      await page
        .getByText("Generate a resume manually", { exact: true })
        .click();
      await page.getByLabel("Resume version name").fill("E2E tailored resume");
      await page
        .getByLabel("Resume content")
        .fill(
          "Senior product engineer. Increased conversion by 42%. React, TypeScript, and Python.",
        );
      await page.getByRole("button", { name: "Analyze ATS fit" }).click();
      await page.locator(".score", { hasText: "ATS alignment" }).waitFor();
      await page.getByRole("button", { name: "Save version" }).click();
      await page.getByText("E2E tailored resume").first().waitFor();
      await page
        .getByLabel("Filter resume history by template")
        .selectOption({ label: "E2E Leadership" });
      await page
        .locator(".v2-resume-groups")
        .getByText("E2E tailored resume", { exact: true })
        .waitFor();
      await page
        .locator(".v2-resume-groups")
        .getByRole("link", { name: "View job post" })
        .waitFor();
      await page.getByLabel("Delete E2E tailored resume").click();
      const deleteResumeDialog = page.getByRole("alertdialog", {
        name: "Delete resume version?",
      });
      await deleteResumeDialog.waitFor();
      await assertAccessible(page, "Delete resume version confirmation");
      await deleteResumeDialog.getByRole("button", { name: "Cancel" }).click();
      await deleteResumeDialog.waitFor({ state: "hidden" });
      await page.getByLabel("Search resume history").fill("no such resume");
      await page
        .getByText("No generated resumes yet.", { exact: true })
        .waitFor();
      await page.getByLabel("Search resume history").fill("");
      await assertAccessible(page, "ATS Resume");

      await page.locator('button[title="Submission Queue"]').click();
      await page
        .locator(".v2-ats-recommendation")
        .filter({ hasText: /ATS resume generated|Original resume meets/ })
        .first()
        .waitFor();
      await page.getByText("Application documents", { exact: true }).waitFor();
      await page.getByText("Job description", { exact: true }).waitFor();
      await page.getByRole("link", { name: /Apply manually/ }).waitFor();
      const queueState = await (
        await page.request.get(`${baseUrl}/api/state`)
      ).json();
      const linkedPacketId = queueState.submissions.find((submission) =>
        ["draft", "ready"].includes(submission.status),
      ).id;
      await page.goto(`${baseUrl}/#/queue?packet=${linkedPacketId}`);
      await page.getByText("Application documents", { exact: true }).waitFor();
      await page.reload();
      await page.getByText("Application documents", { exact: true }).waitFor();
      assert.match(page.url(), new RegExp(`packet=${linkedPacketId}`));
      const interestAnswer = page.getByLabel(
        "Why are you interested in this role?",
      );
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes("/api/submissions/") &&
            response.request().method() === "PATCH" &&
            response.ok(),
        ),
        page
          .getByLabel("When are you available to start?")
          .selectOption("Within 2 weeks"),
      ]);
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes("/api/submissions/") &&
            response.request().method() === "PATCH" &&
            response.ok(),
        ),
        page
          .locator(".v2-application-questions")
          .getByRole("radio", { name: "No", exact: true })
          .click(),
      ]);
      await interestAnswer.fill("The product mission matches my experience.");
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes("/api/submissions/") &&
            response.request().method() === "PATCH" &&
            response.ok(),
        ),
        page.getByRole("button", { name: "Filters" }).click(),
      ]);
      await page.getByText("3/4 answered").waitFor();
      await page.getByLabel("Show jobs with ATS resume").selectOption("true");
      await page.getByLabel("Queue job type").selectOption("full-time");
      await page.getByLabel("Queue visa sponsorship").selectOption("unknown");
      await page
        .locator(".v2-ats-recommendation", { hasText: "ATS resume generated" })
        .first()
        .waitFor();
      await page.getByLabel("Sort submission queue").selectOption("ats");
      await page.getByLabel("Show jobs with ATS resume").selectOption("false");
      await page.getByRole("button", { name: "Clear filters" }).click();
      await page.getByRole("button", { name: "Archive filtered" }).click();
      const archiveQueueDialog = page.getByRole("alertdialog", {
        name: "Archive filtered queue jobs?",
      });
      await archiveQueueDialog.waitFor();
      await archiveQueueDialog.getByRole("button", { name: "Cancel" }).click();
      await page.getByRole("tab", { name: /From Search Runs/ }).click();
      assert.match(page.url(), /tab=search/);
      await page.reload();
      assert.equal(
        await page
          .getByRole("tab", { name: /From Search Runs/ })
          .getAttribute("aria-selected"),
        "true",
      );
      await page.getByRole("button", { name: "Prepare application" }).click();
      const checklist = page.locator(".packet input[type=checkbox]");
      await checklist.first().waitFor();
      await assertAccessible(page, "Submission Queue");
      const checklistCount = await checklist.count();
      assert.ok(checklistCount > 0, "submission checklist should be visible");
      const resumeAttachment = page.getByLabel("Resume attachment");
      await resumeAttachment.waitFor();
      assert.ok(
        await resumeAttachment.inputValue(),
        "queue preparation should retain a valid resume attachment",
      );
      await page.getByText("Resume ready for review").waitFor();
      await page.getByText("Queued", { exact: true }).first().waitFor();
      await page
        .getByText(/^Queued (just now|\d+ min)/)
        .first()
        .waitFor();
      await page.getByLabel("Cover letter attachment").waitFor();
      await page.getByRole("button", { name: "Filters" }).click();
      await page.getByLabel("Minimum queue match score").selectOption("40");
      await page.getByLabel("Sort submission queue").selectOption("fit");
      const queueQuestions = page.locator(".v2-application-questions");
      const whyAnswer = queueQuestions.getByLabel(
        /Why are you interested in this role/,
      );
      await whyAnswer.fill("The product mission matches my experience.");
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes("/api/submissions/") &&
            response.request().method() === "PATCH" &&
            response.ok(),
        ),
        whyAnswer.press("Tab"),
      ]);
      const salaryAnswer = queueQuestions.getByLabel(
        /What are your salary expectations/,
      );
      await salaryAnswer.fill(
        "$150,000 base, depending on the complete compensation package.",
      );
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes("/api/submissions/") &&
            response.request().method() === "PATCH" &&
            response.ok(),
        ),
        salaryAnswer.press("Tab"),
      ]);
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes("/api/submissions/") &&
            response.request().method() === "PATCH" &&
            response.ok(),
        ),
        queueQuestions
          .getByLabel(/When are you available to start/)
          .selectOption("Within 2 weeks"),
      ]);
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes("/api/submissions/") &&
            response.request().method() === "PATCH" &&
            response.ok(),
        ),
        queueQuestions.getByLabel("No", { exact: true }).click(),
      ]);
      await page.getByText(/4\/4 answered/).waitFor();
      for (const question of [
        "Why are you interested in this role?",
        "What are your salary expectations?",
        "When are you available to start?",
        "Will you require work authorization sponsorship?",
      ]) {
        const verification = queueQuestions
          .locator(".v2-question-card")
          .filter({ hasText: question })
          .getByRole("checkbox");
        await Promise.all([
          page.waitForResponse(
            (response) =>
              response.url().includes("/api/submissions/") &&
              response.request().method() === "PATCH" &&
              response.ok(),
          ),
          verification.click(),
        ]);
      }
      await page.getByText(/4\/4 verified/).waitFor();
      for (const item of [
        "Review resume alignment",
        "Review cover letter",
        "Confirm application details",
      ]) {
        const checkbox = page.getByLabel(item);
        if (await checkbox.isChecked()) continue;
        await Promise.all([
          page.waitForResponse(
            (response) =>
              response.url().includes("/api/submissions/") &&
              response.request().method() === "PATCH" &&
              response.ok(),
          ),
          checkbox.click(),
        ]);
      }
      const directSubmitButton = page.getByRole("button", {
        name: "I submitted this externally",
      });
      assert.equal(await directSubmitButton.isDisabled(), true);
      const externalProof = page.getByLabel(
        /I personally checked the employer's confirmation page/,
      );
      await externalProof.check();
      assert.equal(await directSubmitButton.isEnabled(), true);
      await externalProof.uncheck();
      await page.getByRole("button", { name: "Start Submitting" }).click();
      const submitDialog = page.getByRole("dialog", {
        name: "Start submitting",
      });
      await submitDialog.waitFor();
      await submitDialog
        .getByRole("link", { name: "Open application form" })
        .waitFor();
      assert.equal(
        await submitDialog
          .getByRole("button", { name: "Record submitted" })
          .isDisabled(),
        true,
        "submission recording must fail closed until the user confirms external success",
      );
      await submitDialog
        .getByLabel(
          /I personally verified that the external application was submitted/i,
        )
        .check();
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().endsWith("/submit") &&
            response.request().method() === "POST" &&
            response.ok(),
        ),
        submitDialog.getByRole("button", { name: "Record submitted" }).click(),
      ]);
      await page.getByRole("heading", { name: "Submission Queue" }).waitFor();
      await page.getByRole("button", { name: "About Me" }).click();
      await page
        .getByRole("heading", {
          name: "Teach JobHuntr how to speak on your behalf",
        })
        .waitFor();

      await page.getByRole("button", { name: "Cover Letter" }).click();
      await page.getByRole("button", { name: "Create Cover Letter" }).click();
      await page.getByRole("heading", { name: "Choose a Template" }).waitFor();
      await assertAccessible(page, "Cover Letter wizard");
      await page.getByRole("button", { name: "Select Modern" }).click();
      await page.getByRole("button", { name: "Continue" }).click();
      assert.equal(new URL(page.url()).hash, "#/cover-letter?step=2");
      await page
        .getByLabel("Template content")
        .fill(
          "{{name}} — {{role}}\n\nHello {{company}} team,\n\n{{opening}}\n\n{{evidence}}\n\n{{closing}}",
        );
      await page.reload();
      await page
        .getByRole("heading", { name: "Edit Your Cover Letter Template" })
        .waitFor();
      await page.getByTitle("Cover Letter Preview").waitFor();
      assert.match(
        await page.getByLabel("Template content").inputValue(),
        /Hello \{\{company\}\}/,
      );
      await page
        .getByLabel("Prompt to optimize cover letter")
        .fill("Make it more professional");
      await page.getByRole("button", { name: "Apply Prompt" }).click();
      await page.getByText("Prompt applied locally").waitFor();
      await page.getByRole("button", { name: "Continue" }).click();
      await page.getByRole("button", { name: /E2E tailored resume/ }).click();
      await page
        .getByLabel("Cover Letter Instructions")
        .fill("Emphasize accessible product delivery and measurable outcomes.");
      await page.getByRole("button", { name: "Continue" }).click();
      await page.getByRole("heading", { name: "Job Information" }).waitFor();
      await page
        .getByLabel("Job Description")
        .fill(
          "Build accessible React product experiences and improve customer conversion.",
        );
      const [coverLetterResponse] = await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/cover-letters") &&
            response.request().method() === "POST" &&
            response.ok(),
        ),
        page.getByRole("button", { name: "Generate Cover Letter" }).click(),
      ]);
      const generatedCoverLetter = await coverLetterResponse.json();
      assert.equal(
        generatedCoverLetter.jobDescription,
        "Build accessible React product experiences and improve customer conversion.",
      );
      assert.equal(
        generatedCoverLetter.emphasis,
        "Emphasize accessible product delivery and measurable outcomes.",
      );
      await page.getByRole("heading", { name: "Your Cover Letter" }).waitFor();
      await page.getByTitle("Generated Cover Letter Preview").waitFor();
      await page.getByRole("link", { name: "Preview PDF" }).waitFor();
      await page.getByLabel("Cover letter title").fill("E2E product letter");
      await page
        .getByLabel("Generated cover letter")
        .fill(
          "Dear hiring team,\n\nI shipped measurable product improvements.",
        );
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes("/api/cover-letters/") &&
            response.request().method() === "PATCH" &&
            response.ok(),
        ),
        page.getByRole("button", { name: "Save and Finish" }).click(),
      ]);
      await page.getByText("E2E product letter").first().waitFor();
      await page
        .getByRole("button", { name: "Edit E2E product letter" })
        .waitFor();
      assert.equal(
        await page.locator(".v2-letter-card-preview").count(),
        1,
        "saved cover letters should render as v2 document preview cards",
      );
      await assertAccessible(page, "Cover Letters");
      await page
        .getByRole("button", { name: "Edit E2E product letter" })
        .click();
      await page.getByRole("heading", { name: "Edit Cover Letter" }).waitFor();
      assert.equal(
        await page.locator(".v2-letter-card-preview").count(),
        0,
        "editing should use a focused document workspace instead of stacking beneath the card grid",
      );
      await page.getByRole("button", { name: "Back to Cover Letters" }).click();
      await page.getByRole("heading", { name: "Cover Letters" }).waitFor();

      await page.getByRole("button", { name: "Job Tracker" }).click();
      await page.getByText("Show Columns:", { exact: true }).waitFor();
      for (const status of ["Submitting", "Failed", "Skipped", "Removed"]) {
        assert.equal(
          await page.getByLabel(status, { exact: true }).isChecked(),
          true,
        );
      }
      await page.getByLabel("Filter by agent run").selectOption("automated");
      assert.equal(
        await page.getByLabel("Filter by agent run").inputValue(),
        "automated",
      );
      await page.getByLabel("Rejected", { exact: true }).uncheck();
      await page
        .locator(".kanban-column .column-title", { hasText: "Queued" })
        .waitFor();
      assert.equal(
        await page.locator(".kanban-column", { hasText: /^rejected/i }).count(),
        0,
        "hidden tracker statuses should remove their board columns",
      );
      await page.getByRole("button", { name: "Reset filters" }).click();
      const trackerInsightsState = await (
        await page.request.get(`${baseUrl}/api/state`)
      ).json();
      const activeTrackerSubmission = trackerInsightsState.submissions.find(
        (submission) => !["submitted", "archived"].includes(submission.status),
      );
      const insightsJobId = activeTrackerSubmission.jobId;
      await page.goto(`${baseUrl}/#/tracker?job=${insightsJobId}`);
      await page
        .getByRole("button", { name: "Go to Submission Queue" })
        .waitFor();
      const atsAnalysis = page.getByRole("region", { name: "ATS Analysis" });
      await atsAnalysis.waitFor();
      await atsAnalysis
        .getByText(/ATS application threshold|Below your/)
        .waitFor();
      const applicationQuestions = page.getByRole("region", {
        name: "Application Questions",
      });
      await applicationQuestions.waitFor();
      await applicationQuestions
        .getByText("Why are you interested in this role?", { exact: true })
        .waitFor();
      await page.getByRole("button", { name: "Funnel Analysis" }).click();
      const funnelDialog = page.getByRole("dialog", {
        name: "Job Application Funnel Analysis",
      });
      await funnelDialog.waitFor();
      await funnelDialog
        .getByText("Application rate", { exact: true })
        .waitFor();
      await funnelDialog.getByText("Interview rate", { exact: true }).waitFor();
      await funnelDialog.getByText("Offer rate", { exact: true }).waitFor();
      await page.keyboard.press("Escape");
      await funnelDialog.waitFor({ state: "hidden" });
      await page.getByLabel("Job status").selectOption("interview");
      await page.getByRole("button", { name: "Add Round" }).click();
      const roundForm = page.locator(".interview-round-form");
      await roundForm.getByLabel("Round number").fill("1");
      await roundForm
        .getByLabel("Notes")
        .fill("Technical interview with the engineering manager");
      const [roundResponse] = await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes("/api/jobs/") &&
            response.request().method() === "PATCH",
        ),
        roundForm.getByRole("button", { name: "Add", exact: true }).click(),
      ]);
      const roundResult = await roundResponse.json();
      assert.equal(roundResponse.status(), 200);
      assert.equal(
        roundResult.interviewRounds?.[0]?.roundType,
        "Interview Round 1",
        `interview round was not persisted: ${JSON.stringify(roundResult)}`,
      );
      await page.getByText("Interview Round 1", { exact: true }).waitFor();
      await page
        .getByText("Technical interview with the engineering manager", {
          exact: true,
        })
        .waitFor();
      await page.getByRole("button", { name: "Funnel Analysis" }).click();
      await funnelDialog.getByText("Round-by-round conversion").waitFor();
      await funnelDialog
        .getByText("Interview Round 1", { exact: true })
        .waitFor();
      await page.keyboard.press("Escape");
      await funnelDialog.waitFor({ state: "hidden" });
      await page.getByLabel("Private job note").fill("E2E tracker note");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByText("E2E tracker note").waitFor();
      await page
        .getByRole("button", { name: "Delete note E2E tracker note" })
        .click();
      const deleteNoteDialog = page.getByRole("alertdialog", {
        name: "Delete note?",
      });
      await deleteNoteDialog.waitFor();
      await assertAccessible(page, "Delete tracker note confirmation");
      await deleteNoteDialog.getByRole("button", { name: "Delete" }).click();
      await deleteNoteDialog.waitFor({ state: "hidden" });
      await page.getByText("E2E tracker note").waitFor({ state: "hidden" });
      await page.getByLabel("Task description").fill("Prepare portfolio");
      await page.getByLabel("Task due date").fill("2030-05-20");
      await page.getByRole("button", { name: "Add", exact: true }).click();
      const trackerTask = page
        .locator(".task-row")
        .filter({ hasText: "Prepare portfolio" });
      await trackerTask.waitFor();
      await trackerTask.getByRole("button", { name: "Edit" }).click();
      await page
        .getByLabel("Task description")
        .fill("Prepare product portfolio");
      await page.getByLabel("Task due date").fill("2030-05-21");
      await page.getByRole("button", { name: "Save task" }).click();
      await page.getByText("Prepare product portfolio").waitFor();
      await page
        .getByRole("button", {
          name: "Delete task Prepare product portfolio",
        })
        .click();
      const deleteTaskDialog = page.getByRole("alertdialog", {
        name: "Delete task?",
      });
      await deleteTaskDialog.waitFor();
      await deleteTaskDialog.getByRole("button", { name: "Delete" }).click();
      await deleteTaskDialog.waitFor({ state: "hidden" });
      await page
        .getByText("Prepare product portfolio")
        .waitFor({ state: "hidden" });
      await page.getByRole("button", { name: "Delete role" }).click();
      const deleteJobDialog = page.getByRole("alertdialog", {
        name: "Delete tracked job?",
      });
      await deleteJobDialog.waitFor();
      assert.equal(
        await deleteJobDialog
          .getByRole("button", { name: "Cancel" })
          .evaluate((button) => button === document.activeElement),
        true,
        "destructive dialogs should focus the safe action first",
      );
      await page.keyboard.press("Shift+Tab");
      assert.equal(
        await deleteJobDialog
          .getByRole("button", { name: "Delete" })
          .evaluate((button) => button === document.activeElement),
        true,
        "Shift+Tab should wrap focus inside the dialog",
      );
      await page.keyboard.press("Tab");
      await assertAccessible(page, "Delete tracked job confirmation");
      await deleteJobDialog.getByRole("button", { name: "Cancel" }).click();
      await deleteJobDialog.waitFor({ state: "hidden" });
      assert.equal(
        await page
          .getByRole("button", { name: "Delete role" })
          .evaluate((button) => button === document.activeElement),
        true,
        "closing a dialog should restore focus to its trigger",
      );
      await page.getByLabel("Filter by agent run").selectOption("manual");
      await page
        .getByRole("button", { name: /Founding Product Engineer/ })
        .click();
      await page.getByRole("button", { name: "Edit job" }).click();
      const jobEditForm = page.locator(".job-edit-form");
      await jobEditForm
        .getByLabel("title", { exact: true })
        .fill("Founding Principal Product Engineer");
      await jobEditForm
        .getByLabel("salary", { exact: true })
        .fill("$175k-$225k");
      await jobEditForm.getByRole("button", { name: "Save job" }).click();
      await page
        .getByRole("heading", { name: "Founding Principal Product Engineer" })
        .waitFor();
      await page.getByText("$175k-$225k", { exact: false }).waitFor();
      const trackerState = await (
        await page.request.get(`${baseUrl}/api/state`)
      ).json();
      const editedJobId = trackerState.jobs.find(
        (job) => job.title === "Founding Principal Product Engineer",
      ).id;
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes(`/api/jobs/${editedJobId}`) &&
            response.request().method() === "PATCH" &&
            response.ok(),
        ),
        page.getByLabel("Job status").selectOption("interview"),
      ]);
      await page.waitForFunction(
        () =>
          document.querySelector('[aria-label="Job status"]')?.value ===
          "interview",
      );
      await page.getByLabel("Job status").selectOption("applied");
      const appliedDialog = page.getByRole("alertdialog", {
        name: "Confirm external submission",
      });
      await appliedDialog.waitFor();
      await assertAccessible(page, "Manual applied confirmation");
      await appliedDialog.getByRole("button", { name: "Cancel" }).click();
      await appliedDialog.waitFor({ state: "hidden" });
      await page.reload();
      await page
        .getByRole("heading", { name: "Founding Principal Product Engineer" })
        .waitFor();
      await page.getByLabel("Job status").selectOption("applied");
      await appliedDialog.waitFor();
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes(`/api/jobs/${editedJobId}`) &&
            response.request().method() === "PATCH" &&
            response.ok(),
        ),
        appliedDialog
          .getByRole("button", { name: "I verified it was submitted" })
          .click(),
      ]);
      await page.getByText("Applied", { exact: true }).first().waitFor();
      await page.goto(`${baseUrl}/#/tracker?job=${editedJobId}&run=manual`);
      await page
        .getByRole("heading", { name: "Founding Principal Product Engineer" })
        .waitFor();
      await page.reload();
      await page
        .getByRole("heading", { name: "Founding Principal Product Engineer" })
        .waitFor();
      assert.match(page.url(), new RegExp(`job=${editedJobId}`));
      await assertAccessible(page, "Job Tracker");

      await page.getByRole("button", { name: "LinkedIn Audit" }).click();
      await page
        .getByRole("heading", { name: "LinkedIn Profile Audit" })
        .waitFor();
      await page.goBack();
      await page
        .getByRole("heading", { name: "Founding Principal Product Engineer" })
        .waitFor();
      await page.goForward();
      await page
        .getByRole("heading", { name: "LinkedIn Profile Audit" })
        .waitFor();
      assert.equal(
        await page.getByLabel("About section").count(),
        0,
        "pasted profile content should start collapsed like v2",
      );
      await page
        .getByRole("button", { name: /Show pasted profile content/ })
        .click();
      await page
        .getByLabel("About section")
        .fill(
          "I build customer-facing products and improved conversion by 42% through measurable experiments.",
        );
      const profileUrlInput = page.getByLabel(
        "LinkedIn profile URL Optional reference",
      );
      await profileUrlInput.fill("https://example.com/not-linkedin");
      await page.getByText(/Enter a valid LinkedIn profile URL/).waitFor();
      await profileUrlInput.fill("https://www.linkedin.com/in/e2e-profile");
      await page
        .getByRole("button", { name: /Show Additional Context/ })
        .click();
      await page
        .getByLabel(/How would you like to improve your LinkedIn profile/)
        .fill(
          "Target product engineering roles focused on conversion experiments and React.",
        );
      await page.getByRole("button", { name: "Analyze Profile" }).click();
      await page.locator(".audit-score").waitFor();
      await page
        .getByRole("button", { name: /Delete profile audit from/ })
        .click();
      const deleteAuditDialog = page.getByRole("alertdialog", {
        name: "Delete profile audit?",
      });
      await deleteAuditDialog.waitFor();
      await deleteAuditDialog.getByRole("button", { name: "Cancel" }).click();
      await deleteAuditDialog.waitFor({ state: "hidden" });
      await assertAccessible(page, "LinkedIn Audit");

      await page.locator('button[title="Outreach"]').click();
      await page.getByRole("button", { name: "Collect contacts" }).click();
      assert.equal(
        await page.getByLabel("Show Connection Messages").isChecked(),
        false,
        "connection messages should default hidden like v2",
      );
      await page.getByLabel("Show Connection Messages").check();
      const subject = page.getByLabel("Subject");
      await subject.fill("E2E persisted outreach subject");
      await page.getByRole("button", { name: "Save locally" }).click();

      await page.reload();
      await page
        .getByRole("heading", { name: "Outreach", exact: true })
        .waitFor();
      await page.getByText("E2E persisted outreach subject").first().waitFor();
      await page.getByRole("button", { name: "Collect contacts" }).click();
      await page
        .getByText("All contacts for this role are already collected.")
        .waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Filters", exact: true })
          .getAttribute("aria-expanded"),
        "true",
        "outreach filters should default open like v2",
      );
      await page.getByLabel("Sort contacts").selectOption("company");
      await page.getByLabel("Recruiters").uncheck();
      await page.getByLabel("Hiring managers").uncheck();
      assert.equal(await page.getByLabel("Peers").isChecked(), true);
      await page
        .getByLabel(/Select hiring team at/i)
        .first()
        .check();
      await page.getByRole("button", { name: "Connect (1)" }).click();
      const connectDialog = page.getByRole("dialog", {
        name: "Connect to 1 contact",
      });
      await connectDialog.waitFor();
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes("/api/outreach/") &&
            response.request().method() === "PATCH" &&
            response.ok(),
        ),
        connectDialog
          .getByRole("button", { name: "Mark as outreached" })
          .click(),
      ]);
      await connectDialog.waitFor({ state: "hidden" });
      await page.getByText("Outreached", { exact: true }).first().waitFor();
      await page.getByRole("button", { name: "Delete Hiring team" }).click();
      const deleteContactDialog = page.getByRole("alertdialog", {
        name: "Delete outreach contact?",
      });
      await deleteContactDialog.waitFor();
      await assertAccessible(page, "Delete outreach contact confirmation");
      await deleteContactDialog.getByRole("button", { name: "Cancel" }).click();
      await assertAccessible(page, "Outreach");

      await page.getByRole("button", { name: "Career Coach" }).click();
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/coach/conversations") &&
            response.request().method() === "POST" &&
            response.ok(),
        ),
        page
          .getByRole("button", { name: "Help me prepare for an interview" })
          .click(),
      ]);
      await page.getByText(/answer in four parts/).waitFor();
      assert.match(page.url(), /#\/coach\?conversation=/);
      await page.getByRole("button", { name: /Copy coach response/ }).click();
      await page.getByText("Copied", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Share conversation" }).click();
      await page.getByText("Link copied", { exact: true }).waitFor();
      await assertAccessible(page, "Career Coach");
      await page
        .getByRole("button", { name: "New coaching conversation" })
        .click();
      await page
        .getByRole("heading", { name: "Hi, I'm your Career Coach!" })
        .waitFor();
      await page
        .getByLabel("Message Career Coach")
        .fill("Help me plan this week");
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/coach/conversations") &&
            response.request().method() === "POST" &&
            response.ok(),
        ),
        page.getByRole("button", { name: /Get Started/ }).click(),
      ]);
      await page.getByText("2 saved locally").waitFor();
      await page.reload();
      await page
        .getByRole("paragraph")
        .filter({ hasText: /^Help me plan this week$/ })
        .waitFor();
      await page
        .getByRole("button", {
          name: "Help me prepare for an interview 1 coaching exchange",
        })
        .click();
      await page
        .getByText("Help me prepare for an interview", { exact: true })
        .last()
        .waitFor();
      await page
        .getByRole("button", {
          name: "Delete Help me prepare for an interview",
        })
        .click();
      const deleteCoachDialog = page.getByRole("alertdialog", {
        name: "Delete coaching conversation?",
      });
      await deleteCoachDialog.waitFor();
      await assertAccessible(page, "Delete coaching conversation confirmation");
      await deleteCoachDialog.getByRole("button", { name: "Cancel" }).click();
      await page.getByRole("button", { name: "STAR story vault" }).click();
      await page.getByLabel("Story title").fill("Recovered a critical launch");
      await page.getByLabel("Situation").fill("A launch was at risk.");
      await page.getByLabel("Task").fill("Restore delivery confidence.");
      await page
        .getByLabel("Action")
        .fill("Prioritized failures and coordinated the fix.");
      await page.getByLabel("Result").fill("Shipped on time with no rollback.");
      await page
        .getByLabel("Skills, comma-separated")
        .fill("Incident response, Leadership");
      await page.getByRole("button", { name: "Save story" }).click();
      await page.getByText("Recovered a critical launch").waitFor();
      await page
        .getByRole("button", {
          name: "Delete STAR story Recovered a critical launch",
        })
        .click();
      const deleteStoryDialog = page.getByRole("alertdialog", {
        name: "Delete STAR story?",
      });
      await deleteStoryDialog.waitFor();
      await assertAccessible(page, "Delete STAR story confirmation");
      await deleteStoryDialog.getByRole("button", { name: "Delete" }).click();
      await deleteStoryDialog.waitFor({ state: "hidden" });
      await page
        .getByText("Recovered a critical launch")
        .waitFor({ state: "hidden" });

      await page.getByRole("button", { name: "Gigs" }).click();
      await page.getByRole("button", { name: "Apply Now" }).first().click();
      const campaignDialog = page.getByRole("dialog", {
        name: "Review an AI resume workflow",
      });
      await campaignDialog.waitFor();
      assert.equal(
        await campaignDialog
          .getByRole("button", { name: "Cancel" })
          .evaluate((button) => button === document.activeElement),
        true,
        "gig application review should focus its safe cancel action",
      );
      await campaignDialog
        .getByLabel("Gig application pitch")
        .fill(
          "I test complex React workflows and provide evidence-based feedback.",
        );
      await assertAccessible(page, "Gig application review");
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/gigs") &&
            response.request().method() === "POST" &&
            response.ok(),
        ),
        campaignDialog
          .getByRole("button", { name: "Submit Application" })
          .click(),
      ]);
      await page
        .getByRole("heading", { name: "Review an AI resume workflow" })
        .last()
        .waitFor();
      const gigDialog = page.getByRole("dialog", {
        name: "Review an AI resume workflow",
      });
      await gigDialog.waitFor();
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes("/api/gigs/") &&
            response.request().method() === "PATCH" &&
            response.ok(),
        ),
        gigDialog.getByLabel("Gig application status").selectOption("proposal"),
      ]);
      await gigDialog
        .getByLabel("Gig application status")
        .selectOption("negotiation");
      await gigDialog.getByRole("button", { name: "Start Work" }).click();
      await gigDialog.getByText("Work started.").waitFor();
      await gigDialog.getByRole("button", { name: "Submit Work" }).click();
      await gigDialog.getByText("Work submitted for approval.").waitFor();
      await gigDialog
        .getByText("Waiting for approval", { exact: true })
        .waitFor();
      await page.keyboard.press("Escape");
      await gigDialog.waitFor({ state: "hidden" });
      await page.getByLabel("Search my gigs").fill("Career Tools Lab");
      await page
        .locator(".v2-gig-applications")
        .getByText("Waiting for Approval")
        .waitFor();
      await assertAccessible(page, "Gigs");

      await page.locator('[title="Profile and settings"]').click();
      const workspaceMenu = page.getByRole("menu", {
        name: "Local workspace menu",
      });
      await workspaceMenu.waitFor();
      await workspaceMenu
        .getByRole("menuitem", { name: "Profile & usage" })
        .click();
      await page.getByRole("heading", { name: "User Center" }).waitFor();
      assert.equal(new URL(page.url()).hash, "#/settings");
      await page.reload();
      await page.getByRole("heading", { name: "User Center" }).waitFor();
      await page.getByLabel("First name").fill("E2E");
      await page.getByLabel("Last name").fill("Hunter");
      await page.getByLabel("Nickname (for job cards)").fill("E2E Builder");
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/profile") &&
            response.request().method() === "PUT" &&
            response.ok(),
        ),
        page.getByRole("button", { name: "Save profile" }).click(),
      ]);
      await page.reload();
      assert.equal(await page.getByLabel("First name").inputValue(), "E2E");
      assert.equal(await page.getByLabel("Last name").inputValue(), "Hunter");
      assert.equal(
        await page.getByLabel("Nickname (for job cards)").inputValue(),
        "E2E Builder",
      );
      await page.getByRole("tab", { name: "Coaches" }).click();
      await page.getByRole("heading", { name: "Coaching activity" }).waitFor();
      await page.getByText("Only you can access this workspace").waitFor();
      await assertAccessible(page, "User Center coaches");
      await page.getByRole("button", { name: "Open Career Coach" }).click();
      await page.getByRole("button", { name: "Local Career Coach" }).waitFor();
      await page.locator('[title="Profile and settings"]').click();
      await page.getByRole("menuitem", { name: "Profile & usage" }).click();
      await page.getByRole("heading", { name: "User Center" }).waitFor();
      await page.getByRole("tab", { name: "About Me" }).click();
      assert.equal(new URL(page.url()).hash, "#/settings?tab=about");
      await page
        .getByLabel("Long-form career context")
        .fill("E2E product engineer with React and TypeScript experience.");
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/profile") &&
            response.request().method() === "PUT" &&
            response.ok(),
        ),
        page.getByRole("button", { name: "Save About Me" }).click(),
      ]);
      await page.getByText("Changes saved locally.").waitFor();
      await page.reload();
      assert.equal(
        await page
          .getByRole("tab", { name: "About Me" })
          .getAttribute("aria-selected"),
        "true",
        "User Center deep links should survive reloads",
      );
      assert.equal(
        await page
          .getByLabel("Why are you interested in this role?")
          .inputValue(),
        "The product mission matches my experience.",
      );
      const faqPanel = page.locator(".v2-faq-panel");
      assert.equal(
        await faqPanel.count(),
        1,
        "About Me should render its FAQ panel",
      );
      await page
        .getByLabel("Why are you interested in this role?")
        .fill("Unsaved answer that should be discarded");
      const refreshFaq = faqPanel.locator("button", { hasText: "Refresh" });
      assert.equal(
        await refreshFaq.count(),
        1,
        `FAQ actions were: ${JSON.stringify(await faqPanel.locator("button").allTextContents())}`,
      );
      await refreshFaq.click();
      assert.equal(
        await page
          .getByLabel("Why are you interested in this role?")
          .inputValue(),
        "The product mission matches my experience.",
        "FAQ refresh should restore the persisted answer",
      );
      await faqPanel.locator("button", { hasText: "Delete" }).click();
      const removableQuestion = "What are your salary expectations?";
      await page
        .getByRole("button", { name: `Delete ${removableQuestion}` })
        .click();
      const deleteFaqDialog = page.getByRole("alertdialog", {
        name: "Delete FAQ question?",
      });
      await deleteFaqDialog.waitFor();
      await assertAccessible(page, "Delete FAQ confirmation");
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/profile") &&
            response.request().method() === "PUT" &&
            response.ok(),
        ),
        deleteFaqDialog
          .getByRole("button", { name: "Delete question" })
          .click(),
      ]);
      await page.getByLabel(removableQuestion).waitFor({ state: "detached" });
      await page.reload();
      assert.equal(
        await page.getByLabel(removableQuestion).count(),
        0,
        "deleted FAQ questions should remain deleted after reload",
      );
      await page.getByRole("tab", { name: "Settings" }).click();
      assert.equal(new URL(page.url()).hash, "#/settings?tab=settings");
      await page.getByLabel("Weekly application goal").waitFor();
      await page.getByLabel("ATS template application threshold").fill("85");
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/profile") &&
            response.request().method() === "PUT" &&
            response.ok(),
        ),
        page.getByRole("button", { name: "Save settings" }).click(),
      ]);
      await page.getByText("Changes saved locally.").waitFor();
      await assertAccessible(page, "User Center");
      await page.locator('[title="Data and privacy"]').click();
      await page.getByRole("heading", { name: "Settings & data" }).waitFor();
      await page.getByLabel("Import JobHuntr JSON backup").setInputFiles({
        name: "e2e-backup.json",
        mimeType: "application/json",
        buffer: Buffer.from(
          JSON.stringify({
            jobs: [{ id: "backup-job" }],
            resumes: [{ id: "backup-resume" }],
            coverLetters: [],
            agentRuns: [],
            coachConversations: [{ id: "backup-chat" }],
          }),
        ),
      });
      await page.getByText(/Contains 1 jobs, 1 resumes/).waitFor();
      await page.getByText(/1 coach chats/).waitFor();
      await page.getByRole("button", { name: "Review restore" }).click();
      const restoreDialog = page.getByRole("dialog", {
        name: "Replace this workspace?",
      });
      await restoreDialog.waitFor();
      await restoreDialog.getByRole("button", { name: "Cancel" }).click();
      await restoreDialog.waitFor({ state: "hidden" });
      await assertAccessible(page, "Settings and data");

      const persisted = JSON.parse(
        await fs.readFile(path.join(dataDir, "jobhuntr.json"), "utf8"),
      );
      assert.equal(persisted.agentRuns.length, 1);
      assert.deepEqual(persisted.agentRuns[0].workflows, [
        "indeed",
        "linkedin",
      ]);
      assert.equal(persisted.agentRuns[0].optimizeResume, true);
      assert.ok(
        persisted.resumes.some(
          (resume) => resume.name === "E2E tailored resume",
        ),
      );
      assert.ok(
        persisted.submissions.some(
          (submission) => submission.status === "submitted",
        ),
      );
      assert.equal(
        persisted.submissions.filter((submission) => submission.atsDecision)
          .length,
        persisted.agentRuns[0].queued,
      );
      assert.equal(persisted.coverLetters[0].title, "E2E product letter");
      assert.equal(persisted.profile.preferences.atsThreshold, 85);
      assert.equal(persisted.profile.firstName, "E2E");
      assert.equal(persisted.profile.lastName, "Hunter");
      assert.equal(persisted.profile.nickname, "E2E Builder");
      assert.equal(persisted.profileAudits.length, 1);
      assert.equal(persisted.coachConversations.length, 2);
      assert.equal(
        persisted.coachConversations[0].messages[0].content,
        "Help me plan this week",
      );
      assert.ok(
        persisted.jobs.some(
          (job) =>
            job.status === "interview" &&
            job.interviewRounds.some(
              (round) => round.roundType === "Interview Round 1",
            ),
        ),
      );
      assert.equal(
        persisted.jobs.some((job) =>
          job.notes.some((note) => note.text === "E2E tracker note"),
        ),
        false,
      );
      assert.ok(
        persisted.jobs.some(
          (job) =>
            job.title === "Founding Principal Product Engineer" &&
            job.salary === "$175k-$225k",
        ),
      );
      assert.equal(persisted.gigs[0].title, "Review an AI resume workflow");
      assert.equal(
        persisted.gigs[0].proposal,
        "I test complex React workflows and provide evidence-based feedback.",
      );
      assert.equal(
        persisted.outreachDrafts[0].subject,
        "E2E persisted outreach subject",
      );

      const mobileContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
      });
      const mobile = await mobileContext.newPage();
      await mobile.goto(baseUrl);
      await mobile.getByRole("heading", { name: /Welcome back/ }).waitFor();
      const navigationBox = await mobile.locator(".v2-sidebar").boundingBox();
      assert.ok(navigationBox, "mobile navigation should be rendered");
      assert.ok(
        navigationBox.y >= 780,
        "mobile navigation should be bottom-fixed",
      );
      assert.equal(
        await mobile.evaluate(
          () =>
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth + 1,
        ),
        false,
        "Overview should fit a 390px viewport",
      );
      await assertAccessible(mobile, "Mobile Overview");
      await mobile
        .locator('button[title="Job Board"]')
        .evaluate((button) => button.click());
      await mobile.getByRole("heading", { name: "Today's Picks" }).waitFor();
      await assertAccessible(mobile, "Mobile Job Board");
      const hasPageOverflow = await mobile.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      assert.equal(
        hasPageOverflow,
        false,
        "mobile page should not overflow horizontally",
      );
      for (const [navigation, heading] of [
        ["Infinite Hunting", "Infinite Hunting"],
        ["Agent Runs", "Agent Runs"],
        ["Submission Queue", "Submission Queue"],
        ["ATS Resume", "ATS Resume"],
        ["Cover Letter", "Cover Letters"],
        ["Job Tracker", "Job Tracker"],
        ["Outreach", "Outreach"],
        ["LinkedIn Audit", "LinkedIn Profile Audit"],
        ["Gigs", "Gigs"],
        ["Career Coach", "Hi, I'm your Career Coach!"],
        ["Profile and settings", "User Center"],
        ["Data and privacy", "Settings & data"],
      ]) {
        await mobile
          .locator(`button[title="${navigation}"]`)
          .evaluate((button) => button.click());
        await mobile.getByRole("heading", { name: heading }).first().waitFor();
        const overflow = await mobile.evaluate(
          () =>
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth + 1,
        );
        assert.equal(overflow, false, `${heading} should fit a 390px viewport`);
      }
      await assertAccessible(mobile, "Mobile Settings and data");
      await mobileContext.close();
    } finally {
      await browser?.close();
      try {
        process.platform === "win32"
          ? server.kill("SIGTERM")
          : process.kill(-server.pid, "SIGTERM");
      } catch {}
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  },
);
