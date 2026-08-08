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

      await page.getByRole("button", { name: "Infinite Hunting" }).click();
      await page.getByRole("heading", { name: "Infinite Hunting" }).waitFor();
      await assertAccessible(page, "Infinite Hunting");
      await page
        .getByLabel("Generate an optimized resume for each job")
        .check();
      await page.getByRole("button", { name: "Move Indeed up" }).click();
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
      await assertAccessible(page, "All Runs");

      await page.getByRole("button", { name: "ATS Resume" }).click();
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
      await assertAccessible(page, "ATS Resume");

      await page.locator('button[title="Submission Queue"]').click();
      await page.getByRole("tab", { name: /Search Jobs/ }).click();
      await page.getByRole("button", { name: "Prepare application" }).click();
      const checklist = page.locator(".packet input[type=checkbox]");
      await checklist.first().waitFor();
      await assertAccessible(page, "Submission Queue");
      const checklistCount = await checklist.count();
      assert.ok(checklistCount > 0, "submission checklist should be visible");
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
      await page.reload();
      await page.locator('button[title="Submission Queue"]').click();
      await page.getByRole("button", { name: "Mark submitted" }).click();
      await page
        .getByRole("heading", { name: "Your queue is clear" })
        .waitFor();

      await page.getByRole("button", { name: "Cover Letter" }).click();
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/cover-letters") &&
            response.request().method() === "POST" &&
            response.ok(),
        ),
        page.getByRole("button", { name: "Create Cover Letter" }).click(),
      ]);
      await page.getByLabel("Cover letter title").fill("E2E product letter");
      await page
        .getByLabel("Cover letter content")
        .fill(
          "Dear hiring team,\n\nI shipped measurable product improvements.",
        );
      await page.getByRole("button", { name: "Save changes" }).click();
      await page.getByText("E2E product letter").first().waitFor();
      await assertAccessible(page, "Cover Letters");

      await page.getByRole("button", { name: "Job Tracker" }).click();
      await page.getByLabel("Job status").selectOption("interview");
      await page.getByLabel("Private job note").fill("E2E tracker note");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByText("E2E tracker note").waitFor();
      await assertAccessible(page, "Job Tracker");

      await page.getByRole("button", { name: "LinkedIn Audit" }).click();
      await page
        .getByLabel("About section")
        .fill(
          "I build customer-facing products and improved conversion by 42% through measurable experiments.",
        );
      await page.getByRole("button", { name: "Run private audit" }).click();
      await page.locator(".audit-score").waitFor();
      await assertAccessible(page, "LinkedIn Audit");

      await page.getByRole("button", { name: "Outreach" }).click();
      await page.getByRole("button", { name: "Collect contacts" }).click();
      const subject = page.getByLabel("Subject");
      await subject.fill("E2E persisted outreach subject");
      await page.getByRole("button", { name: "Save locally" }).click();

      await page.reload();
      await page.getByRole("button", { name: "Outreach" }).click();
      await page.getByText("E2E persisted outreach subject").first().waitFor();
      await assertAccessible(page, "Outreach");

      await page.getByRole("button", { name: "AI Coach" }).click();
      await page
        .getByRole("button", { name: "Help me prepare for an interview" })
        .click();
      await page.getByText(/start by grounding your answer/).waitFor();
      await assertAccessible(page, "AI Coach");
      await page.reload();
      await page.getByRole("button", { name: "AI Coach" }).click();
      await page
        .getByText("Help me prepare for an interview", { exact: true })
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
      await assertAccessible(page, "Gigs");

      await page.locator('[title="Profile and settings"]').click();
      await page
        .getByRole("heading", { name: "Profile & preferences" })
        .waitFor();
      await assertAccessible(page, "Profile and preferences");
      await page.locator('[title="Data and privacy"]').click();
      await page.getByRole("heading", { name: "Settings & data" }).waitFor();
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
      assert.equal(persisted.resumes[0].name, "E2E tailored resume");
      assert.equal(persisted.submissions[0].status, "submitted");
      assert.equal(persisted.coverLetters[0].title, "E2E product letter");
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
      await mobile.getByRole("button", { name: "Job Board" }).click();
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
