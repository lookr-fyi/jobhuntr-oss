import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const chromePath =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

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
      browser = await chromium.launch({
        executablePath: chromePath,
        headless: true,
      });
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      });
      await page.goto(baseUrl);

      await page.getByRole("button", { name: "Use demo profile" }).click();
      await page.getByRole("heading", { name: /Welcome back/ }).waitFor();

      await page.getByRole("button", { name: "Infinite Hunting" }).click();
      await page.getByRole("heading", { name: "Infinite Hunting" }).waitFor();
      await page.getByRole("button", { name: "Start infinite hunt" }).click();
      await page.getByText(/eligible matches/).waitFor();
      await page.getByRole("heading", { name: "Run history" }).waitFor();

      await page.getByRole("button", { name: "All Runs" }).click();
      await page.getByRole("heading", { name: "All Runs" }).waitFor();
      await page
        .locator(".v2-run-row .pill", { hasText: "Completed" })
        .waitFor();

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

      await page.getByRole("button", { name: "Submission Queue" }).click();
      await page.getByRole("button", { name: "Add to queue" }).click();
      const checklist = page.locator(".packet input[type=checkbox]");
      await checklist.first().waitFor();
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
      await page.getByRole("button", { name: "Submission Queue" }).click();
      await page.getByRole("button", { name: "Mark submitted" }).click();
      await page
        .getByRole("heading", { name: "Your queue is clear" })
        .waitFor();

      await page.getByRole("button", { name: "Outreach" }).click();
      await page.getByRole("button", { name: "Collect contacts" }).click();
      const subject = page.getByLabel("Subject");
      await subject.fill("E2E persisted outreach subject");
      await page.getByRole("button", { name: "Save locally" }).click();

      await page.reload();
      await page.getByRole("button", { name: "Outreach" }).click();
      await page.getByText("E2E persisted outreach subject").first().waitFor();

      const persisted = JSON.parse(
        await fs.readFile(path.join(dataDir, "jobhuntr.json"), "utf8"),
      );
      assert.equal(persisted.agentRuns.length, 1);
      assert.equal(persisted.resumes[0].name, "E2E tailored resume");
      assert.equal(persisted.submissions[0].status, "submitted");
      assert.equal(
        persisted.outreachDrafts[0].subject,
        "E2E persisted outreach subject",
      );
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
