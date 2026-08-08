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
  { timeout: 45_000 },
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
      const desktopContext = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      });
      const page = await desktopContext.newPage();
      await page.goto(baseUrl);

      await page.getByRole("button", { name: "Use demo profile" }).click();
      await page
        .getByRole("button", { name: "Use demo profile" })
        .waitFor({ state: "hidden" });
      await page.getByRole("heading", { name: /Welcome back/ }).waitFor();
      await page
        .getByRole("heading", { name: /Top Contributors of/ })
        .waitFor();
      await page.getByText(/jobs? contributed/).waitFor();
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
      await page.getByLabel("Applications evaluated").check();
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
      await page.getByRole("button", { name: /I got an offer/ }).click();
      await page.getByRole("dialog", { name: "Congrats!" }).waitFor();
      await page.keyboard.press("Escape");
      await page.getByRole("dialog", { name: "Congrats!" }).waitFor({
        state: "hidden",
      });

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

      await page.getByRole("button", { name: "All Runs" }).click();
      await page.getByRole("heading", { name: "All Runs" }).waitFor();
      await page
        .locator(".v2-run-row .pill", { hasText: "Completed" })
        .waitFor();
      await page.getByLabel("Search runs").fill("Software Engineer");
      await page.getByText("Showing 1 of 1 runs").waitFor();
      const runTrigger = page.getByRole("button", {
        name: /Software Engineer/,
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
      await assertAccessible(page, "All Runs");
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
      await page.getByRole("button", { name: "Filters" }).click();
      await page.getByLabel("Location").fill("Remote");
      await page.getByLabel("Minimum match").selectOption("25");
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
      await assertAccessible(page, "Job Board");

      await page.getByRole("button", { name: "ATS Resume" }).click();
      await page.getByRole("button", { name: "Create New" }).click();
      const templateDialog = page.getByRole("dialog", {
        name: "Create New Template",
      });
      await templateDialog.getByLabel("Template name").fill("E2E Leadership");
      await templateDialog
        .getByLabel("Description")
        .fill("Highlights technical leadership and measurable outcomes.");
      await templateDialog
        .getByLabel("Sections (comma separated)")
        .fill("Summary, Leadership, Experience, Education");
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
      await page.getByLabel("Search resume history").fill("no such resume");
      await page.getByText("No AI resumes found.", { exact: true }).waitFor();
      await page.getByLabel("Search resume history").fill("");
      await assertAccessible(page, "ATS Resume");

      await page.locator('button[title="Submission Queue"]').click();
      await page
        .locator(".v2-ats-recommendation")
        .filter({ hasText: /ATS resume generated|Original resume meets/ })
        .first()
        .waitFor();
      await page.getByRole("tab", { name: /Search Jobs/ }).click();
      await page.getByRole("button", { name: "Prepare application" }).click();
      const checklist = page.locator(".packet input[type=checkbox]");
      await checklist.first().waitFor();
      await assertAccessible(page, "Submission Queue");
      const checklistCount = await checklist.count();
      assert.ok(checklistCount > 0, "submission checklist should be visible");
      const resumeAttachment = page.getByLabel("Resume attachment");
      await resumeAttachment.waitFor();
      assert.equal(
        await resumeAttachment.inputValue(),
        "profile-resume",
        "manual queue preparation should attach the original profile resume",
      );
      await page.getByText("Resume ready for review").waitFor();
      await page.getByLabel("Cover letter attachment").waitFor();
      await page.getByLabel("Minimum queue match score").selectOption("40");
      await page.getByLabel("Sort submission queue").selectOption("fit");
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
      await page.getByRole("button", { name: "Start Submitting" }).click();
      const submitDialog = page.getByRole("dialog", {
        name: "Start submitting",
      });
      await submitDialog.waitFor();
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().endsWith("/submit") &&
            response.request().method() === "POST" &&
            response.ok(),
        ),
        submitDialog.getByRole("button", { name: "Confirm submitted" }).click(),
      ]);
      await page.getByRole("heading", { name: "Submission Queue" }).waitFor();

      await page.getByRole("button", { name: "Cover Letter" }).click();
      await page.getByRole("button", { name: "Create Cover Letter" }).click();
      await page
        .getByRole("heading", { name: "Choose a writing style" })
        .waitFor();
      await assertAccessible(page, "Cover Letter wizard");
      await page.getByRole("button", { name: /Story-driven/ }).click();
      await page.getByRole("button", { name: "Continue" }).click();
      await page
        .getByLabel("Custom opening")
        .fill("I have followed this team’s product work for years.");
      await page
        .getByLabel("Experience to emphasize")
        .fill("I increased conversion by 42% while leading a React platform.");
      await page.getByRole("button", { name: "Continue" }).click();
      await page.getByRole("button", { name: /E2E tailored resume/ }).click();
      await page.getByRole("button", { name: "Continue" }).click();
      await page
        .getByRole("heading", { name: "Choose the target job" })
        .waitFor();
      await page.getByRole("button", { name: "Continue" }).click();
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/cover-letters") &&
            response.request().method() === "POST" &&
            response.ok(),
        ),
        page.getByRole("button", { name: "Generate Cover Letter" }).click(),
      ]);
      await page.getByLabel("Cover letter title").fill("E2E product letter");
      await page
        .getByLabel("Cover letter content")
        .fill(
          "Dear hiring team,\n\nI shipped measurable product improvements.",
        );
      await page.getByRole("button", { name: "Save changes" }).click();
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

      await page.getByRole("button", { name: "Job Tracker" }).click();
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
      await page.getByLabel("Private job note").fill("E2E tracker note");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByText("E2E tracker note").waitFor();
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
      await page.getByText("E2E tracker note").waitFor();
      await assertAccessible(page, "Job Tracker");

      await page.getByRole("button", { name: "LinkedIn Audit" }).click();
      await page
        .getByLabel("About section")
        .fill(
          "I build customer-facing products and improved conversion by 42% through measurable experiments.",
        );
      await page
        .getByLabel("LinkedIn profile URL Optional reference")
        .fill("https://www.linkedin.com/in/e2e-profile");
      await page
        .getByRole("button", { name: /Show Additional Context/ })
        .click();
      await page
        .getByLabel("How would you like to improve your LinkedIn profile?")
        .fill(
          "Target product engineering roles focused on conversion experiments and React.",
        );
      await page.getByRole("button", { name: "Analyze Profile" }).click();
      await page.locator(".audit-score").waitFor();
      await assertAccessible(page, "LinkedIn Audit");

      await page.locator('button[title="Outreach"]').click();
      await page.getByRole("button", { name: "Collect contacts" }).click();
      const subject = page.getByLabel("Subject");
      await subject.fill("E2E persisted outreach subject");
      await page.getByRole("button", { name: "Save locally" }).click();

      await page.reload();
      await page
        .getByRole("heading", { name: "Outreach", exact: true })
        .waitFor();
      await page.getByText("E2E persisted outreach subject").first().waitFor();
      await page.getByRole("button", { name: "Filters" }).click();
      await page.getByLabel("Sort contacts").selectOption("company");
      await page
        .getByLabel(/Select hiring team at/)
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
      await assertAccessible(page, "Outreach");

      await page.getByRole("button", { name: "AI Coach" }).click();
      await page
        .getByRole("button", { name: "Help me prepare for an interview" })
        .click();
      await page.getByText(/start by grounding your answer/).waitFor();
      await assertAccessible(page, "AI Coach");
      await page
        .getByRole("button", { name: "New coaching conversation" })
        .click();
      await page.getByRole("heading", { name: "Hi, I'm AI Coach!" }).waitFor();
      await page.getByLabel("Message AI Coach").fill("Help me plan this week");
      await page.getByRole("button", { name: /Get Started/ }).click();
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

      await page.getByRole("button", { name: "Gigs" }).click();
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/gigs") &&
            response.request().method() === "POST" &&
            response.ok(),
        ),
        page.getByRole("button", { name: "View & apply" }).first().click(),
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
      await page.keyboard.press("Escape");
      await gigDialog.waitFor({ state: "hidden" });
      await page.getByLabel("Search my gigs").fill("Career Tools Lab");
      await page
        .locator(".v2-gig-applications")
        .getByText("Application Submitted")
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
      await page.getByRole("tab", { name: "About Me" }).click();
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
      await page.getByRole("button", { name: "Generate FAQ" }).click();
      await page
        .getByLabel("Why are you interested in this role?")
        .fill("I enjoy building reliable user-facing products.");
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/profile") &&
            response.request().method() === "PUT" &&
            response.ok(),
        ),
        page.getByRole("button", { name: "Save FAQ answers" }).click(),
      ]);
      await page.reload();
      await page.getByRole("tab", { name: "About Me" }).click();
      assert.equal(
        await page
          .getByLabel("Why are you interested in this role?")
          .inputValue(),
        "I enjoy building reliable user-facing products.",
      );
      await page.getByRole("tab", { name: "Settings" }).click();
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
          }),
        ),
      });
      await page.getByText(/Contains 1 jobs, 1 resumes/).waitFor();
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
      assert.equal(persisted.profileAudits.length, 1);
      assert.ok(
        persisted.jobs.some(
          (job) =>
            job.status === "interview" &&
            job.notes.some((note) => note.text === "E2E tracker note"),
        ),
      );
      assert.equal(persisted.gigs[0].title, "Review an AI resume workflow");
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
        ["Submission Queue", "Submission Queue"],
        ["ATS Resume", "ATS Resume"],
        ["Cover Letter", "Cover Letters"],
        ["Job Tracker", "Job Tracker"],
        ["Outreach", "Outreach"],
        ["LinkedIn Audit", "LinkedIn Profile Audit"],
        ["Gigs", "Gigs"],
        ["AI Coach", "Hi, I'm AI Coach!"],
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
