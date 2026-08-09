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

const assertNamedFormControls = async (page, surface) => {
  const unnamed = await page
    .locator(
      "input:not([id]):not([name]), select:not([id]):not([name]), textarea:not([id]):not([name])",
    )
    .evaluateAll((elements) =>
      elements.map((element) => element.outerHTML.slice(0, 240)),
    );
  assert.deepEqual(
    unnamed,
    [],
    `${surface} controls should be identifiable to Chrome and autofill`,
  );
};

test(
  "a user can onboard, hunt, inspect runs, and persist outreach through the real UI",
  { timeout: 120_000 },
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
      await recoveryPage
        .getByRole("button", { name: "Use demo profile" })
        .click();
      await recoveryPage
        .getByRole("heading", { name: /Welcome back/ })
        .waitFor();
      const demoProfile = await recoveryPage.evaluate(async () => {
        const response = await fetch("/api/state");
        return (await response.json()).profile;
      });
      assert.equal(demoProfile.onboarded, true);
      assert.match(
        demoProfile.resumeText,
        /improved activation by 32%/i,
        "the demo shortcut must create a complete, workflow-ready synthetic resume",
      );
      await recoveryPage.evaluate(async () => {
        await fetch("/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ onboarded: false }),
        });
      });
      await recoveryContext.close();

      const desktopContext = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        permissions: ["clipboard-read", "clipboard-write"],
      });
      const unexpectedNetworkRequests = [];
      desktopContext.on("request", (request) => {
        const url = new URL(request.url());
        if (
          url.origin !== baseUrl &&
          !["data:", "blob:"].includes(url.protocol)
        )
          unexpectedNetworkRequests.push(request.url());
      });
      const page = await desktopContext.newPage();
      const runtimeErrors = [];
      page.on("pageerror", (error) =>
        runtimeErrors.push(`${error.message} at ${page.url()}`),
      );
      await page.goto(baseUrl);
      await page.locator(".app").waitFor();

      const shellStyle = await page.evaluate(() => {
        const bodyStyle = getComputedStyle(document.body);
        const appStyle = getComputedStyle(document.querySelector(".app"));
        const probe = document.createElement("div");
        probe.style.width = "100px";
        probe.style.padding = "10px";
        document.body.append(probe);
        const probeWidth = probe.getBoundingClientRect().width;
        probe.remove();
        const resetProbe = document.createElement("h4");
        document.body.append(resetProbe);
        const resetProbeStyle = getComputedStyle(resetProbe);
        const resetGeometry = {
          margin: resetProbeStyle.margin,
          padding: resetProbeStyle.padding,
        };
        resetProbe.remove();
        return {
          bodyFontSize: bodyStyle.fontSize,
          bodyFontWeight: bodyStyle.fontWeight,
          appWidth: appStyle.width,
          appHeight: appStyle.height,
          appOverflow: appStyle.overflow,
          probeWidth,
          resetGeometry,
        };
      });
      assert.deepEqual(
        shellStyle,
        {
          bodyFontSize: "11px",
          bodyFontWeight: "400",
          appWidth: "1440px",
          appHeight: "1000px",
          appOverflow: "hidden",
          probeWidth: 100,
          resetGeometry: { margin: "0px", padding: "0px" },
        },
        "the rendered shell should retain the authoritative v2 density and border-box geometry",
      );

      assert.equal(
        await page
          .locator('button[title="Submission Queue"]')
          .getAttribute("aria-label"),
        "Submission Queue",
        "a collapsed navigation badge must not replace the Submission Queue accessible name",
      );

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
        name: "Setup step 1 of 4",
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

      await page.getByRole("button", { name: "Set up my workspace" }).click();
      await page
        .getByRole("heading", { name: "What are you looking for?" })
        .waitFor();
      await assertNamedFormControls(page, "Onboarding role setup");
      await page.getByLabel("Your name").fill("E2E Job Hunter");
      await page.getByLabel("Primary target role").fill("Product Engineer");
      await page.getByLabel("Home location").fill("San Francisco, CA");
      await page.getByRole("button", { name: /Continue/ }).click();
      await page
        .getByRole("heading", { name: "Show us your strengths" })
        .waitFor();
      await assertNamedFormControls(page, "Onboarding skills setup");
      await page
        .getByLabel("Skills, comma-separated")
        .fill("React, TypeScript, Product strategy");
      await page.getByRole("button", { name: /Continue/ }).click();
      await page
        .getByRole("heading", { name: "Add your resume privately" })
        .waitFor();
      await assertNamedFormControls(page, "Onboarding resume setup");
      await page
        .getByLabel("Resume text")
        .fill(
          "Product engineer with nine years of React and TypeScript delivery. Increased activation by 42 percent and led accessible platform launches across three teams.",
        );
      await page.getByRole("button", { name: /Continue/ }).click();
      await page
        .getByRole("heading", { name: "Set your search preferences" })
        .waitFor();
      await assertNamedFormControls(page, "Onboarding preference setup");
      await page.getByLabel("Preferred locations").fill("Remote, California");
      await page.getByLabel("Minimum salary").fill("150000");
      await page.getByLabel("Weekly application goal").fill("7");
      await page
        .getByRole("button", { name: "Open my command center" })
        .click();
      await page.getByRole("heading", { name: /Welcome back/ }).waitFor();
      await page
        .getByRole("heading", { level: 1, name: /Welcome back/ })
        .waitFor();
      await page
        .getByRole("heading", { level: 2, name: "Pipeline over time" })
        .waitFor();
      await page
        .getByRole("heading", {
          level: 2,
          name: /Top Contributors of/,
        })
        .waitFor();
      assert.equal(
        await page.locator("main").getAttribute("aria-hidden"),
        null,
      );
      await assertNamedFormControls(page, "Overview");
      const overviewGeometry = await page
        .locator(".v2-overview")
        .evaluate(() => {
          const values = (selector) =>
            getComputedStyle(document.querySelector(selector));
          const overview = values(".v2-overview");
          const hero = values(".v2-overview-hero");
          const heading = values(".v2-overview-hero h1");
          const momentum = values(".v2-momentum");
          const momentumCopy = values(".v2-momentum b");
          const top = values(".v2-overview-top");
          const kpi = values(".v2-kpi");
          const chart = values(".v2-overview-card");
          return {
            overviewGap: overview.gap,
            heroGap: hero.gap,
            heroPadding: hero.padding,
            heroRadius: hero.borderRadius,
            headingSize: heading.fontSize,
            momentumGap: momentum.gap,
            momentumMarginTop: momentum.marginTop,
            momentumPadding: momentum.padding,
            momentumSize: momentumCopy.fontSize,
            topGap: top.gap,
            topMarginBottom: top.marginBottom,
            kpiGap: kpi.gap,
            kpiPadding: kpi.padding,
            kpiRadius: kpi.borderRadius,
            kpiBackground: kpi.backgroundColor,
            chartRadius: chart.borderRadius,
            chartBackground: chart.backgroundColor,
          };
        });
      assert.deepEqual(
        overviewGeometry,
        {
          overviewGap: "32px",
          heroGap: "24px",
          heroPadding: "32px",
          heroRadius: "24px",
          headingSize: "19.25px",
          momentumGap: "4px",
          momentumMarginTop: "-16px",
          momentumPadding: "24px",
          momentumSize: "12.65px",
          topGap: "32px",
          topMarginBottom: "32px",
          kpiGap: "8px",
          kpiPadding: "24px",
          kpiRadius: "20px",
          kpiBackground: "rgb(248, 250, 252)",
          chartRadius: "24px",
          chartBackground: "rgb(248, 250, 252)",
        },
        "Overview should retain the authoritative v2 card density and geometry",
      );
      assert.deepEqual(
        await page
          .getByRole("button", { name: "Start Infinite Hunt" })
          .evaluate((button) => {
            const style = getComputedStyle(button);
            return {
              borderRadius: style.borderRadius,
              fontSize: style.fontSize,
              fontWeight: style.fontWeight,
              padding: `${style.paddingTop} ${style.paddingRight}`,
            };
          }),
        {
          borderRadius: "8px",
          fontSize: "11px",
          fontWeight: "500",
          padding: "12px 20px",
        },
        "the command-center primary action should retain the authoritative v2 Button sizing",
      );
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
      assert.ok(
        initialMotivation.length > 30,
        "the complete momentum reminder should render on first paint",
      );
      await page.waitForTimeout(100);
      assert.equal(
        await page.locator(".v2-momentum b").innerText(),
        initialMotivation,
        "the dashboard reminder should not expose a partially typed UI state",
      );
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
      for (const [tooltip, iconClass] of [
        ["Submission Queue", "lucide-clipboard-list"],
        ["ATS Templates", "lucide-zap"],
        ["Job Tracker", "lucide-trello"],
        ["Gigs", "lucide-dollar-sign"],
        ["AI Career Coach", "lucide-message-circle"],
      ]) {
        assert.ok(
          (
            await page
              .locator(`.v2-nav button[title="${tooltip}"] svg`)
              .getAttribute("class")
          )?.includes(iconClass),
          `${tooltip} should use the authoritative v2 sidebar icon`,
        );
      }
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
      const navigationStyle = await page
        .locator('.v2-nav button[title="Overview"]')
        .evaluate((button) => {
          const style = getComputedStyle(button);
          return {
            fontSize: style.fontSize,
            paddingLeft: style.paddingLeft,
            paddingRight: style.paddingRight,
          };
        });
      assert.deepEqual(
        navigationStyle,
        { fontSize: "11px", paddingLeft: "16px", paddingRight: "16px" },
        "expanded navigation should preserve the compact v2 typography and spacing",
      );
      for (const [tooltip, label] of [
        ["Agent Runs", "All Runs"],
        ["ATS Templates", "ATS Resume"],
        ["AI Career Coach", "AI Coach"],
      ]) {
        assert.equal(
          await page
            .locator(`.v2-nav button[title="${tooltip}"] span`)
            .innerText(),
          label,
          `${tooltip} should use the authoritative expanded v2 label`,
        );
      }
      const guidance = page.getByRole("button", { name: /Getting Started/ });
      const firstGuidanceTask = page
        .locator(".v2-guidance-list button")
        .filter({ hasText: "Start Infinite Hunt" });
      await guidance.waitFor();
      assert.match(
        await guidance.innerText(),
        /\d\/6 completed/,
        "expanded v2 navigation should show live setup progress",
      );
      assert.equal(
        await guidance.getAttribute("aria-expanded"),
        "false",
        "v2 setup guidance should stay compact until requested",
      );
      await guidance.click();
      await firstGuidanceTask.waitFor();
      await guidance.click();
      await firstGuidanceTask.waitFor({ state: "hidden" });
      await guidance.click();
      await page.locator("main").hover({ position: { x: 400, y: 200 } });
      await page.locator('button[title="Job Board"]').click();
      await page.getByRole("heading", { name: "Today's Picks" }).waitFor();
      assert.match(
        page.url(),
        /#\/board/,
        "the first pointer press on collapsed desktop navigation must navigate even while the sidebar expands",
      );
      await page.locator(".v2-board-row").first().waitFor();
      await page.locator(".v2-board-detail").waitFor();
      const boardGeometry = await page
        .locator(".v2-board-page")
        .evaluate((board) => {
          const style = getComputedStyle(board);
          const mainStyle = getComputedStyle(board.parentElement);
          const searchStyle = getComputedStyle(
            board.querySelector(".v2-board-search"),
          );
          const layoutStyle = getComputedStyle(
            board.querySelector(".v2-board-layout"),
          );
          const rowStyle = getComputedStyle(
            board.querySelector(".v2-board-row"),
          );
          const detailStyle = getComputedStyle(
            board.querySelector(".v2-board-detail"),
          );
          const columns = layoutStyle.gridTemplateColumns
            .split(" ")
            .map(Number.parseFloat);
          return {
            mainPadding: mainStyle.padding,
            pagePadding: style.padding,
            pageWidth: style.width,
            pageMaxWidth: style.maxWidth,
            parentWidth: mainStyle.width,
            searchRadius: searchStyle.borderRadius,
            searchPadding: searchStyle.padding,
            columns,
            layoutGap: layoutStyle.gap,
            rowPadding: rowStyle.padding,
            rowRadius: rowStyle.borderRadius,
            detailPadding: detailStyle.padding,
            detailRadius: detailStyle.borderRadius,
          };
        });
      assert.deepEqual(
        {
          ...boardGeometry,
          pageWidth: undefined,
          pageMaxWidth: undefined,
          parentWidth: undefined,
          columns: undefined,
        },
        {
          mainPadding: "0px",
          pagePadding: "22px 27.5px",
          pageWidth: undefined,
          pageMaxWidth: undefined,
          parentWidth: undefined,
          searchRadius: "9999px",
          searchPadding: "8.25px 11px",
          columns: undefined,
          layoutGap: "16.5px",
          rowPadding: "16px",
          rowRadius: "16px",
          detailPadding: "24px",
          detailRadius: "24px",
        },
        "Job Board should retain the authoritative v2 full-width split-pane geometry",
      );
      assert.ok(
        boardGeometry.pageMaxWidth === "none" &&
          Math.abs(
            Number.parseFloat(boardGeometry.pageWidth) -
              Number.parseFloat(boardGeometry.parentWidth),
          ) < 1,
        "the Job Board should use the available desktop workspace instead of the legacy 1180px cap",
      );
      assert.ok(
        Math.abs(boardGeometry.columns[1] / boardGeometry.columns[0] - 5 / 3) <
          0.02,
        "the authoritative v2 Job Board detail pane should remain 5:3 relative to its list",
      );
      await page.locator('button[title="Overview"]').click();
      await page.getByRole("heading", { name: /Welcome back/ }).waitFor();
      assert.deepEqual(
        await page.evaluate(() => {
          const grid = document.querySelector(".v2-kpi-grid");
          const cards = [...grid.children].map((card) =>
            Math.round(card.getBoundingClientRect().top),
          );
          const gridStyle = window.getComputedStyle(grid);
          return {
            display: gridStyle.display,
            direction: gridStyle.flexDirection,
            gap: gridStyle.gap,
            verticallyStacked: cards[0] < cards[1] && cards[1] < cards[2],
            overviewGap: window.getComputedStyle(
              document.querySelector(".v2-overview-top"),
            ).gap,
          };
        }),
        {
          display: "flex",
          direction: "column",
          gap: "24px",
          verticallyStacked: true,
          overviewGap: "32px",
        },
        "Overview KPIs should use the authoritative v2 stacked desktop column",
      );
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
      await page.route("**/api/state", async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        body.meta = { ...body.meta, createdAt: "0001-01-01T00:00:00.000Z" };
        await route.fulfill({ response, json: body });
      });
      await page.reload();
      await page.getByRole("heading", { name: "Pipeline over time" }).waitFor();
      assert.ok(
        (await page.locator(".v2-chart .line.evaluated").getAttribute("d"))
          .split(/[ML]/)
          .filter(Boolean).length <= 366,
        "an extreme legacy workspace date must not create an unbounded chart",
      );
      await page.unroute("**/api/state");
      const runtimeErrorsBeforeFailedRefresh = runtimeErrors.length;
      await page.route("**/api/state", (route) => route.abort("failed"), {
        times: 1,
      });
      await page.getByRole("button", { name: "Refresh", exact: true }).click();
      await page.locator(".v2-error-toast").waitFor();
      await page
        .getByRole("button", { name: "Refresh", exact: true })
        .waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Refresh", exact: true })
          .isDisabled(),
        false,
        "a failed workspace refresh must return its control to a retryable state",
      );
      assert.equal(
        runtimeErrors.length,
        runtimeErrorsBeforeFailedRefresh,
        "a handled workspace refresh failure must not become a browser page error",
      );
      await page.getByRole("button", { name: "Dismiss error" }).click();
      const [recordedSubmissionResponse] = await Promise.all([
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
      const farewellDialog = page.getByRole("dialog", { name: "Congrats!" });
      await farewellDialog.waitFor();
      assert.equal(
        await farewellDialog
          .getByRole("button", { name: "Oops—bring me back" })
          .evaluate((button) => button === document.activeElement),
        true,
        "the farewell dialog should focus its safe return action",
      );
      await assertAccessible(page, "Overview farewell dialog");
      await page.keyboard.press("Escape");
      await farewellDialog.waitFor({ state: "hidden" });
      await page.evaluate(async () => {
        const response = await fetch("/api/infinite-hunt/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intervalMinutes: 60,
            options: {
              q: "Product Engineer",
              minFit: 60,
              workflows: ["linkedin"],
            },
          }),
        });
        if (!response.ok) throw new Error("Could not prepare farewell test");
      });
      await page.reload();
      await page.getByRole("heading", { name: /Welcome back/ }).waitFor();
      await page.evaluate(() => {
        window.close = () => {};
        const originalSetTimeout = window.setTimeout.bind(window);
        window.setTimeout = (callback, delay, ...args) =>
          delay === 120 ? 0 : originalSetTimeout(callback, delay, ...args);
      });
      await page.getByRole("button", { name: /I got an offer/ }).click();
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/infinite-hunt/stop") && response.ok(),
        ),
        farewellDialog.getByRole("button", { name: "Bye" }).click(),
      ]);
      assert.equal(
        await page.evaluate(async () => {
          const response = await fetch("/api/state");
          return (await response.json()).infiniteHunt.enabled;
        }),
        false,
        "farewell must stop background hunting before closing JobHuntr",
      );
      await page.reload();
      await page.getByRole("heading", { name: /Welcome back/ }).waitFor();

      await page.locator('button[title="ATS Templates"]').click();
      await page
        .getByText("Generate a resume manually", { exact: true })
        .click();
      const initialResume = page.getByLabel("Resume content");
      await initialResume.waitFor();
      await initialResume.fill("");
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

      await page.evaluate(() =>
        localStorage.setItem(
          "jobhuntr-infinite-workflows",
          JSON.stringify(["linkedin", "retired-job-board", "indeed", "indeed"]),
        ),
      );
      await page
        .getByRole("button", { name: "Infinite Hunting", exact: true })
        .click();
      await page.getByRole("heading", { name: "Infinite Hunting" }).waitFor();
      assert.deepEqual(
        await page.locator(".v2-hunt-intro").evaluate((intro) => {
          const heading = getComputedStyle(intro.querySelector("h2"));
          const page = intro.closest(".v2-hunt-page");
          const pageStyle = getComputedStyle(page);
          return {
            headingFontSize: heading.fontSize,
            headingFontWeight: heading.fontWeight,
            headingMarginBottom: heading.marginBottom,
            mainPadding: getComputedStyle(page.parentElement).padding,
            pagePadding: pageStyle.padding,
            pageMaxWidth: pageStyle.maxWidth,
            pageGap: pageStyle.gap,
            introWidth: getComputedStyle(intro).width,
            builderWidth: getComputedStyle(
              page.querySelector(".v2-hunt-builder"),
            ).width,
          };
        }),
        {
          headingFontSize: "17.875px",
          headingFontWeight: "600",
          headingMarginBottom: "8px",
          mainPadding: "0px",
          pagePadding: "32px 0px 48px",
          pageMaxWidth: "none",
          pageGap: "24px",
          introWidth: "960px",
          builderWidth: "840px",
        },
        "Infinite Hunting should retain the authoritative v2 heading dimensions",
      );
      await page.setViewportSize({ width: 1440, height: 480 });
      assert.equal(
        await page.evaluate(() => {
          const main = document.querySelector("main");
          main.scrollTo(0, main.scrollHeight);
          return main.scrollTop > 0;
        }),
        true,
        "the Infinite Hunting fixture must be tall enough to exercise route scroll restoration",
      );
      await page.locator('button[title="Job Board"]').click();
      await page.getByRole("heading", { name: "Today's Picks" }).waitFor();
      assert.equal(
        await page.locator("main").evaluate((main) => main.scrollTop),
        0,
        "sidebar navigation must open every destination at its top edge",
      );
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.locator('button[title="Infinite Hunting"]').click();
      await page.getByRole("heading", { name: "Infinite Hunting" }).waitFor();
      assert.equal(
        await page.locator(".v2-loop-row").count(),
        2,
        "obsolete and duplicate saved workflows should recover without crashing Infinite Hunt",
      );
      assert.deepEqual(
        await page.evaluate(() =>
          JSON.parse(localStorage.getItem("jobhuntr-infinite-workflows")),
        ),
        ["linkedin", "indeed"],
        "the repaired workflow order should persist for the next launch",
      );
      const platformLogos = page.locator(".v2-workflow-grid img");
      assert.equal(await platformLogos.count(), 10);
      await page.waitForFunction(() =>
        [...document.querySelectorAll(".v2-workflow-grid img")].every(
          (image) => image.complete && image.naturalWidth > 0,
        ),
      );
      assert.equal(
        await platformLogos.evaluateAll((images) =>
          images.every((image) => image.complete && image.naturalWidth > 0),
        ),
        true,
        "Infinite Hunt should render every authoritative platform logo",
      );
      await assertAccessible(page, "Infinite Hunting");
      await assertNamedFormControls(page, "Infinite Hunting");
      await page
        .getByLabel("Generate an optimized resume for each job")
        .check();
      await page.getByRole("button", { name: "Move Indeed up" }).click();
      await page
        .locator("details.v2-hunt-filters")
        .evaluate((details) => (details.open = true));
      const presetRoleBeforeRace = await page
        .getByLabel("Role or keywords")
        .inputValue();
      await page
        .getByLabel("Exclude keywords")
        .fill("government-clearance-only");
      await page.locator('button[title="Job Board"]').click();
      await page.locator('button[title="Infinite Hunting"]').click();
      await page
        .getByText("Unsaved Infinite Hunt configuration restored.", {
          exact: true,
        })
        .waitFor();
      await page
        .locator("details.v2-hunt-filters")
        .evaluate((details) => (details.open = true));
      assert.equal(
        await page.getByLabel("Exclude keywords").inputValue(),
        "government-clearance-only",
        "Infinite Hunt search configuration should recover after navigation",
      );
      assert.deepEqual(
        await page.locator(".v2-loop-row strong").allTextContents(),
        ["Indeed", "LinkedIn Jobs"],
        "the recovered hunt draft should retain workflow order",
      );
      let workflowDragData = await page.evaluateHandle(
        () => new DataTransfer(),
      );
      await page
        .locator(".v2-loop-row", { hasText: "Indeed" })
        .locator(".v2-loop-drag-handle")
        .dispatchEvent("dragstart", { dataTransfer: workflowDragData });
      await page
        .locator(".v2-loop-row", { hasText: "LinkedIn Jobs" })
        .locator(".v2-loop-drag-handle")
        .dispatchEvent("drop", { dataTransfer: workflowDragData });
      assert.deepEqual(
        await page.locator(".v2-loop-row strong").allTextContents(),
        ["LinkedIn Jobs", "Indeed"],
        "Infinite Hunt workflows should support the authoritative drag ordering interaction",
      );
      assert.equal(
        await page
          .locator(".v2-loop-box .sr-only[role='status']")
          .textContent(),
        "Indeed moved to position 2.",
      );
      workflowDragData = await page.evaluateHandle(() => new DataTransfer());
      await page
        .locator(".v2-loop-row", { hasText: "Indeed" })
        .locator(".v2-loop-drag-handle")
        .dispatchEvent("dragstart", { dataTransfer: workflowDragData });
      await page
        .locator(".v2-loop-row", { hasText: "LinkedIn Jobs" })
        .locator(".v2-loop-drag-handle")
        .dispatchEvent("drop", { dataTransfer: workflowDragData });
      assert.deepEqual(
        await page.locator(".v2-loop-row strong").allTextContents(),
        ["Indeed", "LinkedIn Jobs"],
      );
      assert.equal(
        await page
          .getByLabel("Generate an optimized resume for each job")
          .isChecked(),
        true,
        "the recovered hunt draft should retain resume optimization",
      );
      await page
        .locator("details.v2-hunt-filters")
        .evaluate((details) => (details.open = true));
      let presetSaveCount = 0;
      await page.route("**/api/hunt-presets", async (route) => {
        presetSaveCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 250));
        await route.continue();
      });
      const delayedPresetSave = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/hunt-presets") &&
          response.request().method() === "POST" &&
          response.ok(),
      );
      await page.getByRole("button", { name: "Save as preset" }).click();
      await page.getByRole("button", { name: "Saving preset…" }).waitFor();
      await page
        .getByLabel("Role or keywords")
        .fill("Newer unsaved hunt configuration");
      await delayedPresetSave;
      await page.getByRole("button", { name: "Save as preset" }).waitFor();
      assert.equal(presetSaveCount, 1);
      assert.equal(
        await page.getByText("Preset saved locally").count(),
        0,
        "an older preset save must not bless newer Infinite Hunt edits",
      );
      await page.unroute("**/api/hunt-presets");
      await page.getByLabel("Role or keywords").fill(presetRoleBeforeRace);
      await page.route("**/api/agent-runs/preview", (route) => route.abort());
      await page.getByRole("button", { name: "Preview matches" }).click();
      const apiError = page.getByRole("alert");
      await apiError.getByText("Something went wrong").waitFor();
      await apiError.getByRole("button", { name: "Dismiss error" }).click();
      runtimeErrors.length = 0;
      await page.unroute("**/api/agent-runs/preview");
      await page.route("**/api/agent-runs/preview", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        await route.continue();
      });
      const locationBeforePreviewRace = await page
        .getByLabel("Location")
        .inputValue();
      const stalePreviewResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/agent-runs/preview") && response.ok(),
      );
      await page.getByRole("button", { name: "Preview matches" }).click();
      await page.getByRole("button", { name: "Previewing matches…" }).waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Previewing matches…" })
          .isDisabled(),
        true,
        "match preview should prevent duplicate submissions while pending",
      );
      await page.getByLabel("Location").fill("Newer preview location");
      await stalePreviewResponse;
      await page.getByRole("button", { name: "Preview matches" }).waitFor();
      assert.equal(
        await page.getByText(/eligible matches/).count(),
        0,
        "a preview for an older hunt configuration must not replace newer edits",
      );
      await page.getByLabel("Location").fill(locationBeforePreviewRace);
      await page.getByRole("button", { name: "Preview matches" }).click();
      await page.getByText(/eligible matches/).waitFor();
      await page.unroute("**/api/agent-runs/preview");
      let scheduleStartRequests = 0;
      await page.route("**/api/infinite-hunt/start-run", async (route) => {
        scheduleStartRequests += 1;
        await new Promise((resolve) => setTimeout(resolve, 200));
        await route.continue();
      });
      const scheduledRunResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/infinite-hunt/start-run") &&
          response.ok(),
      );
      await page
        .getByRole("button", { name: "Start infinite hunt" })
        .evaluate((button) => {
          button.click();
          button.click();
        });
      await page
        .getByLabel("Location")
        .fill("Newer location while scheduled run starts");
      const scheduledInitialRun = await (await scheduledRunResponse).json();
      assert.ok(
        scheduledInitialRun.schedule.generation,
        "atomic Infinite Hunt startup must persist a schedule generation",
      );
      assert.equal(
        scheduledInitialRun.run.status,
        "completed",
        "the same atomic response must include the completed initial run",
      );
      assert.equal(
        await page.getByText(/eligible matches/).count(),
        0,
        "a completed scheduled run must not show a preview for an older configuration",
      );
      assert.equal(
        scheduleStartRequests,
        1,
        "same-frame clicks must not create duplicate Infinite Hunt schedules",
      );
      await page.unroute("**/api/infinite-hunt/start-run");
      await page
        .getByText("Infinite Hunt is active every 60 minutes.")
        .waitFor();
      await page.route("**/api/state", async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        body.infiniteHunt = {
          ...body.infiniteHunt,
          lastError: "Scheduled hunt could not reach the local worker",
        };
        await route.fulfill({ response, json: body });
      });
      await page.reload();
      await page
        .getByText("Unsaved Infinite Hunt configuration restored.", {
          exact: true,
        })
        .waitFor();
      await page
        .locator("details.v2-hunt-filters")
        .evaluate((details) => (details.open = true));
      assert.equal(
        await page.getByLabel("Location").inputValue(),
        "Newer location while scheduled run starts",
        "starting a run must not discard configuration edits made while it was pending",
      );
      await page.getByLabel("Location").fill(locationBeforePreviewRace);
      await page
        .getByRole("alert")
        .getByText(
          "Last scheduled run failed: Scheduled hunt could not reach the local worker",
        )
        .waitFor();
      await page.unroute("**/api/state");
      await page.getByRole("heading", { name: "Run history" }).waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "View last infinite session" })
          .evaluate((button) => getComputedStyle(button).backgroundColor),
        "rgb(24, 24, 26)",
        "the v2 session action should remain a primary button",
      );
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

      await page.locator('button[title="Overview"]').click();
      await page.getByRole("heading", { name: /Welcome back/ }).waitFor();
      await page.getByRole("button", { name: "Open latest run" }).click();
      const latestRunDialog = page.locator('.v2-session-modal[role="dialog"]');
      await latestRunDialog.waitFor();
      assert.match(
        page.url(),
        /#\/runs\?run=/,
        "the v2 Overview action should deep-link directly to the latest run",
      );
      await latestRunDialog.getByRole("button", { name: "Run again" }).click();
      await latestRunDialog.waitFor({ state: "hidden" });
      await page.getByRole("heading", { name: "Infinite Hunting" }).waitFor();
      await page.getByText("Indeed", { exact: true }).last().waitFor();
      assert.deepEqual(
        await page.locator(".v2-loop-row strong").allTextContents(),
        ["Indeed", "LinkedIn Jobs"],
        "Run again should restore the original workflow order",
      );
      assert.equal(
        await page
          .getByLabel("Generate an optimized resume for each job")
          .isChecked(),
        true,
        "Run again should restore resume optimization",
      );
      await page.getByText("Search preferences").click();
      assert.equal(
        await page.getByLabel("Role or keywords").inputValue(),
        "Product Engineer",
        "Run again should restore the original search query",
      );

      await page.locator('button[title="Agent Runs"]').click();
      await page.getByRole("heading", { name: "Agent Runs" }).waitFor();
      const manualRunSwitch = page.getByRole("switch", {
        name: "Manual Only",
      });
      await manualRunSwitch.click();
      assert.equal(
        await manualRunSwitch.evaluate(
          (element) => getComputedStyle(element).backgroundColor,
        ),
        "rgb(24, 24, 26)",
        "enabled v2 switches must use the authoritative black accent instead of becoming transparent",
      );
      await manualRunSwitch.click();
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
      await page.getByLabel("Search runs").fill("Product Engineer");
      assert.equal(await page.locator(".v2-run-row").count(), 1);
      const runTrigger = page.getByRole("button", {
        name: "Product Engineer",
        exact: true,
      });
      await runTrigger.click();
      const runDialog = page.getByRole("dialog", {
        name: "Product Engineer",
      });
      await runDialog.waitFor();
      await runDialog
        .getByRole("heading", { name: "Product Engineer", level: 2 })
        .waitFor();
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
          .getByRole("button", { name: "Delete run" })
          .evaluate((button) => button === document.activeElement),
        true,
        "Tab should wrap to the first visible action within run details",
      );
      await runDialog
        .getByRole("heading", { name: "Workflow progress", level: 3 })
        .waitFor();
      await runDialog
        .getByRole("heading", { name: "Matched jobs", level: 3 })
        .waitFor();
      await page.keyboard.press("Escape");
      await runDialog.waitFor({ state: "hidden" });
      assert.equal(
        await runTrigger.evaluate(
          (button) => button === document.activeElement,
        ),
        true,
        "run details should restore focus to the selected run",
      );
      const runActions = page.getByRole("button", {
        name: "Actions for Product Engineer",
      });
      await runActions.click();
      const deleteRunMenuItem = page.getByRole("menuitem", { name: "Delete" });
      await page.waitForFunction(
        () => document.activeElement?.getAttribute("role") === "menuitem",
      );
      assert.equal(
        await deleteRunMenuItem.evaluate(
          (menuitem) => menuitem === document.activeElement,
        ),
        true,
        "opening run actions should move focus into the menu",
      );
      await page.keyboard.press("Escape");
      assert.equal(
        await runActions.evaluate(
          (button) => button === document.activeElement,
        ),
        true,
        "closing run actions should restore focus to its trigger",
      );
      const runState = await (
        await page.request.get(`${baseUrl}/api/state`)
      ).json();
      const linkedRunId = runState.agentRuns[0].id;
      await page.goto(`${baseUrl}/#/runs?run=${linkedRunId}`);
      const linkedRunDialog = page.getByRole("dialog", {
        name: "Product Engineer",
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
      const newRunTrigger = page.getByRole("button", { name: "New Run" });
      await newRunTrigger.click();
      const newRunDialog = page.getByRole("dialog", {
        name: "Create New Agent Run",
      });
      await newRunDialog.waitFor();
      await newRunDialog
        .getByRole("heading", { name: "Create New Agent Run", level: 2 })
        .waitFor();
      await assertNamedFormControls(page, "Agent Runs and new-run dialog");
      assert.equal(
        await newRunDialog
          .getByRole("button", { name: "Close", exact: true })
          .evaluate((button) => button === document.activeElement),
        true,
        "new-run dialogs should focus a visible close action",
      );
      await newRunDialog
        .getByRole("radio", { name: /Glassdoor Auto Search/ })
        .click();
      await page.keyboard.press("ArrowRight");
      const hiringCafeTemplate = newRunDialog.getByRole("radio", {
        name: /HiringCafe Auto Search/,
      });
      assert.equal(
        await hiringCafeTemplate.getAttribute("aria-checked"),
        "true",
      );
      assert.equal(
        await hiringCafeTemplate.evaluate(
          (template) => template === document.activeElement,
        ),
        true,
        "run templates should support conventional radio-group arrow navigation",
      );
      await page.keyboard.press("ArrowLeft");
      assert.equal(
        await newRunDialog
          .getByRole("radio", { name: /Glassdoor Auto Search/ })
          .locator("small")
          .evaluate((description) => getComputedStyle(description).color),
        "rgb(71, 85, 105)",
        "selected run templates should retain WCAG AA description contrast",
      );
      await newRunDialog.getByLabel("Run Name").fill("Frontend Engineer");
      await newRunDialog.getByLabel("Generate ATS-optimized resumes").check();
      await newRunDialog.getByRole("button", { name: "Cancel" }).click();
      await newRunDialog.waitFor({ state: "hidden" });
      assert.equal(
        await newRunTrigger.evaluate(
          (button) => button === document.activeElement,
        ),
        true,
        "closing a new-run dialog should restore focus to its trigger",
      );
      await newRunTrigger.click();
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
      await page.locator('button[title="Agent Runs"]').click();
      await page.getByRole("heading", { name: "Agent Runs" }).waitFor();
      assert.deepEqual(
        await page.locator(".v2-runs-page").evaluate((runsPage) => {
          const style = (selector) =>
            getComputedStyle(runsPage.querySelector(selector));
          const pageStyle = getComputedStyle(runsPage);
          const mainStyle = getComputedStyle(runsPage.parentElement);
          return {
            mainPadding: mainStyle.padding,
            pagePadding: pageStyle.padding,
            pageMaxWidth: pageStyle.maxWidth,
            titleFontSize: style(".v2-page-intro h1").fontSize,
            titleFontWeight: style(".v2-page-intro h1").fontWeight,
            introPaddingBottom: style(".v2-page-intro").paddingBottom,
            searchWidth: style(".v2-runs-toolbar .searchbox").width,
            searchPadding: style(".v2-runs-toolbar input").padding,
            searchRadius: style(".v2-runs-toolbar input").borderRadius,
            latestPadding: style(".v2-open-latest-run").padding,
            latestFontSize: style(".v2-open-latest-run").fontSize,
            latestBackground: style(".v2-open-latest-run").backgroundColor,
            newRunPadding: style(".v2-new-run-button").padding,
            newRunFontSize: style(".v2-new-run-button").fontSize,
            newRunBackground: style(".v2-new-run-button").backgroundColor,
            tableRadius: style(".v2-runs-table").borderRadius,
            tableRowPadding: style(".v2-run-row").padding,
          };
        }),
        {
          mainPadding: "0px",
          pagePadding: "24px",
          pageMaxWidth: "1400px",
          titleFontSize: "22px",
          titleFontWeight: "700",
          introPaddingBottom: "16px",
          searchWidth: "400px",
          searchPadding: "8px 12px 8px 36px",
          searchRadius: "6px",
          latestPadding: "12px 20px",
          latestFontSize: "11px",
          latestBackground: "rgb(255, 255, 255)",
          newRunPadding: "8px 16px",
          newRunFontSize: "11px",
          newRunBackground: "rgb(37, 99, 235)",
          tableRadius: "8px",
          tableRowPadding: "12px 16px",
        },
        "Agent Runs should retain the authoritative v2 header and control dimensions",
      );
      await assertNamedFormControls(page, "Agent Runs");
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
      await assertNamedFormControls(page, "Job Board filters");
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
      await page.getByText(/opportunit(?:y|ies)$/).waitFor();
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
      const boardSearch = page.getByLabel("Search jobs");
      await boardSearch.fill("Northstar");
      await page.getByText("1 opportunity").waitFor();
      await page
        .getByRole("button", { name: /Frontend Platform Engineer/ })
        .waitFor();
      assert.equal(
        await page.locator(".v2-board-row").count(),
        1,
        "v2 Job Board search should filter the loaded feed as the user types",
      );
      await page.getByRole("button", { name: "Clear search" }).click();
      await page.getByText("4 opportunities").waitFor();
      await page
        .locator(".v2-board-row")
        .filter({ hasNotText: "Saved" })
        .first()
        .click();
      await page.getByRole("button", { name: "Queue", exact: true }).waitFor();
      const stateBeforeBoardQueue = await (
        await page.request.get(`${baseUrl}/api/state`)
      ).json();
      const atomicQueueResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/board/queue") &&
          response.request().method() === "POST" &&
          response.ok(),
      );
      await page.getByRole("button", { name: "Queue", exact: true }).click();
      const queuedBoardPacket = await (await atomicQueueResponse).json();
      assert.equal(
        queuedBoardPacket.submission.jobId,
        queuedBoardPacket.job.id,
      );
      const stateAfterBoardQueue = await (
        await page.request.get(`${baseUrl}/api/state`)
      ).json();
      assert.equal(
        stateAfterBoardQueue.jobs.filter(
          (job) => job.url === queuedBoardPacket.job.url,
        ).length,
        1,
        "the real Job Board Queue action should persist one deduplicated job",
      );
      assert.equal(
        stateAfterBoardQueue.submissions.filter(
          (submission) => submission.jobId === queuedBoardPacket.job.id,
        ).length,
        1,
        "the same atomic action should persist exactly one application packet",
      );
      if (
        stateBeforeBoardQueue.jobs.some(
          (job) => job.id === queuedBoardPacket.job.id,
        )
      ) {
        await page.request.post(`${baseUrl}/api/submissions/archive`, {
          data: { ids: [queuedBoardPacket.submission.id] },
        });
      } else {
        await page.request.delete(
          `${baseUrl}/api/jobs/${queuedBoardPacket.job.id}`,
        );
      }
      await page.reload();
      await page.getByRole("heading", { name: "Today's Picks" }).waitFor();
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
      assert.equal(
        await page.getByText("Invalid Date", { exact: true }).count(),
        0,
        "jobs without source timestamps must never render a broken date",
      );
      await assertNamedFormControls(page, "Job Board");
      await assertAccessible(page, "Job Board");

      await page.locator('button[title="ATS Templates"]').click();
      await page
        .getByRole("heading", { name: "ATS Resume Templates" })
        .waitFor();
      assert.deepEqual(
        await page.locator("section.resume-studio").evaluate((root) => {
          const style = (selector) =>
            getComputedStyle(root.querySelector(selector));
          const heading = style(".v2-ats-header h2");
          const create = style(".v2-ats-create-button");
          const searchbox = style(".v2-template-toolbar .searchbox");
          const search = style(".v2-template-toolbar input");
          const activeSort = style(
            '.v2-template-toolbar button.secondary[aria-pressed="true"]',
          );
          const main = getComputedStyle(root.parentElement);
          const rootStyle = getComputedStyle(root);
          const templates = style(".v2-resume-templates");
          const card = style(".v2-resume-templates > div");
          const select = style(".v2-template-select");
          const preview = style(".v2-template-preview");
          return {
            page: [
              main.padding,
              rootStyle.padding,
              rootStyle.backgroundColor,
              rootStyle.maxWidth,
            ],
            heading: [heading.fontSize, heading.fontWeight],
            create: [
              create.paddingTop,
              create.paddingRight,
              create.borderRadius,
              create.fontSize,
              create.fontWeight,
            ],
            searchboxWidth: searchbox.width,
            search: [search.padding, search.borderRadius, search.fontSize],
            activeSort: [
              activeSort.padding,
              activeSort.backgroundColor,
              activeSort.fontSize,
            ],
            templates: [templates.gap, card.borderRadius],
            template: [select.padding, preview.borderRadius],
          };
        }),
        {
          page: ["0px", "20px", "rgb(249, 250, 251)", "none"],
          heading: ["17.875px", "600"],
          create: ["12px", "20px", "6px", "11px", "500"],
          searchboxWidth: "400px",
          search: ["8px 8px 8px 40px", "6px", "10.3125px"],
          activeSort: ["4px 8px", "rgb(243, 244, 246)", "10.3125px"],
          templates: ["16px", "8px"],
          template: ["16px 16px 48px", "6px"],
        },
        "ATS template controls should retain the authoritative v2 dimensions",
      );
      await page.getByRole("button", { name: "Create New Template" }).click();
      const templateDialog = page.getByRole("dialog", {
        name: "Create New Template",
      });
      assert.deepEqual(
        await templateDialog
          .locator(".v2-template-modal-content")
          .evaluate((content) => {
            const bounds = content.getBoundingClientRect();
            return {
              x: bounds.x,
              y: bounds.y,
              width: bounds.width,
              height: bounds.height,
              radius: getComputedStyle(content).borderRadius,
              shadow: getComputedStyle(content).boxShadow,
            };
          }),
        {
          x: 64,
          y: 0,
          width: 1376,
          height: 1000,
          radius: "0px",
          shadow: "none",
        },
        "the ATS wizard should replace the route content like v2 instead of floating as a desktop card",
      );
      await templateDialog
        .getByRole("heading", { name: /New ATS Template -/ })
        .waitFor();
      assert.equal(
        await templateDialog
          .getByLabel("Close template editor")
          .evaluate((button) => button === document.activeElement),
        true,
        "the full-route wizard should focus v2's back control on entry",
      );
      assert.equal(
        await templateDialog.evaluate((dialog) => {
          const progress = dialog
            .querySelector(".v2-template-progress")
            .getBoundingClientRect();
          const footer = dialog
            .querySelector(".v2-template-modal-actions")
            .getBoundingClientRect();
          return progress.top >= footer.top && progress.bottom <= footer.bottom;
        }),
        true,
        "v2's progress indicator should live inside the desktop navigation footer",
      );
      await assertNamedFormControls(page, "ATS Resume template wizard");
      assert.equal(
        await templateDialog
          .getByRole("button", { name: "Go to template step 2: Edit Clone" })
          .isDisabled(),
        true,
        "future ATS wizard steps must not be selectable before their prerequisites are completed",
      );
      assert.deepEqual(
        await templateDialog
          .getByRole("button", { name: "Go to template step 1: Upload" })
          .evaluate((step) => {
            const circle = step.querySelector("i").getBoundingClientRect();
            return {
              direction: getComputedStyle(step).flexDirection,
              circle: [circle.width, circle.height],
            };
          }),
        { direction: "column", circle: [32, 32] },
        "ATS wizard progress should retain v2's stacked labels and 32px step circles",
      );
      assert.equal(
        await templateDialog.locator(".v2-a4-dropzone").evaluate((dropzone) => {
          const bounds = dropzone.getBoundingClientRect();
          return Math.abs(bounds.width / bounds.height - 210 / 297) < 0.01;
        }),
        true,
        "the resume uploader should retain v2's A4 page proportions",
      );
      assert.equal(
        Math.round(
          (await templateDialog.locator(".v2-a4-dropzone").boundingBox())
            .height,
        ),
        700,
        "the desktop A4 uploader should retain v2's 70vh document scale",
      );
      const templateNameInput = templateDialog.getByLabel("Template name");
      await templateNameInput.click();
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.type("E2E Leadership");
      assert.equal(
        await templateNameInput.evaluate(
          (input) => input === document.activeElement,
        ),
        true,
        "typing in the ATS wizard must not move focus to another control after state updates",
      );
      assert.equal(await templateNameInput.inputValue(), "E2E Leadership");
      await templateDialog
        .getByRole("heading", { name: "E2E Leadership", exact: true })
        .waitFor();
      await templateDialog.getByLabel("Close template editor").click();
      const discardTemplateDialog = page.getByRole("alertdialog", {
        name: "Discard template changes?",
      });
      await discardTemplateDialog.waitFor();
      await discardTemplateDialog
        .getByRole("button", { name: "Cancel" })
        .click();
      await templateDialog.waitFor();
      assert.equal(
        await templateNameInput.inputValue(),
        "E2E Leadership",
        "canceling the discard prompt should preserve the ATS wizard draft",
      );
      await page.evaluate(() => {
        window.location.hash = "#/overview";
      });
      await page.getByRole("heading", { name: /Welcome back/ }).waitFor();
      await page.locator('button[title="ATS Templates"]').click();
      await templateDialog.waitFor();
      assert.equal(
        await templateDialog.getByLabel("Template name").inputValue(),
        "E2E Leadership",
        "the ATS wizard should recover its bounded draft after route navigation",
      );
      const pdfBuilder = await page.context().newPage();
      await pdfBuilder.setContent(
        "<html><body><h1>Product Engineer</h1><p>React, TypeScript, leadership, and 40% performance gains across customer-facing products.</p></body></html>",
      );
      const resumePdf = await pdfBuilder.pdf({ format: "Letter" });
      await pdfBuilder.close();
      await templateDialog
        .getByLabel("Upload resume for ATS template")
        .setInputFiles({
          name: "empty-resume.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF-1.7\ninvalid"),
        });
      await templateDialog.getByRole("alert").waitFor();
      assert.match(await templateDialog.getByRole("alert").innerText(), /pdf/i);
      const resumeDrop = await page.evaluateHandle(
        ({ encoded }) => {
          const bytes = Uint8Array.from(atob(encoded), (character) =>
            character.charCodeAt(0),
          );
          const transfer = new DataTransfer();
          transfer.items.add(
            new File([bytes], "e2e-resume.pdf", {
              type: "application/pdf",
            }),
          );
          return transfer;
        },
        { encoded: resumePdf.toString("base64") },
      );
      await templateDialog.locator(".v2-a4-dropzone").dispatchEvent("drop", {
        dataTransfer: resumeDrop,
      });
      await templateDialog.getByText(/Resume Uploaded Successfully/).waitFor();
      await templateDialog.getByRole("button", { name: /Next/ }).click();
      await templateDialog
        .getByRole("heading", { name: "Edit Your Resume", exact: true })
        .waitFor();
      assert.equal(
        await templateDialog
          .locator(".v2-template-clone-step > header")
          .evaluate((header) => getComputedStyle(header).display),
        "block",
        "the v2 editor heading and guidance should stack instead of competing for horizontal space",
      );
      assert.equal(
        await templateDialog
          .getByRole("button", { name: "Go to template step 1: Upload" })
          .locator("svg")
          .count(),
        1,
        "completed ATS wizard steps should use v2's checkmark treatment",
      );
      assert.match(
        await templateDialog.getByLabel("Cloned resume content").inputValue(),
        /TypeScript.*40% performance gains/,
      );
      await templateDialog
        .getByLabel("Cloned resume content")
        .fill(
          "Product engineer who led React delivery and improved performance 40%.",
        );
      await templateDialog
        .getByRole("button", { name: "Preview", exact: true })
        .click();
      assert.match(
        await templateDialog
          .frameLocator('iframe[title="Resume Preview"]')
          .locator("body")
          .innerText(),
        /React delivery.*40%/,
        "the v2 preview mode should update from real editor input",
      );
      await templateDialog.getByRole("button", { name: /Next/ }).click();
      await templateDialog.getByText("Add Additional Experience").waitFor();
      const additionalExperience = templateDialog.getByLabel(
        "Additional experience and skills",
      );
      assert.equal(
        await additionalExperience.getAttribute("maxlength"),
        "2000",
        "additional experience should retain v2's 2,000-character boundary",
      );
      await templateDialog.getByText("0/2,000 characters").waitFor();
      await additionalExperience.fill(
        "Mentored five engineers and led accessibility delivery.",
      );
      await templateDialog.getByText("55/2,000 characters").waitFor();
      await templateDialog.getByRole("button", { name: /Next/ }).click();
      await templateDialog
        .getByRole("heading", { name: "Job Information" })
        .waitFor();
      await templateDialog
        .getByLabel("ATS template test job")
        .selectOption({ index: 1 });
      const testJobDescription = templateDialog.getByLabel(
        "ATS template job description",
      );
      assert.equal(await testJobDescription.getAttribute("maxlength"), "5000");
      await testJobDescription.fill(
        "Frontend engineer role requiring React, accessibility, and reliable product delivery.",
      );
      await templateDialog.getByText("85/5,000 characters").waitFor();
      await templateDialog
        .getByRole("button", { name: "Next", exact: true })
        .click();
      await templateDialog.getByText("ATS Optimization Complete").waitFor();
      await templateDialog.getByText("Original ATS score").waitFor();
      await templateDialog.getByText("ATS-ready score").waitFor();
      const comparisonScores = await templateDialog
        .locator(".v2-template-score-comparison strong")
        .allTextContents();
      assert.ok(
        Number(comparisonScores[1]) >= Number(comparisonScores[0]),
        "truthful user-provided experience must never lower the displayed ATS-ready score",
      );
      assert.match(
        await templateDialog
          .frameLocator('iframe[title="ATS-Ready Resume Preview"]')
          .locator("body")
          .innerText(),
        /Additional Experience & Skills.*Mentored five engineers/s,
        "the ATS-ready comparison must include only the user's supplied additional experience",
      );
      await templateDialog
        .getByRole("button", { name: "Go to template step 3: Enrich Exp" })
        .click();
      assert.equal(
        await templateDialog
          .getByLabel("Additional experience and skills")
          .inputValue(),
        "Mentored five engineers and led accessibility delivery.",
        "completed ATS wizard steps should be revisitable without losing work",
      );
      await templateDialog
        .getByRole("button", { name: "Go to template step 4: Test" })
        .click();
      assert.match(await testJobDescription.inputValue(), /accessibility/);
      await templateDialog
        .getByRole("button", { name: "Next", exact: true })
        .click();
      await templateDialog.getByText("ATS Optimization Complete").waitFor();
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/templates") &&
            response.request().method() === "POST" &&
            response.ok(),
        ),
        templateDialog
          .getByRole("button", { name: "Complete Template" })
          .click(),
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
      assert.deepEqual(
        await page.locator(".v2-resume-history").evaluate((root) => {
          const style = (selector) =>
            getComputedStyle(root.querySelector(selector));
          const heading = style(".v2-resume-history-head h2");
          const subtitle = style(".v2-resume-history-head p");
          const refresh = style(".v2-resume-history-head button");
          const search = style(".v2-resume-history-toolbar input");
          const filter = style(".v2-resume-history-toolbar select");
          const toggle = style(".v2-resume-history-toolbar .text-button");
          return {
            heading: [heading.fontSize, heading.fontWeight],
            subtitle: [subtitle.fontSize, subtitle.color],
            refresh: [refresh.padding, refresh.fontSize, refresh.borderRadius],
            search: [search.padding, search.fontSize, search.borderRadius],
            filter: [
              filter.padding,
              filter.fontSize,
              filter.minWidth,
              filter.width,
            ],
            toggle: [toggle.padding, toggle.fontSize, toggle.color],
          };
        }),
        {
          heading: ["17.875px", "600"],
          subtitle: ["10.3125px", "rgb(75, 85, 99)"],
          refresh: ["12px 20px", "11px", "6px"],
          search: ["8px 12px 8px 40px", "10.3125px", "6px"],
          filter: ["8px 12px", "10.3125px", "200px", "200px"],
          toggle: ["8px 12px", "11px", "rgb(37, 99, 235)"],
        },
        "generated resume history should retain the authoritative v2 control geometry",
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
      await page
        .getByLabel("Resume content")
        .fill(
          "Senior product engineer. Increased conversion by 42%. React, TypeScript, Python, and accessible design systems.",
        );
      await page
        .locator(".score", { hasText: "ATS alignment" })
        .waitFor({ state: "hidden" });
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
        .getByText(
          "No generated resumes found. Generate a resume from one of your templates to see it here.",
          { exact: true },
        )
        .waitFor();
      await page.getByLabel("Search resume history").fill("");
      assert.equal(
        await page.getByText(/Invalid Date|12\/31\/1969/).count(),
        0,
        "templates without migration timestamps must never render broken or epoch dates",
      );
      await assertNamedFormControls(page, "ATS Resume");
      await assertAccessible(page, "ATS Resume");

      await page.locator('button[title="Submission Queue"]').click();
      await page.getByText(/never submits to an external website/i).waitFor();
      assert.deepEqual(
        await page.locator(".v2-queue-page").evaluate((queue) => {
          const style = (selector) =>
            getComputedStyle(queue.querySelector(selector));
          const pageStyle = getComputedStyle(queue);
          const mainStyle = getComputedStyle(queue.parentElement);
          return {
            mainPadding: mainStyle.padding,
            pageDisplay: pageStyle.display,
            pageHeight: pageStyle.height,
            titlePadding: style(".v2-queue-title-row").padding,
            titleBorder: style(".v2-queue-title-row").borderBottomWidth,
            titleFontSize: style(".v2-queue-title-row h2").fontSize,
            titleFontWeight: style(".v2-queue-title-row h2").fontWeight,
            infoPadding: style(".v2-queue-info").padding,
            infoRadius: style(".v2-queue-info").borderRadius,
            tabPadding: style(".v2-queue-tabs button.active").padding,
            tabRadius: style(".v2-queue-tabs button.active").borderRadius,
            tabBackground: style(".v2-queue-tabs button.active")
              .backgroundColor,
            searchWidth: style(".v2-queue-tab-tools input").width,
            searchPadding: style(".v2-queue-tab-tools input").padding,
            searchRadius: style(".v2-queue-tab-tools input").borderRadius,
            listColumnWidth: Number.parseFloat(
              style(".v2-queue-layout").gridTemplateColumns,
            ),
            layoutMargin: style(".v2-queue-layout").margin,
          };
        }),
        {
          mainPadding: "0px",
          pageDisplay: "flex",
          pageHeight: "1000px",
          titlePadding: "24px 24px 20px",
          titleBorder: "1px",
          titleFontSize: "17.875px",
          titleFontWeight: "600",
          infoPadding: "16px",
          infoRadius: "12px",
          tabPadding: "8px 16px",
          tabRadius: "8px",
          tabBackground: "rgb(24, 24, 26)",
          searchWidth: "220px",
          searchPadding: "8px 12px",
          searchRadius: "6px",
          listColumnWidth: 400,
          layoutMargin: "0px 24px 24px",
        },
        "the queue command surface should retain authoritative v2 dimensions",
      );
      const applyRunsTab = page.getByRole("tab", {
        name: /From Apply Runs/,
      });
      await applyRunsTab.focus();
      await page.keyboard.press("ArrowRight");
      const searchRunsTab = page.getByRole("tab", {
        name: /From Search Runs/,
      });
      assert.equal(await searchRunsTab.getAttribute("aria-selected"), "true");
      assert.equal(
        await searchRunsTab.evaluate((tab) => tab === document.activeElement),
        true,
      );
      assert.equal(
        await page.getByRole("tabpanel").getAttribute("aria-labelledby"),
        "queue-tab-search",
      );
      assert.equal(
        await page
          .locator(".v2-queue-list > button.selected .v2-queue-job-copy small")
          .evaluate((company) => getComputedStyle(company).color),
        "rgb(71, 85, 105)",
        "selected source rows should retain WCAG AA company-name contrast",
      );
      await page.keyboard.press("Home");
      assert.equal(await applyRunsTab.getAttribute("aria-selected"), "true");
      assert.equal(
        await page.getByText(/processed in your next Infinite Hunt/i).count(),
        0,
        "the local-only queue must not claim that Infinite Hunt submits external forms",
      );
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
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes("/api/submissions/") &&
            response.request().method() === "PATCH" &&
            response.ok(),
        ),
        page
          .getByLabel("Resume attachment")
          .selectOption({ label: "E2E tailored resume" }),
      ]);
      await page.locator('button[title="ATS Templates"]').click();
      await page
        .getByRole("heading", { name: "ATS Resume Templates" })
        .waitFor();
      await page.getByLabel("Delete E2E tailored resume").click();
      const protectedResumeDialog = page.getByRole("alertdialog", {
        name: "Delete resume version?",
      });
      await protectedResumeDialog
        .getByText(/attached to 1 application packet/)
        .waitFor();
      assert.equal(
        await protectedResumeDialog
          .getByRole("button", { name: "In use" })
          .isDisabled(),
        true,
        "an application attachment cannot be deleted from the document library",
      );
      await assertAccessible(page, "Protected resume deletion");
      await protectedResumeDialog
        .getByRole("button", { name: "Cancel" })
        .click();
      await page.goto(`${baseUrl}/#/queue?packet=${linkedPacketId}`);
      await page.getByText("Application documents", { exact: true }).waitFor();
      const activeQueueState = await (
        await page.request.get(`${baseUrl}/api/state`)
      ).json();
      const activeQueueJobIds = activeQueueState.submissions
        .filter(
          (submission) =>
            !["archived", "submitted"].includes(submission.status),
        )
        .map((submission) => submission.jobId);
      assert.equal(
        await page
          .getByLabel("Tracked role")
          .locator("option")
          .evaluateAll(
            (options, queuedIds) =>
              options
                .map((option) => option.value)
                .filter(Boolean)
                .some((value) => queuedIds.includes(value)),
            activeQueueJobIds,
          ),
        false,
        "active application packets must not remain selectable for duplicate queueing",
      );
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
      await page.getByText(/3\/4 required answered/).waitFor();
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
      const terminalQueueJob = await page.request.post(`${baseUrl}/api/jobs`, {
        data: {
          company: "Closed Queue Company",
          title: "Closed Queue Role",
          source: "Search Run",
          url: "https://closed-queue.example/jobs/closed-role",
        },
      });
      assert.equal(terminalQueueJob.ok(), true);
      const terminalQueueJobBody = await terminalQueueJob.json();
      const terminalStatus = await page.request.patch(
        `${baseUrl}/api/jobs/${terminalQueueJobBody.id}`,
        { data: { status: "rejected" } },
      );
      assert.equal(terminalStatus.ok(), true);
      await page.reload();
      await page.getByRole("tab", { name: /From Search Runs/ }).waitFor();
      assert.equal(
        await page
          .locator(".v2-queue-list")
          .getByText("Closed Queue Company", { exact: true })
          .count(),
        0,
        "terminal opportunities must not remain actionable in the submission queue",
      );
      let packetCreateRequests = 0;
      await page.route("**/api/submissions", async (route) => {
        if (route.request().method() === "POST") packetCreateRequests += 1;
        await new Promise((resolve) => setTimeout(resolve, 200));
        await route.continue();
      });
      await page
        .getByRole("button", { name: "Prepare application" })
        .evaluate((button) => {
          button.click();
          button.click();
        });
      await page.getByRole("button", { name: "Preparing…" }).waitFor();
      const checklist = page.locator(".packet input[type=checkbox]");
      await checklist.first().waitFor();
      assert.equal(
        packetCreateRequests,
        1,
        "same-frame clicks must create only one application packet request",
      );
      await page.unroute("**/api/submissions");
      await assertAccessible(page, "Submission Queue");
      await assertNamedFormControls(page, "Submission Queue");
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
      await page
        .getByRole("button", { name: "Infinite Hunting", exact: true })
        .click();
      await page
        .getByText(/You have \d+ queued jobs? waiting to be reviewed/)
        .waitFor();
      await page.getByRole("button", { name: "View Submission Queue" }).click();
      await page.getByRole("heading", { name: "Submission Queue" }).waitFor();
      await page.getByText("Application documents", { exact: true }).waitFor();
      await page.getByLabel("Cover letter attachment").waitFor();
      await page.getByRole("button", { name: "Filters" }).click();
      await page.getByLabel("Minimum queue match score").selectOption("40");
      await page.getByLabel("Sort submission queue").selectOption("fit");
      const queueQuestions = page.locator(".v2-application-questions");
      const whyAnswer = queueQuestions.getByLabel(
        /Why are you interested in this role/,
      );
      const queueDeepLink = page.url();
      await page.route("**/api/submissions/*", (route) => route.abort());
      await whyAnswer.fill("The product mission matches my experience.");
      await page.goto(`${baseUrl}/#/tracker`);
      await page.goto(queueDeepLink);
      await page
        .getByText("Unsaved application answers restored for review.", {
          exact: true,
        })
        .waitFor();
      assert.equal(
        await whyAnswer.inputValue(),
        "The product mission matches my experience.",
        "an Easy Apply answer should recover when blur persistence is interrupted",
      );
      await page.unroute("**/api/submissions/*");
      const interruptedAnswerErrorDismiss = page.getByRole("button", {
        name: "Dismiss error",
      });
      if (await interruptedAnswerErrorDismiss.count())
        await interruptedAnswerErrorDismiss.click();
      const immediateVerification = queueQuestions
        .locator(".v2-question-card")
        .filter({ hasText: "Why are you interested in this role?" })
        .getByRole("checkbox");
      await page.route("**/api/submissions/*", async (route) => {
        if (route.request().method() === "PATCH")
          await new Promise((resolve) => setTimeout(resolve, 250));
        await route.continue();
      });
      const immediateVerificationResponse = page.waitForResponse(
        (response) =>
          response.url().includes("/api/submissions/") &&
          response.request().method() === "PATCH" &&
          response.ok(),
      );
      await immediateVerification.click();
      assert.equal(
        await immediateVerification.isChecked(),
        true,
        "a user must be able to type and verify an answer with one click, without waiting for a reload",
      );
      assert.equal(
        await immediateVerification.isDisabled(),
        true,
        "a pending answer verification should reject duplicate toggles",
      );
      await immediateVerificationResponse;
      await page.unroute("**/api/submissions/*");
      const salaryAnswer = queueQuestions.getByLabel(
        /What are your salary expectations/,
      );
      let delayedAnswerWriteCount = 0;
      await page.route("**/api/submissions/*", async (route) => {
        if (route.request().method() !== "PATCH") return route.continue();
        delayedAnswerWriteCount += 1;
        if (delayedAnswerWriteCount === 1)
          await new Promise((resolve) => setTimeout(resolve, 300));
        await route.continue();
      });
      await salaryAnswer.fill("Older salary answer");
      const olderAnswerResponse = page.waitForResponse(
        (response) =>
          response.url().includes("/api/submissions/") &&
          response.request().method() === "PATCH" &&
          response.ok(),
      );
      await salaryAnswer.press("Tab");
      await salaryAnswer.fill(
        "$150,000 base, depending on the complete compensation package.",
      );
      await olderAnswerResponse;
      assert.equal(
        await page.evaluate(() => {
          return Object.keys(localStorage)
            .filter((item) =>
              item.startsWith("jobhuntr-application-answer-draft:"),
            )
            .some((key) => {
              const draft = JSON.parse(localStorage.getItem(key) || "{}");
              return Object.values(draft.answers || {}).includes(
                "$150,000 base, depending on the complete compensation package.",
              );
            });
        }),
        true,
        "an older Easy Apply write must not clear a newer answer draft",
      );
      await page.unroute("**/api/submissions/*");
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
      await page.route("**/api/submissions/*", async (route) => {
        if (route.request().method() === "PATCH")
          await new Promise((resolve) => setTimeout(resolve, 250));
        await route.continue();
      });
      const availabilityQuestion = queueQuestions
        .locator(".v2-question-card")
        .filter({ hasText: "When are you available to start?" });
      const availabilitySelect = availabilityQuestion.getByLabel(
        /When are you available to start/,
      );
      const availabilityResponse = page.waitForResponse(
        (response) =>
          response.url().includes("/api/submissions/") &&
          response.request().method() === "PATCH" &&
          response.ok(),
      );
      await availabilitySelect.selectOption("Within 2 weeks");
      assert.equal(
        await availabilitySelect.inputValue(),
        "Within 2 weeks",
        "Easy Apply choice answers should remain visible while persistence is pending",
      );
      assert.equal(
        await availabilityQuestion.getByRole("checkbox").isDisabled(),
        false,
        "a selected choice should be immediately available for explicit review",
      );
      await availabilityResponse;
      await page.unroute("**/api/submissions/*");
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes("/api/submissions/") &&
            response.request().method() === "PATCH" &&
            response.ok(),
        ),
        queueQuestions.getByLabel("No", { exact: true }).click(),
      ]);
      await page.getByText(/4\/4 required answered/).waitFor();
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
        if (await verification.isChecked()) continue;
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
      await page.getByText(/4\/4 provided verified/).waitFor();
      const editedVerification = queueQuestions
        .locator(".v2-question-card")
        .filter({ hasText: "Why are you interested in this role?" })
        .getByRole("checkbox");
      await whyAnswer.fill(
        "The product mission and customer impact match my experience.",
      );
      assert.equal(
        await editedVerification.isChecked(),
        false,
        "editing a verified answer must invalidate verification immediately, before blur or reload",
      );
      await page.getByText(/3\/4 provided verified/).waitFor();
      await editedVerification.click();
      await page.getByText(/4\/4 provided verified/).waitFor();
      await page.waitForFunction(
        (checkbox) =>
          checkbox.disabled === false &&
          checkbox.getAttribute("aria-busy") === "false",
        await editedVerification.elementHandle(),
      );
      await page.waitForFunction(async (expectedAnswer) => {
        const state = await fetch(`/api/state?verify=${Date.now()}`, {
          cache: "no-store",
        }).then((response) => response.json());
        return state.submissions
          .flatMap((submission) => submission.applicationQuestions || [])
          .some(
            (question) =>
              question.answer === expectedAnswer && question.verified === true,
          );
      }, "The product mission and customer impact match my experience.");
      const verifiedPacketState = await (
        await page.request.get(`${baseUrl}/api/state`)
      ).json();
      const rapidlyVerifiedQuestion = verifiedPacketState.submissions
        .flatMap((submission) => submission.applicationQuestions || [])
        .some(
          (question) =>
            question.answer ===
              "The product mission and customer impact match my experience." &&
            question.verified === true,
        );
      assert.equal(
        rapidlyVerifiedQuestion,
        true,
        "typing, blurring, and immediately verifying must persist the final verified state in request order",
      );
      await editedVerification.dispatchEvent("pointerdown", { button: 2 });
      await page.waitForTimeout(10);
      await whyAnswer.fill(
        "  The product mission, customer impact, and role scope match my experience.  \n",
      );
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes("/api/submissions/") &&
            response.request().method() === "PATCH" &&
            response.ok(),
        ),
        whyAnswer.press("Tab"),
      ]);
      assert.equal(
        await editedVerification.isChecked(),
        false,
        "a cancelled non-primary verification press must not suppress a later answer save",
      );
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes("/api/submissions/") &&
            response.request().method() === "PATCH" &&
            response.ok(),
        ),
        editedVerification.click(),
      ]);
      assert.equal(
        await whyAnswer.inputValue(),
        "The product mission, customer impact, and role scope match my experience.",
        "verification should display the exact canonical answer persisted by the backend",
      );
      await page.route("**/api/submissions/*", async (route) => {
        if (route.request().method() === "PATCH")
          await new Promise((resolve) => setTimeout(resolve, 250));
        await route.continue();
      });
      const delayedChecklist = page.getByLabel("Review resume alignment");
      if (!(await delayedChecklist.isChecked())) {
        const delayedChecklistResponse = page.waitForResponse(
          (response) =>
            response.url().includes("/api/submissions/") &&
            response.request().method() === "PATCH" &&
            response.ok(),
        );
        await delayedChecklist.click();
        assert.equal(
          await delayedChecklist.isChecked(),
          true,
          "Easy Apply checklist progress should update immediately",
        );
        assert.equal(
          await delayedChecklist.isDisabled(),
          true,
          "a pending checklist write should reject duplicate clicks",
        );
        await delayedChecklistResponse;
        await delayedChecklist.waitFor({ state: "visible" });
      }
      await page.unroute("**/api/submissions/*");
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
      const currentResumeId = await resumeAttachment.inputValue();
      const alternateResumeId = await resumeAttachment
        .locator("option")
        .evaluateAll(
          (options, current) =>
            options.find((option) => option.value && option.value !== current)
              ?.value || "",
          currentResumeId,
        );
      assert.ok(alternateResumeId, "a second reviewed resume should exist");
      await page.route("**/api/submissions/*", async (route) => {
        if (route.request().method() === "PATCH")
          await new Promise((resolve) => setTimeout(resolve, 250));
        await route.continue();
      });
      const delayedResumeAttachment = Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes("/api/submissions/") &&
            response.request().method() === "PATCH" &&
            response.ok(),
        ),
        page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/state") &&
            response.request().method() === "GET" &&
            response.ok(),
        ),
      ]);
      await resumeAttachment.selectOption(alternateResumeId);
      assert.equal(
        await resumeAttachment.inputValue(),
        alternateResumeId,
        "a reviewed resume selection should remain visible while persistence is pending",
      );
      assert.equal(
        await resumeAttachment.isDisabled(),
        true,
        "a pending resume attachment write should reject duplicate changes",
      );
      await delayedResumeAttachment;
      await page.unroute("**/api/submissions/*");
      await page.waitForFunction(
        () => {
          const controls = [
            ...document.querySelectorAll('input[type="checkbox"]'),
          ];
          const byLabel = (text) =>
            controls.find((control) =>
              control.closest("label")?.textContent?.includes(text),
            );
          return (
            byLabel("Review resume alignment")?.checked === false &&
            byLabel("Confirm application details")?.checked === false
          );
        },
        undefined,
        { timeout: 5000 },
      );
      assert.equal(
        await page.getByLabel("Review resume alignment").isChecked(),
        false,
        "changing the attached resume must invalidate its prior review",
      );
      assert.equal(
        await page.getByLabel("Confirm application details").isChecked(),
        false,
        "changing packet evidence must invalidate final details review",
      );
      for (const item of [
        "Review resume alignment",
        "Confirm application details",
      ]) {
        await Promise.all([
          page.waitForResponse(
            (response) =>
              response.url().includes("/api/submissions/") &&
              response.request().method() === "PATCH" &&
              response.ok(),
          ),
          page.getByLabel(item).click(),
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
      const rejectedDirectSubmission = async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 250));
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Simulated submission write failure" }),
        });
      };
      await page.route("**/api/submissions/*/submit", rejectedDirectSubmission);
      const rejectedDirectResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith("/submit") &&
          response.request().method() === "POST" &&
          response.status() === 503,
      );
      await directSubmitButton.click();
      await page.getByRole("button", { name: "Recording…" }).waitFor();
      const activePacket = queueQuestions.locator("..");
      for (const control of [
        whyAnswer,
        editedVerification,
        page.getByLabel("Review resume alignment"),
        resumeAttachment,
        externalProof,
        activePacket.getByRole("button", { name: "Remove" }),
      ])
        assert.equal(
          await control.isDisabled(),
          true,
          "final submission must lock every packet mutation and destructive action",
        );
      await rejectedDirectResponse;
      await page.unroute(
        "**/api/submissions/*/submit",
        rejectedDirectSubmission,
      );
      await directSubmitButton.waitFor();
      assert.equal(
        await externalProof.isChecked(),
        true,
        "a failed local record should preserve explicit external confirmation for retry",
      );
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
      const delayedSubmission = async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        await route.continue();
      };
      await page.route("**/api/submissions/*/submit", delayedSubmission);
      const batchSubmitResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith("/submit") &&
          response.request().method() === "POST" &&
          response.ok(),
      );
      await submitDialog
        .getByRole("button", { name: "Record submitted" })
        .click();
      await submitDialog.getByRole("button", { name: "Recording…" }).waitFor();
      assert.equal(
        await submitDialog.getByRole("button", { name: "Cancel" }).isDisabled(),
        true,
        "an in-flight submission record must lock every explicit dismiss action",
      );
      assert.equal(
        await submitDialog
          .getByLabel("Close start submitting dialog")
          .isDisabled(),
        true,
        "the modal backdrop must not dismiss an in-flight submission record",
      );
      await page.keyboard.press("Escape");
      await submitDialog.waitFor();
      await batchSubmitResponse;
      await page.unroute("**/api/submissions/*/submit", delayedSubmission);
      assert.equal(recordedSubmissionResponse.ok(), true);
      const recordedSubmission = (
        await (await page.request.get(`${baseUrl}/api/state`)).json()
      ).submissions
        .filter((submission) => submission.status === "submitted")
        .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))[0];
      assert.equal(recordedSubmission.status, "submitted");
      assert.ok(recordedSubmission.resumeSnapshot.name);
      await page.getByRole("heading", { name: "Submission Queue" }).waitFor();
      await page.getByRole("button", { name: "About Me" }).click();
      await page
        .getByRole("heading", {
          name: "Teach JobHuntr how to speak on your behalf",
        })
        .waitFor();

      await page.evaluate(() =>
        sessionStorage.setItem(
          "jobhuntr-cover-letter-wizard",
          JSON.stringify({ step: 5, result: "removed-v1-format" }),
        ),
      );
      await page.getByRole("button", { name: "Cover Letter" }).click();
      await page
        .getByRole("heading", { name: "Cover Letters", exact: true })
        .waitFor();
      assert.deepEqual(
        await page.locator(".v2-document-page").evaluate((root) => {
          const style = (selector) =>
            getComputedStyle(root.querySelector(selector));
          const heading = style(".v2-document-page-head h2");
          const subtitle = style(".v2-document-page-head p");
          const create = style(".v2-document-actions button");
          const empty = style(".v2-document-empty");
          const emptyHeading = style(".v2-document-empty h2");
          const pageStyle = getComputedStyle(root);
          const rootStyle = getComputedStyle(root.parentElement);
          const head = style(".v2-document-page-head");
          const grid = style(".v2-template-grid");
          return {
            page: [
              rootStyle.padding,
              pageStyle.padding,
              pageStyle.maxWidth,
              head.marginBottom,
            ],
            heading: [heading.fontSize, heading.fontWeight],
            subtitle: [subtitle.fontSize, subtitle.color],
            create: [
              create.padding,
              create.fontSize,
              create.fontWeight,
              create.borderRadius,
            ],
            empty: [
              empty.padding,
              empty.borderWidth,
              empty.borderRadius,
              empty.backgroundColor,
            ],
            emptyHeading: [emptyHeading.fontSize, emptyHeading.fontWeight],
            gridGap: grid.gap,
          };
        }),
        {
          page: ["0px", "20px", "none", "20px"],
          heading: ["17.875px", "600"],
          subtitle: ["10.3125px", "rgb(100, 116, 139)"],
          create: ["12px 20px", "11px", "500", "6px"],
          empty: ["20px", "2px", "8px", "rgb(255, 255, 255)"],
          emptyHeading: ["17.875px", "600"],
          gridGap: "20px",
        },
        "cover letter library should retain the authoritative v2 header and empty-state geometry",
      );
      assert.equal(
        await page.evaluate(() =>
          sessionStorage.getItem("jobhuntr-cover-letter-wizard"),
        ),
        null,
        "an incompatible saved wizard should recover to the document library",
      );
      await page.getByRole("button", { name: "Create Cover Letter" }).click();
      await page.getByRole("heading", { name: "Choose a Template" }).waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Previous", exact: true })
          .count(),
        0,
        "v2 omits Previous entirely on the first cover-letter step",
      );
      await page
        .getByRole("button", { name: "Edit cover letter template name" })
        .click();
      await page
        .getByLabel("Cover letter template name")
        .fill("E2E Product Cover Letter");
      await page.getByLabel("Cover letter template name").press("Enter");
      await page.reload();
      await page
        .getByRole("heading", { name: "E2E Product Cover Letter" })
        .waitFor();
      assert.deepEqual(
        await page.locator(".v2-cover-wizard").evaluate((wizard) => {
          const bounds = wizard.getBoundingClientRect();
          const progress = wizard
            .querySelector(".v2-wizard-progress")
            .getBoundingClientRect();
          const footer = wizard
            .querySelector(".v2-cover-step-actions")
            .getBoundingClientRect();
          return {
            bounds: [bounds.x, bounds.y, bounds.width, bounds.height],
            progressInFooter:
              progress.top >= footer.top && progress.bottom <= footer.bottom,
            footerVisible: footer.bottom <= innerHeight,
          };
        }),
        {
          bounds: [64, 0, 1376, 1000],
          progressInFooter: true,
          footerVisible: true,
        },
        "the cover-letter wizard should use v2's full route and always-visible navigation footer",
      );
      assert.deepEqual(
        await page.locator(".v2-cover-template-sheet").evaluate((sheet) => {
          const bounds = sheet.getBoundingClientRect();
          return [bounds.width, bounds.height];
        }),
        [600, 780],
        "the primary cover-letter preview should retain v2's 600×780 document geometry",
      );
      assert.deepEqual(
        await page.locator(".v2-cover-step").evaluate((step) => {
          const heading = getComputedStyle(
            step.querySelector(".v2-cover-template-step-head"),
          );
          const arrow = getComputedStyle(
            step.querySelector(".v2-cover-carousel-arrow"),
          );
          return [heading.textAlign, arrow.width, arrow.height];
        }),
        ["center", "64px", "64px"],
        "template selection should retain v2's centered heading and 64px carousel controls",
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Open Infinite Hunting status" })
          .isVisible(),
        false,
        "global hunt controls must not cover or enter the tab order of the full-route wizard",
      );
      await assertAccessible(page, "Cover Letter wizard");
      await page.getByRole("button", { name: "Select Finance" }).click();
      assert.deepEqual(
        await page.locator(".v2-cover-template-sheet").evaluate((sheet) => {
          const style = getComputedStyle(sheet);
          return [style.fontFamily, style.borderTopColor];
        }),
        ['"Times New Roman", serif', "rgb(44, 90, 160)"],
        "Finance should use its authoritative serif and blue document treatment",
      );
      await page.getByRole("button", { name: "Select Modern" }).click();
      await page.getByRole("button", { name: "Next", exact: true }).click();
      assert.equal(new URL(page.url()).hash, "#/cover-letter?step=2");
      await assertNamedFormControls(page, "Cover Letter template editor");
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
      assert.deepEqual(
        await page
          .frameLocator('iframe[title="Cover Letter Preview"]')
          .locator("body")
          .evaluate((body) => {
            const style = getComputedStyle(body);
            const header = getComputedStyle(body.querySelector("header"));
            return [style.backgroundColor, header.color];
          }),
        ["rgb(248, 249, 250)", "rgb(102, 126, 234)"],
        "the selected Modern template should carry through to the safe live preview",
      );
      assert.match(
        await page.getByLabel("Template content").inputValue(),
        /Hello \{\{company\}\}/,
      );
      await page
        .getByLabel("Prompt to optimize cover letter")
        .fill("Make it more professional");
      await page.getByRole("button", { name: "Apply Prompt" }).click();
      await page.getByText("Prompt applied locally").waitFor();
      await page.getByRole("button", { name: "Next", exact: true }).click();
      const previewResumeButton = page.getByRole("button", {
        name: "Preview E2E tailored resume",
      });
      await previewResumeButton.click();
      const sourcePreview = page.getByRole("dialog", {
        name: "Resume Preview",
      });
      await sourcePreview.waitFor();
      assert.match(
        await sourcePreview.textContent(),
        /increased conversion by 42%/i,
        "the source preview should show the exact resume evidence before selection",
      );
      await page.keyboard.press("Escape");
      await sourcePreview.waitFor({ state: "detached" });
      assert.equal(
        await previewResumeButton.evaluate(
          (button) => document.activeElement === button,
        ),
        true,
        "closing a source preview should return keyboard focus to its trigger",
      );
      await page
        .locator(".v2-cover-source-select")
        .filter({ hasText: "E2E tailored resume" })
        .click();
      await assertNamedFormControls(page, "Cover Letter resume selection");
      await page
        .getByLabel("Cover Letter Instructions")
        .fill("Emphasize accessible product delivery and measurable outcomes.");
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await page.getByRole("heading", { name: "Job Information" }).waitFor();
      await assertNamedFormControls(page, "Cover Letter job information");
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
        generatedCoverLetter.title,
        "E2E Product Cover Letter",
        "the editable v2 wizard name should become the saved document title",
      );
      assert.equal(
        generatedCoverLetter.jobDescription,
        "Build accessible React product experiences and improve customer conversion.",
      );
      assert.equal(
        generatedCoverLetter.emphasis,
        "Emphasize accessible product delivery and measurable outcomes.",
      );
      assert.doesNotMatch(
        generatedCoverLetter.body,
        /\.\.(?:\s|$)/,
        "generated cover letters should not introduce duplicate sentence punctuation",
      );
      await page.getByRole("heading", { name: "Your Cover Letter" }).waitFor();
      assert.deepEqual(
        await page
          .locator(".v2-wizard-progress")
          .evaluate((progress) => [
            getComputedStyle(progress.querySelector("li.complete button"))
              .backgroundColor,
            getComputedStyle(progress.querySelector("li.active button"))
              .backgroundColor,
          ]),
        ["rgb(5, 150, 105)", "rgb(24, 24, 26)"],
        "cover-letter progress should use v2's green completed state and dark active state",
      );
      await page.waitForFunction(() => {
        const buttons = [...document.querySelectorAll("button")];
        const previous = buttons.find(
          (candidate) => candidate.textContent.trim() === "Previous",
        );
        const jobInfo = buttons.find(
          (candidate) =>
            candidate.getAttribute("aria-label") === "Go to Job Info",
        );
        return previous && !previous.disabled && jobInfo && !jobInfo.disabled;
      });
      assert.equal(
        await page.getByRole("button", { name: "Previous" }).isEnabled(),
        true,
        "v2 allows users to return from the final result without discarding their draft",
      );
      assert.equal(
        await page.getByRole("button", { name: "Go to Job Info" }).isEnabled(),
        true,
        "completed cover-letter steps should remain directly navigable",
      );
      await assertNamedFormControls(page, "Generated Cover Letter");
      await page.getByTitle("Generated Cover Letter Preview").waitFor();
      await page.getByRole("link", { name: "Preview PDF" }).waitFor();
      const printableCoverLetter = await (
        await page.request.get(
          `${baseUrl}/print/cover-letter/${generatedCoverLetter.id}`,
        )
      ).text();
      assert.match(printableCoverLetter, /background:#f8f9fa/);
      assert.match(printableCoverLetter, /border-left:5px solid #667eea/);
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
      assert.deepEqual(
        await page.locator(".v2-letter-paper").evaluate((paper) => {
          const style = getComputedStyle(paper);
          return [
            style.backgroundColor,
            style.borderLeftColor,
            style.fontFamily,
          ];
        }),
        [
          "rgb(248, 249, 250)",
          "rgb(102, 126, 234)",
          '"Helvetica Neue", Arial, sans-serif',
        ],
        "the saved card should preserve the Modern template selected in the wizard",
      );
      await page.getByText("Modern", { exact: true }).waitFor();
      assert.deepEqual(
        await page.locator(".v2-template-grid article").evaluate((card) => {
          const style = (selector) =>
            getComputedStyle(card.querySelector(selector));
          const preview = style(".v2-letter-card-preview");
          const badge = style(".v2-letter-status");
          const footer = style("footer");
          const title = style("footer b");
          const date = style("footer small");
          return {
            cardRadius: getComputedStyle(card).borderRadius,
            preview: [preview.aspectRatio, preview.padding],
            badge: [badge.top, badge.right, badge.padding, badge.fontSize],
            footer: [footer.padding, title.fontSize, date.fontSize],
          };
        }),
        {
          cardRadius: "8px",
          preview: ["210 / 297", "0px"],
          badge: ["8px", "8px", "4px 8px", "9.625px"],
          footer: ["12px", "11px", "9.625px"],
        },
        "saved cover letter cards should retain the authoritative v2 A4 proportions and metadata scale",
      );
      await assertAccessible(page, "Cover Letters");
      await page
        .getByRole("button", { name: "Edit E2E product letter" })
        .click();
      await page.getByRole("heading", { name: "Edit Cover Letter" }).waitFor();
      await assertNamedFormControls(page, "Cover Letter editor");
      assert.equal(
        await page.locator(".v2-letter-card-preview").count(),
        0,
        "editing should use a focused document workspace instead of stacking beneath the card grid",
      );
      await page.getByTitle("Saved Cover Letter Preview").waitFor();
      assert.equal(
        await page.getByRole("button", { name: "Save Changes" }).isDisabled(),
        true,
        "a freshly opened saved letter should not offer a redundant save",
      );
      assert.equal(
        await page
          .getByTitle("Saved Cover Letter Preview")
          .evaluate((frame) => frame.getAttribute("sandbox")),
        "",
        "saved-letter previews must remain isolated from the application",
      );
      await page
        .getByLabel("Cover letter content")
        .fill("Dear hiring team,\n\nThis saved edit updates live and safely.");
      await page.waitForFunction(() =>
        document
          .querySelector('iframe[title="Saved Cover Letter Preview"]')
          ?.getAttribute("srcdoc")
          ?.includes("This saved edit updates live and safely."),
      );
      const savedEditorPreview = await page
        .getByTitle("Saved Cover Letter Preview")
        .getAttribute("srcdoc");
      assert.match(savedEditorPreview, /background:#f8f9fa/);
      assert.match(savedEditorPreview, /border-left:5px solid #667eea/);
      assert.match(
        savedEditorPreview,
        /font:15px\/1\.7 'Helvetica Neue', Arial, sans-serif/,
        "the saved editor should retain its Modern template during live editing",
      );
      assert.equal(
        await page.getByRole("button", { name: "Save Changes" }).isEnabled(),
        true,
        "editing the saved letter should expose its dirty state",
      );
      await page.getByRole("button", { name: "Overview", exact: true }).click();
      await page.getByRole("heading", { name: /Welcome back/ }).waitFor();
      await page
        .getByRole("button", { name: "Cover Letter", exact: true })
        .click();
      await page.getByRole("heading", { name: "Cover Letters" }).waitFor();
      await page
        .getByRole("button", { name: "Edit E2E product letter" })
        .click();
      assert.equal(
        await page.getByLabel("Cover letter content").inputValue(),
        "Dear hiring team,\n\nThis saved edit updates live and safely.",
        "an in-progress edit should recover after navigating away and back",
      );
      assert.equal(
        await page.getByRole("button", { name: "Save Changes" }).isEnabled(),
        true,
        "a recovered draft should remain visibly unsaved",
      );
      await page.getByRole("button", { name: "Back to Cover Letters" }).click();
      await page
        .getByRole("alertdialog", { name: "Discard unsaved changes?" })
        .waitFor();
      await page.getByRole("button", { name: "Cancel" }).click();
      await page.getByTitle("Saved Cover Letter Preview").waitFor();
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes("/api/cover-letters/") &&
            response.request().method() === "PATCH" &&
            response.ok(),
        ),
        page.getByRole("button", { name: "Save Changes" }).click(),
      ]);
      assert.equal(
        await page.getByRole("button", { name: "Save Changes" }).isDisabled(),
        true,
        "a successful save should establish the new clean baseline",
      );
      await page
        .getByLabel("Cover letter content")
        .fill("This draft should be discarded rather than persisted.");
      await page.getByRole("button", { name: "Back to Cover Letters" }).click();
      await page.getByRole("button", { name: "Discard Changes" }).click();
      await page.getByRole("heading", { name: "Cover Letters" }).waitFor();

      await Promise.all(
        Array.from({ length: 21 }, (_, index) =>
          page.request.post(`${baseUrl}/api/jobs`, {
            data: {
              company: `Pagination Company ${index + 1}`,
              title: `Pagination Role ${index + 1}`,
              location: "Remote",
              status: "removed",
            },
          }),
        ),
      );
      await page.reload();
      await page.getByRole("heading", { name: "Cover Letters" }).waitFor();
      await page.evaluate(() => {
        localStorage.setItem(
          "jobTracker_visibleStatuses",
          JSON.stringify(["wishlist", "legacy-interview"]),
        );
        localStorage.setItem(
          "jobTracker_selectedAgentRun",
          "deleted-agent-run",
        );
      });
      await page.getByRole("button", { name: "Job Tracker" }).click();
      await page.getByText("Show Columns:", { exact: true }).waitFor();
      assert.deepEqual(
        await page.locator(".tracker-page").evaluate((tracker) => {
          const header = tracker.querySelector(".v2-tracker-header");
          const heading = header.querySelector("h1");
          const funnelButton = header.querySelector(".funnel-button");
          const filters = tracker.querySelector(".tracker-filter-panel");
          const search = filters.querySelector(".search-input");
          const style = (element) => getComputedStyle(element);
          return {
            mainPadding: style(tracker.parentElement).padding,
            trackerMargin: style(tracker).margin,
            headerPadding: style(header).padding,
            headingFontSize: style(heading).fontSize,
            headingFontWeight: style(heading).fontWeight,
            buttonPadding: style(funnelButton).padding,
            buttonRadius: style(funnelButton).borderRadius,
            buttonFontSize: style(funnelButton).fontSize,
            filterPadding: style(filters).padding,
            searchPadding: style(search).padding,
            searchRadius: style(search).borderRadius,
            searchFontSize: style(search).fontSize,
          };
        }),
        {
          mainPadding: "0px",
          trackerMargin: "0px",
          headerPadding: "16.5px 22px",
          headingFontSize: "19.25px",
          headingFontWeight: "600",
          buttonPadding: "5.5px 11px",
          buttonRadius: "6px",
          buttonFontSize: "8.9375px",
          filterPadding: "11px 22px",
          searchPadding: "5.5px 8.25px",
          searchRadius: "6px",
          searchFontSize: "9.625px",
        },
        "the tracker shell should retain the authoritative v2 dimensions",
      );
      assert.equal(
        await page.locator(".tracker-status-filters input:checked").count(),
        9,
        "obsolete saved statuses should recover to every current v2 tracker column",
      );
      const queuedColumn = page
        .locator(".kanban-column")
        .filter({ has: page.getByText("Queued", { exact: true }) });
      const appliedColumn = page
        .locator(".kanban-column")
        .filter({ has: page.getByText("Applied", { exact: true }) });
      const removedColumn = page
        .locator(".kanban-column")
        .filter({ has: page.getByText("Removed", { exact: true }) });
      assert.equal(
        await queuedColumn.getByRole("button", { name: "Add Job" }).count(),
        0,
        "v2 automated queue columns must not accept manual job creation",
      );
      assert.equal(
        await appliedColumn.getByRole("button", { name: "Add Job" }).count(),
        1,
        "v2 manual lifecycle columns should retain Add Job",
      );
      assert.equal(
        await removedColumn.locator(".job-card").count(),
        20,
        "v2 tracker columns should render only the first 20 jobs",
      );
      const removedLoadMore = removedColumn.getByRole("button", {
        name: /Load more \(/,
      });
      await removedLoadMore.click();
      assert.ok(
        (await removedColumn.locator(".job-card").count()) >= 21,
        "Load more should reveal the remaining jobs in the same column",
      );
      await removedLoadMore.waitFor({ state: "hidden" });
      const trackerApplicationCount = await page
        .locator(".v2-tracker-header > div > span")
        .first()
        .innerText();
      const trackerSearch = page.getByLabel("Search tracked jobs");
      await trackerSearch.fill("no-such-job-e2e-9f3a");
      await page.getByText("No matches", { exact: true }).first().waitFor();
      assert.equal(
        await page.getByText("No matches", { exact: true }).count(),
        9,
        "every visible v2 tracker column should explain an empty search",
      );
      assert.equal(
        await queuedColumn.getByRole("button", { name: "Add Job" }).count(),
        0,
        "empty automated columns should not offer manual creation",
      );
      assert.equal(
        await appliedColumn.getByRole("button", { name: "Add Job" }).count(),
        1,
        "empty manual columns should keep Add Job inside the empty state",
      );
      assert.equal(
        await page
          .locator(".v2-tracker-header > div > span")
          .first()
          .innerText(),
        trackerApplicationCount,
        "v2 search should filter cards inside columns without changing the run-level application total",
      );
      assert.equal(
        await page.locator(".tracker-page > .empty-state").count(),
        0,
        "v2 search should not append a duplicate page-level empty state below the board",
      );
      await trackerSearch.fill("");
      await removedColumn.locator(".job-card").first().waitFor();
      assert.equal(
        await removedColumn.locator(".job-card").count(),
        20,
        "changing the search should reset v2 column pagination",
      );
      await removedLoadMore.waitFor();
      const appliedAddJob = appliedColumn.getByRole("button", {
        name: "Add Job",
      });
      await appliedAddJob.click();
      const addJobDialog = page.getByRole("dialog", { name: "Add New Job" });
      await addJobDialog.waitFor();
      await assertNamedFormControls(addJobDialog, "Add New Job drawer");
      assert.equal(
        await addJobDialog
          .getByRole("button", { name: "Cancel" })
          .evaluate((button) => button === document.activeElement),
        true,
        "the v2 Add New Job drawer should focus its safe action",
      );
      await addJobDialog
        .getByLabel("title", { exact: true })
        .fill("Abandoned draft title");
      await page.keyboard.press("Escape");
      const discardNewJobDialog = page.getByRole("alertdialog", {
        name: "Discard new job?",
      });
      await discardNewJobDialog.waitFor();
      await assertAccessible(page, "Discard new Job Tracker role confirmation");
      await discardNewJobDialog.getByRole("button", { name: "Cancel" }).click();
      await discardNewJobDialog.waitFor({ state: "hidden" });
      assert.equal(
        await addJobDialog.getByLabel("title", { exact: true }).inputValue(),
        "Abandoned draft title",
        "canceling discard should preserve a new tracked role draft",
      );
      await page.keyboard.press("Escape");
      await discardNewJobDialog.waitFor();
      await discardNewJobDialog
        .getByRole("button", { name: "Discard Job" })
        .click();
      await addJobDialog.waitFor({ state: "hidden" });
      assert.equal(
        await appliedAddJob.evaluate(
          (button) => button === document.activeElement,
        ),
        true,
        "closing Add New Job should restore focus to its column action",
      );
      await appliedAddJob.click();
      assert.equal(
        await addJobDialog.getByLabel("title", { exact: true }).inputValue(),
        "",
        "reopening Add New Job should not restore an abandoned draft",
      );
      assert.equal(
        await addJobDialog.getByLabel("location", { exact: true }).inputValue(),
        "Remote",
      );
      assert.equal(
        await addJobDialog.getByLabel("New job status").inputValue(),
        "applied",
        "clearing a draft should preserve the column it was opened from",
      );
      await addJobDialog
        .getByLabel("title", { exact: true })
        .fill("E2E Added Role");
      await addJobDialog
        .getByLabel("company", { exact: true })
        .fill("E2E Added Company");
      let addJobRequests = 0;
      await page.route("**/api/jobs", async (route) => {
        if (route.request().method() === "POST") addJobRequests += 1;
        await new Promise((resolve) => setTimeout(resolve, 200));
        await route.continue();
      });
      await addJobDialog
        .getByRole("button", { name: "Save" })
        .evaluate((button) => {
          button.click();
          button.click();
        });
      const savingJob = addJobDialog.getByRole("button", { name: "Saving…" });
      await savingJob.waitFor();
      assert.equal(await savingJob.isDisabled(), true);
      assert.equal(
        await addJobDialog.getByRole("button", { name: "Cancel" }).isDisabled(),
        true,
        "the Add Job drawer must not dismiss while its request is pending",
      );
      await page
        .getByRole("heading", { name: "E2E Added Role", exact: true })
        .waitFor();
      assert.equal(
        addJobRequests,
        1,
        "same-frame Save clicks must create only one tracked job",
      );
      await page.unroute("**/api/jobs");
      await page.getByRole("button", { name: "Close job details" }).click();
      const firstTrackerColumn = page.locator(".status-column").first();
      assert.equal(
        await firstTrackerColumn.evaluate(
          (column) => getComputedStyle(column).width,
        ),
        "300px",
        "v2 tracker columns should retain their fixed desktop width",
      );
      const structuredTrackerCard = page.locator(".job-card").first();
      await structuredTrackerCard.waitFor();
      assert.equal(
        await structuredTrackerCard.locator(".job-card-header").count(),
        1,
        "tracker cards should use the v2 title and badge header",
      );
      assert.equal(
        await structuredTrackerCard.locator(".job-card-body").count(),
        1,
        "tracker cards should use the v2 company and application metadata body",
      );
      assert.equal(
        await structuredTrackerCard.locator(".job-card-footer").count(),
        1,
        "tracker cards should use the v2 posted date and job link footer",
      );
      assert.ok(
        (await page.locator(".manual-badge").count()) > 0,
        "manually tracked jobs should be visibly distinguished like v2",
      );
      assert.ok(
        (await page.locator(".ats-score").count()) > 0,
        "automated tracker cards should expose their ATS score like v2",
      );
      const queuedCardAction = queuedColumn
        .getByRole("button", { name: "Go to Submission Queue" })
        .first();
      const automatedTrackerCard = page
        .locator(".job-card", { has: page.locator(".ats-score") })
        .first()
        .locator(".kanban-card");
      const queuedDropContent = queuedColumn.locator(".status-column-content");
      const columnDragData = await page.evaluateHandle(
        () => new DataTransfer(),
      );
      await automatedTrackerCard.dispatchEvent("dragstart", {
        dataTransfer: columnDragData,
      });
      await queuedDropContent.dispatchEvent("dragover", {
        dataTransfer: columnDragData,
      });
      await page.waitForFunction(() =>
        Boolean(document.querySelector(".status-column.drag-over")),
      );
      assert.equal(
        await queuedColumn.evaluate((column) =>
          column.classList.contains("drag-over"),
        ),
        true,
        "v2 should highlight the active status column before drop",
      );
      assert.equal(
        await queuedDropContent.evaluate(
          (content) => getComputedStyle(content, "::after").content,
        ),
        '"Drop here to change status"',
        "v2 should explain the pending status drop before release",
      );
      await queuedDropContent.dispatchEvent("drop", {
        dataTransfer: columnDragData,
      });
      await automatedTrackerCard.dispatchEvent("dragend", {
        dataTransfer: columnDragData,
      });
      await columnDragData.dispose();
      await queuedCardAction.waitFor();
      await queuedCardAction.click();
      await page.getByRole("heading", { name: "Submission Queue" }).waitFor();
      assert.match(
        page.url(),
        /#\/queue(?:\?packet=|$)/,
        "the queued card action should open its submission queue context",
      );
      await page.goBack();
      await page
        .getByRole("heading", { name: "Job Tracker", exact: true })
        .waitFor();
      await structuredTrackerCard.waitFor();
      const dragCard = structuredTrackerCard.locator(".kanban-card");
      const dragCardTitle = await dragCard.locator(".job-title").innerText();
      const [trackerExport] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "Export CSV" }).click(),
      ]);
      assert.match(
        trackerExport.suggestedFilename(),
        /^job-tracker-export-.*\.csv$/,
      );
      const exportStream = await trackerExport.createReadStream();
      let trackerCsv = "";
      for await (const chunk of exportStream) trackerCsv += chunk.toString();
      assert.match(trackerCsv, /^Company,Job Title,Location,Status,/);
      assert.match(
        trackerCsv,
        new RegExp(dragCardTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        "the v2 header export should contain the currently filtered tracker jobs",
      );
      await dragCard.click({ button: "right" });
      await page
        .getByText(`Link copied for ${dragCardTitle}`, { exact: true })
        .waitFor();
      const jobClipboardUrl = await page.evaluate(() =>
        navigator.clipboard.readText(),
      );
      assert.match(
        jobClipboardUrl,
        /#\/tracker\?job=[^&]+&statuses=/,
        "right-clicking a card should copy its stable filtered deep link",
      );
      const dragCardBox = await dragCard.boundingBox();
      assert.ok(dragCardBox, "a tracker card should be available to drag");
      await page.mouse.move(
        dragCardBox.x + dragCardBox.width / 2,
        dragCardBox.y + dragCardBox.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        dragCardBox.x + dragCardBox.width / 2 + 12,
        dragCardBox.y + dragCardBox.height / 2 + 12,
        { steps: 4 },
      );
      const deleteDropZone = page.getByRole("button", {
        name: "Drop to delete job",
      });
      await deleteDropZone.waitFor();
      await page.waitForTimeout(350);
      const deleteDropBox = await deleteDropZone.boundingBox();
      assert.ok(deleteDropBox, "v2 should reveal its global drag delete zone");
      await page.mouse.move(
        deleteDropBox.x + deleteDropBox.width / 2,
        deleteDropBox.y + deleteDropBox.height / 2,
        { steps: 8 },
      );
      await page.mouse.up();
      const dragDeleteDialog = page.getByRole("alertdialog", {
        name: "Delete tracked job?",
      });
      await dragDeleteDialog.waitFor();
      await dragDeleteDialog
        .getByText(dragCardTitle, { exact: false })
        .waitFor();
      await dragDeleteDialog.getByRole("button", { name: "Cancel" }).click();
      await dragDeleteDialog.waitFor({ state: "hidden" });
      await dragCard.waitFor();
      assert.equal(
        await page.getByLabel("Filter by agent run").inputValue(),
        "all",
        "a deleted saved agent run should recover to All Runs",
      );
      assert.equal(
        await page.locator(".job-drawer").count(),
        0,
        "the v2 tracker should not open job details until the user selects a card",
      );
      const firstTrackedJob = page.locator(".kanban-card").first();
      await firstTrackedJob.click();
      const jobDetailsDialog = page.locator(".job-drawer");
      await jobDetailsDialog.waitFor();
      await page.waitForTimeout(350);
      await jobDetailsDialog
        .getByRole("heading", { name: "Job Details", exact: true })
        .waitFor();
      for (const sectionName of [
        "Position",
        "Status",
        "Timeline",
        "Description",
        "Status History",
      ]) {
        assert.equal(
          await jobDetailsDialog
            .getByRole("heading", { name: sectionName, exact: true })
            .count(),
          1,
          `v2 job details should expose the ${sectionName} section`,
        );
      }
      const drawerLayout = await jobDetailsDialog.evaluate((element) => ({
        position: getComputedStyle(element).position,
        width: getComputedStyle(element).width,
        right: element.getBoundingClientRect().right,
        viewportWidth: window.innerWidth,
      }));
      assert.equal(
        drawerLayout.width,
        "480px",
        "v2 job details should use the 480px sidebar width",
      );
      assert.equal(
        drawerLayout.position,
        "fixed",
        "v2 job details should stay fixed while the tracker scrolls",
      );
      assert.ok(
        Math.abs(drawerLayout.right - drawerLayout.viewportWidth) <= 1,
        `v2 job details should be fixed to the right edge (${drawerLayout.right} vs ${drawerLayout.viewportWidth})`,
      );
      await page.keyboard.press("Escape");
      await jobDetailsDialog.waitFor({ state: "detached" });
      assert.equal(
        await firstTrackedJob.evaluate(
          (element) => document.activeElement === element,
        ),
        true,
        "closing job details should return keyboard focus to the selected card",
      );
      await page.goto(`${baseUrl}/#/tracker?job=${recordedSubmission.jobId}`);
      await page
        .getByRole("region", { name: "Submitted application evidence" })
        .waitFor();
      await page.getByRole("link", { name: "View captured resume" }).waitFor();
      await page.getByText(/This snapshot cannot be changed/).waitFor();
      await assertAccessible(page, "Submitted application evidence");
      for (const status of ["Submitting", "Failed", "Skipped", "Removed"]) {
        assert.equal(
          await page.getByLabel(status, { exact: true }).isChecked(),
          true,
        );
      }
      await page.getByRole("button", { name: "Close job details" }).click();
      await page.getByLabel("Filter by agent run").selectOption("automated");
      assert.equal(
        await page.getByLabel("Filter by agent run").inputValue(),
        "automated",
      );
      await page
        .getByText("• Filtered by agent run", { exact: true })
        .waitFor();
      assert.equal(
        await page.getByRole("button", { name: "Reset filters" }).count(),
        0,
        "the tracker should not expose the non-v2 reset control",
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
      await page.getByLabel("Rejected", { exact: true }).check();
      await page.getByLabel("Filter by agent run").selectOption("all");
      await page
        .getByText("• Filtered by agent run", { exact: true })
        .waitFor({ state: "hidden" });
      const trackerInsightsState = await (
        await page.request.get(`${baseUrl}/api/state`)
      ).json();
      const activeTrackerSubmission = trackerInsightsState.submissions.find(
        (submission) => !["submitted", "archived"].includes(submission.status),
      );
      const insightsJobId = activeTrackerSubmission.jobId;
      await page.goto(`${baseUrl}/#/tracker?job=${insightsJobId}`);
      await page
        .locator(".job-drawer")
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
      await page.getByRole("button", { name: "Close job details" }).click();
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
      await page.keyboard.press("Shift+Tab");
      assert.equal(
        await funnelDialog.evaluate((dialog) =>
          dialog.contains(document.activeElement),
        ),
        true,
        "reverse keyboard navigation must not move focus onto an invisible modal backdrop",
      );
      assert.equal(
        await funnelDialog
          .locator(".v2-funnel-backdrop")
          .evaluate((backdrop) => backdrop === document.activeElement),
        false,
      );
      await page.keyboard.press("Escape");
      await funnelDialog.waitFor({ state: "hidden" });
      await page.goto(`${baseUrl}/#/tracker?job=${insightsJobId}`);
      await page.getByLabel("Job status").waitFor();
      let trackerStatusPatchCount = 0;
      await page.route(`**/api/jobs/${insightsJobId}`, async (route) => {
        trackerStatusPatchCount += 1;
        if (trackerStatusPatchCount === 1)
          await new Promise((resolve) => setTimeout(resolve, 200));
        await route.continue();
      });
      const statusResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/jobs/${insightsJobId}`) &&
          response.request().method() === "PATCH" &&
          response.ok(),
      );
      await page.getByLabel("Job status").evaluate((select) => {
        select.value = "interview";
        select.dispatchEvent(new Event("change", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await statusResponse;
      await page.waitForTimeout(100);
      assert.equal(
        trackerStatusPatchCount,
        1,
        "same-frame tracker status changes must issue one PATCH per job",
      );
      await page.unroute(`**/api/jobs/${insightsJobId}`);
      await page.getByRole("button", { name: "Add Round" }).click();
      const roundForm = page.locator(".interview-round-form");
      await assertNamedFormControls(roundForm, "Interview round form");
      await roundForm.getByLabel("Round number").fill("9");
      await roundForm
        .getByLabel("Notes")
        .fill("Unsaved panel interview preparation notes");
      await page.getByRole("button", { name: "Close job details" }).click();
      await page.goto(`${baseUrl}/#/tracker?job=${insightsJobId}`);
      await page
        .getByText("Unsaved interview round draft restored.", { exact: true })
        .waitFor();
      assert.equal(
        await roundForm.getByLabel("Round number").inputValue(),
        "9",
      );
      assert.equal(
        await roundForm.getByLabel("Notes").inputValue(),
        "Unsaved panel interview preparation notes",
        "closing and reopening a tracked role should recover its round draft",
      );
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
      await page.getByRole("button", { name: "Close job details" }).click();
      await page.getByRole("button", { name: "Funnel Analysis" }).click();
      await funnelDialog.getByText("Round-by-round conversion").waitFor();
      await funnelDialog
        .getByText("Interview Round 1", { exact: true })
        .waitFor();
      await page.keyboard.press("Escape");
      await funnelDialog.waitFor({ state: "hidden" });
      await page.goto(`${baseUrl}/#/tracker?job=${insightsJobId}`);
      await page.getByLabel("Private job note").waitFor();
      await assertNamedFormControls(
        page.locator(".job-drawer"),
        "Job details drawer",
      );
      await page.getByLabel("Private job note").fill("Recovered draft note");
      await page.getByLabel("Task description").fill("Recovered draft task");
      await page.getByLabel("Task due date").fill("2030-04-12");
      const contactForm = page.locator(".contact-form");
      await contactForm.getByLabel("Name").fill("Recovered Draft Contact");
      await contactForm.getByLabel("Role").fill("Draft Recruiter");
      await page.getByRole("button", { name: "Close job details" }).click();
      await page.goto(`${baseUrl}/#/tracker?job=${insightsJobId}`);
      await page
        .getByText("Unsaved note, task, or contact draft restored.", {
          exact: true,
        })
        .waitFor();
      assert.equal(
        await page.getByLabel("Private job note").inputValue(),
        "Recovered draft note",
      );
      assert.equal(
        await page.getByLabel("Task description").inputValue(),
        "Recovered draft task",
      );
      assert.equal(
        await contactForm.getByLabel("Name").inputValue(),
        "Recovered Draft Contact",
        "closing and reopening a tracked role should recover action drafts",
      );
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
      await contactForm.getByLabel("Name").fill("Alex Morgan");
      await contactForm.getByLabel("Role").fill("Engineering Recruiter");
      await contactForm.getByLabel("Email").fill("alex@example.com");
      await contactForm
        .getByLabel("LinkedIn profile")
        .fill("https://www.linkedin.com/in/alex-morgan");
      await page.getByRole("button", { name: "Add contact" }).click();
      const trackerContact = page
        .locator("article.contact")
        .filter({ hasText: "Alex Morgan" });
      await trackerContact.waitFor();
      await trackerContact.getByRole("button", { name: "Edit" }).click();
      await contactForm.getByLabel("Role").fill("Senior Recruiter");
      await page.getByRole("button", { name: "Save contact" }).click();
      await trackerContact.getByText("Senior Recruiter").waitFor();
      await trackerContact
        .getByRole("button", { name: "Delete contact Alex Morgan" })
        .click();
      const trackerDeleteContactDialog = page.getByRole("alertdialog", {
        name: "Delete contact?",
      });
      await trackerDeleteContactDialog.waitFor();
      await trackerDeleteContactDialog
        .getByRole("button", { name: "Delete" })
        .click();
      await trackerContact.waitFor({ state: "hidden" });
      await page.goto(`${baseUrl}/#/tracker?job=${recordedSubmission.jobId}`);
      await page
        .getByRole("region", { name: "Submitted application evidence" })
        .waitFor();
      await page.getByRole("button", { name: "Delete role" }).click();
      const deleteJobDialog = page.getByRole("alertdialog", {
        name: "Delete tracked job?",
      });
      await deleteJobDialog.waitFor();
      await deleteJobDialog
        .getByText(
          /submitted application record, and locked document snapshots/i,
        )
        .waitFor();
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
      await page.getByRole("button", { name: "Close job details" }).click();
      await page.getByLabel("Filter by agent run").selectOption("manual");
      await page
        .getByRole("button", { name: /Founding Product Engineer/ })
        .click();
      await page.getByRole("button", { name: "Edit job" }).click();
      const jobEditForm = page.locator(".job-edit-form");
      await page
        .getByRole("heading", { name: "Edit Job", exact: true })
        .waitFor();
      await assertNamedFormControls(jobEditForm, "Edit Job drawer");
      await jobEditForm
        .getByLabel("title", { exact: true })
        .fill("Unsaved Principal Product Engineer");
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      const discardJobChangesDialog = page.getByRole("alertdialog", {
        name: "Discard job changes?",
      });
      await discardJobChangesDialog.waitFor();
      await assertAccessible(page, "Discard Job Tracker edit confirmation");
      await discardJobChangesDialog
        .getByRole("button", { name: "Cancel" })
        .click();
      await discardJobChangesDialog.waitFor({ state: "hidden" });
      assert.equal(
        await jobEditForm.getByLabel("title", { exact: true }).inputValue(),
        "Unsaved Principal Product Engineer",
        "canceling discard should preserve the unsaved edit",
      );
      await page.getByLabel("Dismiss job details").click({ force: true });
      await discardJobChangesDialog.waitFor();
      await discardJobChangesDialog
        .getByRole("button", { name: "Cancel" })
        .click();
      await discardJobChangesDialog.waitFor({ state: "hidden" });
      await page
        .getByRole("heading", { name: "Edit Job", exact: true })
        .waitFor();
      await jobEditForm
        .getByLabel("title", { exact: true })
        .fill("Founding Principal Product Engineer");
      await jobEditForm
        .getByLabel("salary", { exact: true })
        .fill("$175k-$225k");
      await page.getByRole("button", { name: "Save", exact: true }).click();
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

      await page.getByRole("button", { name: "Close job details" }).click();
      await page.getByRole("button", { name: "LinkedIn Audit" }).click();
      await page
        .getByRole("heading", { name: "LinkedIn Profile Audit" })
        .waitFor();
      await page.goBack();
      await page
        .getByRole("heading", { name: "Job Tracker", exact: true })
        .waitFor();
      await page.goForward();
      await page
        .getByRole("heading", { name: "LinkedIn Profile Audit" })
        .waitFor();
      assert.deepEqual(
        await page.locator(".v2-audit-page").evaluate((root) => {
          const style = (selector) =>
            getComputedStyle(root.querySelector(selector));
          const heading = style(".v2-page-intro h1");
          const subtitle = style(".v2-page-intro p");
          const input = style(".v2-audit-url input");
          const analyze = style(".v2-audit-url button");
          const context = style(".v2-audit-context-toggle");
          const rootStyle = getComputedStyle(root);
          return {
            page: [
              getComputedStyle(root.parentElement).padding,
              rootStyle.maxWidth,
              rootStyle.padding,
            ],
            heading: [heading.fontSize, heading.fontWeight],
            subtitle: [subtitle.fontSize, subtitle.color],
            input: [input.padding, input.fontSize, input.borderRadius],
            analyze: [analyze.padding, analyze.fontSize, analyze.fontWeight],
            context: [context.padding, context.fontSize, context.fontWeight],
          };
        }),
        {
          page: ["0px", "1248px", "24px"],
          heading: ["22px", "700"],
          subtitle: ["11px", "rgb(75, 85, 99)"],
          input: ["12px 16px", "11px", "6px"],
          analyze: ["12px 20px", "11px", "500"],
          context: ["12px 16px", "11px", "500"],
        },
        "LinkedIn Audit should retain the authoritative v2 input and heading geometry",
      );
      assert.equal(
        await page.getByLabel("About section").count(),
        0,
        "pasted profile content should start collapsed like v2",
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Analyze Profile" })
          .isDisabled(),
        true,
        "v2 LinkedIn Audit should require a profile URL before analysis",
      );
      await page
        .getByRole("button", { name: /Show pasted profile content/ })
        .click();
      await page
        .getByLabel("About section")
        .fill(
          "I build customer-facing products and improved conversion by 42% through measurable experiments.",
        );
      const profileUrlInput = page.getByLabel("LinkedIn profile URL");
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
      await page.locator('button[title="Job Tracker"]').click();
      await page.getByRole("button", { name: "LinkedIn Audit" }).click();
      await page
        .getByText("Private LinkedIn audit draft restored.", { exact: true })
        .waitFor();
      assert.equal(
        await page.getByLabel("About section").inputValue(),
        "I build customer-facing products and improved conversion by 42% through measurable experiments.",
        "pasted LinkedIn content should recover after navigation",
      );
      assert.equal(
        await page
          .getByLabel(/How would you like to improve your LinkedIn profile/)
          .inputValue(),
        "Target product engineering roles focused on conversion experiments and React.",
      );
      await assertNamedFormControls(page, "LinkedIn Audit");
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
      await page
        .getByRole("heading", { name: "Outreach", exact: true })
        .waitFor();
      assert.deepEqual(
        await page.locator(".v2-outreach-page").evaluate((root) => {
          const style = (selector) =>
            getComputedStyle(root.querySelector(selector));
          const header = style(":scope > .v2-page-intro");
          const heading = style(":scope > .v2-page-intro h1");
          const collect = style(":scope > .v2-page-intro button.secondary");
          const connect = style(
            ":scope > .v2-page-intro button:not(.secondary)",
          );
          const rootStyle = getComputedStyle(root);
          return {
            page: [
              getComputedStyle(root.parentElement).padding,
              rootStyle.maxWidth,
              rootStyle.padding,
            ],
            header: [header.padding, header.borderBottomWidth],
            heading: [heading.fontSize, heading.fontWeight],
            collect: [collect.padding, collect.fontSize, collect.fontWeight],
            connect: [connect.padding, connect.fontSize, connect.fontWeight],
          };
        }),
        {
          page: ["0px", "none", "0px 22px 48px"],
          header: ["16.5px 22px", "1px"],
          heading: ["19.25px", "600"],
          collect: ["12px 20px", "11px", "500"],
          connect: ["12px 20px", "11px", "500"],
        },
        "Outreach should retain the authoritative v2 header and action geometry",
      );
      await page.getByRole("button", { name: "Collect contacts" }).click();
      let collectDialog = page.getByRole("dialog", {
        name: "Collect contacts",
      });
      await collectDialog.waitFor();
      assert.equal(
        await collectDialog
          .getByRole("button", { name: "Cancel" })
          .evaluate((button) => button === document.activeElement),
        true,
        "collect contacts should move keyboard focus into its modal",
      );
      await assertNamedFormControls(page, "Collect contacts dialog");
      await collectDialog
        .getByRole("button", { name: "Collect contacts", exact: true })
        .click();
      assert.equal(
        await page.getByLabel("Show Connection Messages").isChecked(),
        false,
        "connection messages should default hidden like v2",
      );
      await page.getByLabel("Show Connection Messages").check();
      await assertNamedFormControls(page, "Outreach editor");
      assert.doesNotMatch(
        await page
          .locator('.v2-contact-detail textarea[name^="outreach-message-"]')
          .inputValue(),
        /\.\.(?:\s|$)/,
        "generated outreach should not duplicate sentence punctuation",
      );
      const subject = page.getByLabel("Subject");
      await subject.fill("E2E persisted outreach subject");
      await page.getByRole("button", { name: "Save locally" }).click();

      await page.reload();
      await page
        .getByRole("heading", { name: "Outreach", exact: true })
        .waitFor();
      await page.getByText("E2E persisted outreach subject").first().waitFor();
      await page.getByRole("button", { name: "Collect contacts" }).click();
      collectDialog = page.getByRole("dialog", { name: "Collect contacts" });
      await collectDialog
        .getByRole("button", { name: "Collect contacts", exact: true })
        .click();
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
            response.url().endsWith("/api/outreach/bulk-status") &&
            response.request().method() === "POST" &&
            response.ok(),
        ),
        connectDialog
          .getByRole("button", { name: "Mark as outreached" })
          .click(),
      ]);
      await connectDialog.waitFor({ state: "hidden" });
      await page.getByText("Outreached", { exact: true }).first().waitFor();
      await assertNamedFormControls(page, "Outreach");
      await page.getByRole("button", { name: "Delete Hiring team" }).click();
      const deleteContactDialog = page.getByRole("alertdialog", {
        name: "Delete outreach contact?",
      });
      await deleteContactDialog.waitFor();
      await assertAccessible(page, "Delete outreach contact confirmation");
      await deleteContactDialog.getByRole("button", { name: "Cancel" }).click();
      await assertAccessible(page, "Outreach");

      await page.evaluate(() => {
        localStorage.setItem(
          "jobhuntr-coach-conversations",
          JSON.stringify([null, {}, { id: "damaged-chat", messages: [null] }]),
        );
        localStorage.setItem(
          "jobhuntr-coach-chat",
          JSON.stringify([null, { role: "unknown", content: 42 }]),
        );
      });
      await page.locator('button[title="AI Career Coach"]').click();
      await page
        .getByRole("heading", { name: "Hi, I'm your Career Coach!" })
        .waitFor();
      assert.deepEqual(
        await page.evaluate(() => {
          const styles = (selector) =>
            window.getComputedStyle(document.querySelector(selector));
          return {
            mainPadding: styles("main").padding,
            pageMaxWidth: styles(".coach-page").maxWidth,
            pagePadding: styles(".coach-page").padding,
            headingSize: styles(".v2-coach-welcome h2").fontSize,
            headingWeight: styles(".v2-coach-welcome h2").fontWeight,
            copyAlignment: styles(".v2-coach-welcome p").textAlign,
            inputMaxWidth: styles(".v2-coach-input").maxWidth,
            inputHeight: styles(".v2-coach-input textarea").minHeight,
            actionSize: styles(".v2-coach-input button").fontSize,
          };
        }),
        {
          mainPadding: "0px",
          pageMaxWidth: "1248px",
          pagePadding: "24px",
          headingSize: "17.875px",
          headingWeight: "600",
          copyAlignment: "start",
          inputMaxWidth: "768px",
          inputHeight: "120px",
          actionSize: "11px",
        },
        "Career Coach should preserve the v2 desktop content and composer proportions",
      );
      await assertNamedFormControls(page, "Career Coach chat");
      const coachComposer = page.getByLabel("Message Career Coach");
      await coachComposer.fill(
        "Help me frame an unsent question about my next interview.",
      );
      await page.goto(`${baseUrl}/#/tracker`);
      await page.goto(`${baseUrl}/#/coach`);
      await page
        .getByText("Unsent coaching prompt restored.", { exact: true })
        .waitFor();
      assert.equal(
        await coachComposer.inputValue(),
        "Help me frame an unsent question about my next interview.",
        "the Career Coach should recover an unsent prompt after navigation",
      );
      await coachComposer.fill("");
      assert.equal(
        await page.getByText("Invalid Date", { exact: true }).count(),
        0,
        "Career Coach should never render invalid dates",
      );
      await page.getByRole("button", { name: "Interview practice" }).click();
      await page
        .getByRole("button", { name: "New role-specific plan" })
        .click();
      await page
        .getByRole("heading", { name: /Developer Tools Engineer/ })
        .waitFor();
      await assertNamedFormControls(page, "Career Coach interview practice");
      const privatePracticeNotes = page.locator(
        'textarea[name="practice-private-notes"]',
      );
      await privatePracticeNotes.fill(
        "Unsaved interview evidence and follow-up questions",
      );
      await page
        .getByRole("button", { name: "New role-specific plan" })
        .click();
      const discardPracticeDialog = page.getByRole("alertdialog", {
        name: "Discard practice changes?",
      });
      await discardPracticeDialog.waitFor();
      await assertAccessible(page, "Discard interview practice confirmation");
      await discardPracticeDialog
        .getByRole("button", { name: "Cancel" })
        .click();
      await discardPracticeDialog.waitFor({ state: "hidden" });
      assert.equal(
        await privatePracticeNotes.inputValue(),
        "Unsaved interview evidence and follow-up questions",
        "canceling practice navigation should preserve unsaved notes",
      );
      await page.getByRole("button", { name: "Save progress" }).click();
      await page.getByRole("button", { name: "STAR story vault" }).click();
      await assertNamedFormControls(page, "Career Coach STAR story vault");
      await page
        .getByRole("main")
        .getByRole("button", { name: "Outreach", exact: true })
        .click();
      await assertNamedFormControls(page, "Career Coach outreach");
      await page.getByRole("button", { name: "Local Career Coach" }).click();
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
      const originalCoachJobId = await page
        .getByLabel("Coaching role")
        .inputValue();
      const alternateCoachJobId = await page
        .getByLabel("Coaching role")
        .evaluate(
          (select, current) =>
            [...select.options].find((option) => option.value !== current)
              ?.value || "",
          originalCoachJobId,
        );
      assert.ok(alternateCoachJobId, "a second coaching role should exist");
      await page.getByLabel("Coaching role").selectOption(alternateCoachJobId);
      await page
        .getByRole("heading", { name: "Hi, I'm your Career Coach!" })
        .waitFor();
      assert.doesNotMatch(
        page.url(),
        /conversation=/,
        "changing roles should start a fresh v2 coaching context instead of silently retargeting an existing conversation",
      );
      await page
        .getByRole("button", {
          name: "Help me prepare for an interview 1 coaching exchange",
        })
        .click();
      assert.equal(
        await page.getByLabel("Coaching role").inputValue(),
        originalCoachJobId,
        "opening a saved coaching conversation should restore its original role context",
      );
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
        .locator(".story-card button")
        .filter({ hasText: "Recovered a critical launch" })
        .click();
      await page
        .getByLabel("Story title")
        .fill("Unsaved critical launch evidence");
      await page.getByRole("button", { name: "New", exact: true }).click();
      const discardStoryDialog = page.getByRole("alertdialog", {
        name: "Discard STAR story changes?",
      });
      await discardStoryDialog.waitFor();
      await assertAccessible(page, "Discard STAR story changes confirmation");
      await discardStoryDialog.getByRole("button", { name: "Cancel" }).click();
      await discardStoryDialog.waitFor({ state: "hidden" });
      assert.equal(
        await page.getByLabel("Story title").inputValue(),
        "Unsaved critical launch evidence",
        "canceling New should preserve unsaved STAR evidence",
      );
      await page.getByRole("button", { name: "New", exact: true }).click();
      await discardStoryDialog.waitFor();
      await discardStoryDialog
        .getByRole("button", { name: "Discard Changes" })
        .click();
      await discardStoryDialog.waitFor({ state: "hidden" });
      assert.equal(await page.getByLabel("Story title").inputValue(), "");
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
      await page.getByRole("heading", { name: "Gigs", exact: true }).waitFor();
      assert.deepEqual(
        await page.locator("section.gigs-page").evaluate((root) => {
          const style = (selector) =>
            getComputedStyle(root.querySelector(selector));
          const heading = style(".v2-gigs-intro h2");
          const subtitle = style(".v2-gigs-intro p");
          const sectionHeading = style(".v2-gigs-section-title h3");
          const search = style(".v2-gig-search");
          const searchInput = style(".v2-gig-search input");
          const card = style(".v2-gig-campaigns article");
          const campaignTitle = style(".v2-gig-campaign-head h3");
          const earning = style(".v2-gig-campaign-head > strong");
          const apply = style(".v2-gig-campaigns article > button");
          return {
            root: [
              getComputedStyle(root.parentElement).padding,
              getComputedStyle(root).maxWidth,
              getComputedStyle(root).padding,
            ],
            heading: [heading.fontSize, heading.fontWeight],
            subtitle: [subtitle.fontSize, subtitle.color],
            sectionHeading: [
              sectionHeading.fontSize,
              sectionHeading.fontWeight,
            ],
            search: [search.padding, search.borderRadius, searchInput.fontSize],
            card: [card.padding, card.borderRadius],
            campaignTitle: [campaignTitle.fontSize, campaignTitle.fontWeight],
            earning: [earning.padding, earning.fontSize],
            apply: [apply.padding, apply.fontSize, apply.fontWeight],
          };
        }),
        {
          root: ["0px", "1200px", "20px"],
          heading: ["17.875px", "600"],
          subtitle: ["11px", "rgb(75, 85, 99)"],
          sectionHeading: ["15.125px", "500"],
          search: ["8.25px 11px", "9999px", "11px"],
          card: ["20px", "12px"],
          campaignTitle: ["13.75px", "500"],
          earning: ["4px 8px", "10.3125px"],
          apply: ["12px 20px", "11px", "500"],
        },
        "Gigs should retain the authoritative v2 page, search, and campaign geometry",
      );
      await assertNamedFormControls(page, "Gigs");
      assert.equal(
        await page.getByText("Invalid Date", { exact: true }).count(),
        0,
        "Gigs should never render invalid dates",
      );
      const availableGigSearch = page.getByLabel("Search available gigs");
      await availableGigSearch.fill("no-such-gig-e2e-7b1f");
      await page
        .getByText(/No gigs found matching.*Try a different search term\./)
        .waitFor();
      assert.equal(
        await page.locator(".v2-gig-campaigns article").count(),
        0,
        "v2 Gigs search should replace unmatched campaign cards with an explicit empty state",
      );
      await page
        .getByRole("button", { name: "Clear available gigs search" })
        .click();
      await page.getByRole("button", { name: "Apply Now" }).first().waitFor();
      await page.getByRole("button", { name: "Add gig" }).click();
      await assertNamedFormControls(page, "Add gig form");
      await page.getByLabel("Client").fill("Recovered Local Client");
      await page.getByLabel("Project title").fill("Recovered gig draft");
      await page
        .getByLabel("Description")
        .fill("Unsaved private scope that should survive navigation.");
      await page.locator('button[title="Job Tracker"]').click();
      await page.locator('button[title="Gigs"]').click();
      await page
        .getByText("Unsaved gig opportunity draft restored.", { exact: true })
        .waitFor();
      assert.equal(
        await page.getByLabel("Project title").inputValue(),
        "Recovered gig draft",
        "the new-gig composer should recover after leaving the page",
      );
      assert.equal(
        await page.getByLabel("Description").inputValue(),
        "Unsaved private scope that should survive navigation.",
      );
      await page.getByLabel("Client").fill("");
      await page.getByLabel("Project title").fill("");
      await page.getByLabel("Description").fill("");
      await page.getByRole("button", { name: "Close", exact: true }).click();
      await page.getByRole("button", { name: "Apply Now" }).first().click();
      const campaignDialog = page.getByRole("dialog", {
        name: "Review an AI resume workflow",
      });
      await campaignDialog.waitFor();
      await assertNamedFormControls(campaignDialog, "Gig application review");
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
      await page.goto(`${baseUrl}/#/tracker`);
      await page.goto(`${baseUrl}/#/gigs`);
      await campaignDialog.waitFor();
      await page
        .getByText("Unsaved gig application pitch restored.", { exact: true })
        .waitFor();
      assert.equal(
        await campaignDialog.getByLabel("Gig application pitch").inputValue(),
        "I test complex React workflows and provide evidence-based feedback.",
        "a gig application pitch should recover after route navigation",
      );
      await page.keyboard.press("Escape");
      const discardPitchDialog = page.getByRole("alertdialog", {
        name: "Discard application pitch?",
      });
      await discardPitchDialog.waitFor();
      await assertAccessible(
        page,
        "Discard gig application pitch confirmation",
      );
      await discardPitchDialog.getByRole("button", { name: "Cancel" }).click();
      await discardPitchDialog.waitFor({ state: "hidden" });
      assert.equal(
        await campaignDialog.getByLabel("Gig application pitch").inputValue(),
        "I test complex React workflows and provide evidence-based feedback.",
        "canceling discard should preserve the gig application pitch",
      );
      await assertAccessible(page, "Gig application review");
      const [gigCreateResponse] = await Promise.all([
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
      const createdGigId = (await gigCreateResponse.json()).id;
      await page
        .getByRole("heading", { name: "Review an AI resume workflow" })
        .last()
        .waitFor();
      const gigDialog = page.getByRole("dialog", {
        name: "Review an AI resume workflow",
      });
      await gigDialog.waitFor();
      await assertNamedFormControls(gigDialog, "Gig details");
      let queuedGigPatchCount = 0;
      await page.route(`**/api/gigs/${createdGigId}`, async (route) => {
        queuedGigPatchCount += 1;
        if (queuedGigPatchCount === 1)
          await new Promise((resolve) => setTimeout(resolve, 200));
        await route.continue();
      });
      await gigDialog
        .getByLabel("Gig application status")
        .evaluate((select) => {
          select.value = "proposal";
          select.dispatchEvent(new Event("change", { bubbles: true }));
          select.value = "negotiation";
          select.dispatchEvent(new Event("change", { bubbles: true }));
        });
      await page.waitForFunction(() =>
        [
          ...document.querySelectorAll('[aria-label="Close gig details"]'),
        ].every((button) => button.disabled),
      );
      assert.equal(
        await gigDialog
          .getByLabel("Close gig details")
          .evaluateAll((buttons) => buttons.every((button) => button.disabled)),
        true,
        "queued Gig mutations must lock both close controls",
      );
      assert.equal(
        await gigDialog.getByRole("button", { name: "Done" }).isDisabled(),
        true,
        "queued Gig mutations must lock the footer dismiss action",
      );
      await page.keyboard.press("Escape");
      await gigDialog.waitFor();
      await gigDialog.getByRole("button", { name: "Start Work" }).waitFor();
      assert.equal(
        queuedGigPatchCount,
        2,
        "rapid Gig mutations must run in order without dropping the latest status",
      );
      await page.unroute(`**/api/gigs/${createdGigId}`);
      await page.waitForFunction(() => {
        const button = [...document.querySelectorAll("button")].find(
          (candidate) => candidate.textContent.trim() === "Start Work",
        );
        return button && !button.disabled;
      });
      await page.keyboard.press("Escape");
      await gigDialog.waitFor({ state: "hidden" });
      await page.getByLabel("Search my gigs").fill("Career Tools Lab");
      await page
        .locator(".v2-gig-applications")
        .getByText("Application Approved")
        .waitFor();
      await assertAccessible(page, "Gigs");

      await page.locator('[title="Profile and settings"]').click();
      assert.equal(
        await page
          .locator('[title="Profile and settings"]')
          .getAttribute("aria-haspopup"),
        "menu",
        "the desktop workspace trigger should advertise its real menu",
      );
      const workspaceMenu = page.getByRole("menu", {
        name: "Local workspace menu",
      });
      await workspaceMenu.waitFor();
      const profileMenuItem = workspaceMenu.getByRole("menuitem", {
        name: "Profile & usage",
      });
      const dataMenuItem = workspaceMenu.getByRole("menuitem", {
        name: "Settings & data",
      });
      await page.waitForFunction(
        () =>
          document.activeElement?.getAttribute("role") === "menuitem" &&
          document.activeElement?.textContent?.includes("Profile & usage"),
      );
      assert.equal(
        await profileMenuItem.evaluate(
          (menuitem) => menuitem === document.activeElement,
        ),
        true,
        "opening the workspace menu should move focus into it",
      );
      await page.keyboard.press("ArrowDown");
      assert.equal(
        await dataMenuItem.evaluate(
          (menuitem) => menuitem === document.activeElement,
        ),
        true,
        "workspace menu arrows should move between actions",
      );
      await page.keyboard.press("Escape");
      await workspaceMenu.waitFor({ state: "hidden" });
      const workspaceMenuTrigger = page.locator(
        '[title="Profile and settings"]',
      );
      assert.equal(
        await workspaceMenuTrigger.evaluate(
          (trigger) => trigger === document.activeElement,
        ),
        true,
        "closing the workspace menu should restore focus to its trigger",
      );
      await workspaceMenuTrigger.click();
      await workspaceMenu
        .getByRole("menuitem", { name: "Profile & usage" })
        .click();
      await page.getByRole("heading", { name: "User Center" }).waitFor();
      assert.equal(new URL(page.url()).hash, "#/settings");
      await page.reload();
      await page.getByRole("heading", { name: "User Center" }).waitFor();
      assert.deepEqual(
        await page.evaluate(() => {
          const styles = (selector) =>
            window.getComputedStyle(document.querySelector(selector));
          return {
            page: [
              styles(".v2-settings-page").maxWidth,
              styles(".v2-settings-page").padding,
            ],
            tabs: [
              styles(".v2-user-tabs button").fontSize,
              styles(".v2-user-tabs button").fontWeight,
            ],
            intro: [
              styles(".v2-page-intro h2").fontSize,
              styles(".v2-page-intro h2").fontWeight,
              styles(".v2-page-intro p").fontSize,
            ],
            avatar: [
              styles(".v2-user-avatar-large").width,
              styles(".v2-user-avatar-large").backgroundColor,
            ],
            identity: styles(".v2-user-identity").textAlign,
          };
        }),
        {
          page: ["1200px", "24px"],
          tabs: ["9.625px", "600"],
          intro: ["22px", "700", "14px"],
          avatar: ["80px", "rgb(248, 250, 252)"],
          identity: "center",
        },
        "User Center should retain the authoritative v2 profile proportions",
      );
      const profileTab = page.getByRole("tab", { name: "Profile & Usage" });
      await profileTab.focus();
      await page.keyboard.press("ArrowRight");
      const coachesTab = page.getByRole("tab", { name: "Coaches" });
      assert.equal(await coachesTab.getAttribute("aria-selected"), "true");
      assert.equal(
        await coachesTab.evaluate((tab) => tab === document.activeElement),
        true,
      );
      await page.keyboard.press("ArrowLeft");
      assert.equal(await profileTab.getAttribute("aria-selected"), "true");
      assert.equal(
        await profileTab.evaluate((tab) => tab === document.activeElement),
        true,
      );
      await assertNamedFormControls(page, "User Center profile");
      const originalHeadline = await page
        .getByLabel("Professional headline")
        .inputValue();
      await page
        .getByLabel("Professional headline")
        .fill("Unsaved E2E profile draft");
      await page.locator('[title="Data and privacy"]').click();
      await page.getByRole("heading", { name: "Settings & data" }).waitFor();
      await page.locator('[title="Profile and settings"]').click();
      await page.getByRole("menuitem", { name: "Profile & usage" }).click();
      await page.getByText("Private User Center draft restored.").waitFor();
      assert.equal(
        await page.getByLabel("Professional headline").inputValue(),
        "Unsaved E2E profile draft",
        "private User Center edits should survive navigation before save",
      );
      await page.getByLabel("Professional headline").fill(originalHeadline);
      await page.getByLabel("First name").fill("E2E");
      await page.getByLabel("Last name").fill("Hunter");
      await page.getByLabel("Nickname (for job cards)").fill("E2E Builder");
      await page.getByLabel("Base resume text").fill("");
      assert.equal(
        await page.getByRole("button", { name: "Save profile" }).isDisabled(),
        true,
        "a valid base resume must not be accidentally replaced with empty content",
      );
      await page.getByText(/Keep a complete resume in your profile/).waitFor();
      await page.getByLabel("Replace base resume").setInputFiles({
        name: "updated-profile-resume.txt",
        mimeType: "text/plain",
        buffer: Buffer.from(
          "E2E profile resume replacement. Product engineer with nine years of React and TypeScript delivery. Increased activation by 42% and led accessible platform launches.",
        ),
      });
      await page.waitForFunction(() =>
        document
          .querySelector('[aria-label="Base resume text"]')
          ?.value.includes("E2E profile resume replacement"),
      );
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
      assert.match(
        await page.getByLabel("Base resume text").inputValue(),
        /E2E profile resume replacement/,
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
      await page.goto(`${baseUrl}/#/settings?tab=about`);
      await page.getByRole("tab", { name: "About Me" }).waitFor();
      assert.equal(
        await page
          .getByRole("tab", { name: "About Me" })
          .getAttribute("aria-selected"),
        "true",
        "legacy About Me links should continue to open the correct v2 tab",
      );
      await assertNamedFormControls(page, "User Center About Me");
      assert.equal(new URL(page.url()).hash, "#/settings?tab=about-me");
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
        "The product mission, customer impact, and role scope match my experience.",
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
        "The product mission, customer impact, and role scope match my experience.",
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
            response.url().endsWith("/api/profile/faqs/delete") &&
            response.request().method() === "POST" &&
            response.ok(),
        ),
        deleteFaqDialog
          .getByRole("button", { name: "Delete question" })
          .click(),
      ]);
      const removableAnswer = page.getByRole("textbox", {
        name: removableQuestion,
        exact: true,
      });
      await removableAnswer.waitFor({ state: "detached" });
      assert.equal(
        await page.getByText("Changes saved locally.").count(),
        0,
        "deleting an FAQ must not claim that other dirty User Center edits were saved",
      );
      await page.reload();
      assert.equal(
        await page
          .getByRole("textbox", { name: removableQuestion, exact: true })
          .count(),
        0,
        "deleted FAQ questions should remain deleted after reload",
      );
      await page.getByRole("tab", { name: "Settings" }).click();
      await assertNamedFormControls(page, "User Center settings");
      assert.equal(new URL(page.url()).hash, "#/settings?tab=settings");
      await page.getByLabel("Weekly application goal").waitFor();
      await page.getByLabel("ATS template application threshold").fill("85");
      let delayedProfileSaveCount = 0;
      await page.route("**/api/profile", async (route) => {
        delayedProfileSaveCount += 1;
        if (delayedProfileSaveCount === 1)
          await new Promise((resolve) => setTimeout(resolve, 250));
        await route.continue();
      });
      const delayedSettingsSave = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/profile") &&
          response.request().method() === "PUT" &&
          response.ok(),
      );
      await page
        .getByRole("button", { name: "Save settings" })
        .evaluate((button) => {
          button.click();
          button.click();
        });
      const savingSettings = page.getByRole("button", { name: "Saving…" });
      await savingSettings.waitFor();
      assert.equal(await savingSettings.isDisabled(), true);
      await page.getByLabel("ATS template application threshold").fill("90");
      await delayedSettingsSave;
      await page.waitForTimeout(100);
      assert.equal(
        delayedProfileSaveCount,
        1,
        "same-frame User Center clicks must create exactly one profile save",
      );
      await page.getByRole("button", { name: "Save settings" }).waitFor();
      assert.equal(
        await page.getByText("Changes saved locally.").count(),
        0,
        "an older save must not mark newer User Center edits as persisted",
      );
      await page.unroute("**/api/profile");
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
      const settingsSavedNotice = page.getByText("Changes saved locally.");
      await settingsSavedNotice.waitFor();
      await page.getByLabel("ATS template application threshold").fill("90");
      await settingsSavedNotice.waitFor({ state: "hidden" });
      await page.getByLabel("ATS template application threshold").fill("85");
      await assertAccessible(page, "User Center");
      await page.locator('[title="Data and privacy"]').click();
      await page.getByRole("heading", { name: "Settings & data" }).waitFor();
      await assertNamedFormControls(page, "Settings and data");
      const [jobsCsvDownload] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("link", { name: "Download jobs CSV" }).click(),
      ]);
      assert.equal(jobsCsvDownload.suggestedFilename(), "jobhuntr-jobs.csv");
      const exportedJobsCsv = await fs.readFile(
        await jobsCsvDownload.path(),
        "utf8",
      );
      assert.match(
        exportedJobsCsv,
        /^company,title,status,location,salary,url,source,fitScore,tags,description/m,
      );
      const importedCsv = [
        "company,title,location,status,url,tags",
        'CSV Journey Co,"Imported, Product Engineer",Remote,interested,https://example.com/jobs/csv-journey,"React, Product"',
      ].join("\n");
      await page.getByLabel("Import jobs CSV").setInputFiles({
        name: "jobhuntr-jobs-import.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(importedCsv),
      });
      await page.getByRole("button", { name: "Import CSV" }).click();
      await page.getByText("1 jobs imported · 0 duplicates skipped").waitFor();
      await page.getByRole("button", { name: "Import CSV" }).click();
      await page.getByText("0 jobs imported · 1 duplicates skipped").waitFor();
      const [backupDownload] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("link", { name: "Download JSON" }).click(),
      ]);
      assert.equal(backupDownload.suggestedFilename(), "jobhuntr-export.json");
      const exportedBackup = JSON.parse(
        await fs.readFile(await backupDownload.path(), "utf8"),
      );
      assert.equal(exportedBackup.profile.nickname, "E2E Builder");
      assert.ok(exportedBackup.jobs.length > 0);
      const restoreWorkspaceCard = page.locator(".v2-data-card").filter({
        has: page.getByRole("heading", { name: "Restore workspace" }),
      });
      await page.getByLabel("Import JobHuntr JSON backup").setInputFiles({
        name: "not-a-backup.json",
        mimeType: "application/json",
        buffer: Buffer.from("not valid json"),
      });
      await restoreWorkspaceCard.getByRole("alert").waitFor();
      assert.equal(
        await page.locator(".v2-error-toast").count(),
        0,
        "expected inline backup validation should not duplicate itself as a global error toast",
      );
      assert.equal(
        await page.getByText("0 jobs imported · 1 duplicates skipped").count(),
        1,
        "an invalid backup should not clear the separate CSV import result",
      );
      assert.equal(
        await restoreWorkspaceCard
          .getByRole("button", { name: "Review restore" })
          .isDisabled(),
        true,
        "an invalid backup must remain impossible to restore",
      );
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
      await restoreWorkspaceCard
        .getByRole("alert")
        .waitFor({ state: "hidden" });
      await page.getByText(/Contains 1 jobs, 1 resumes/).waitFor();
      await page.getByText(/1 coach chats/).waitFor();
      await page
        .getByText(/profile will reset to the first-run defaults/)
        .waitFor();
      await page.getByRole("button", { name: "Review restore" }).click();
      const restoreDialog = page.getByRole("dialog", {
        name: "Replace this workspace?",
      });
      await restoreDialog.waitFor();
      assert.equal(
        await restoreDialog
          .getByRole("button", { name: "Cancel" })
          .evaluate((button) => button === document.activeElement),
        true,
        "workspace restore should focus its safe cancel action",
      );
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

      const documentRestorePoint = await (
        await page.request.get(`${baseUrl}/api/state`)
      ).json();
      const malformedDocumentRestore = await page.request.post(
        `${baseUrl}/api/import`,
        {
          data: {
            ...documentRestorePoint,
            profile: {
              ...documentRestorePoint.profile,
              onboarded: true,
              name: { unsafe: true },
              firstName: { unsafe: true },
              lastName: { unsafe: true },
              nickname: { unsafe: true },
              headline: { unsafe: true },
              location: { unsafe: true },
              targetRoles: ["Restored Product Engineer", { unsafe: true }],
              skills: ["Restored React", { unsafe: true }],
              resumeText: { unsafe: true },
              additionalInfo: { unsafe: true },
              preferences: {
                remote: "yes",
                locations: ["Restored Remote", { unsafe: true }],
                minSalary: -1,
                weeklyApplicationGoal: 999,
                atsThreshold: -5,
              },
              faqAnswers: [
                {
                  id: "duplicate-browser-faq",
                  question: { unsafe: true },
                  answer: { unsafe: true },
                },
                {
                  id: "duplicate-browser-faq",
                  question: "Restored FAQ question",
                  answer: "Restored FAQ answer",
                },
              ],
            },
            huntPresets: [
              {
                id: "malformed-browser-preset",
                name: { unsafe: true },
                options: { q: { unsafe: true }, workflows: ["linkedin"] },
              },
              {
                id: "malformed-browser-preset",
                name: "Restored browser preset",
                options: { q: "Restored role", workflows: ["indeed"] },
              },
            ],
            profileAudits: [
              {
                id: "malformed-browser-audit",
                input: {
                  profileUrl: "javascript:alert(1)",
                  headline: { unsafe: true },
                  skills: ["Restored React", { unsafe: true }],
                },
                total: 500,
                checks: [
                  {
                    section: { unsafe: true },
                    score: -20,
                    status: "unsafe",
                    detail: { unsafe: true },
                  },
                ],
                matchedTerms: ["restored", { unsafe: true }],
                suggestions: ["Restored audit suggestion", { unsafe: true }],
              },
            ],
            agentRuns: [
              {
                id: "malformed-browser-run",
                runName: { unsafe: true },
                search: { q: { unsafe: true } },
                status: "unsafe",
                matches: [
                  {
                    company: { unsafe: true },
                    title: { unsafe: true },
                    url: "javascript:alert(1)",
                    reasons: ["Restored run reason", { unsafe: true }],
                  },
                ],
                steps: [{ name: { unsafe: true }, detail: { unsafe: true } }],
              },
            ],
            infiniteHunt: {
              enabled: "true",
              generation: { unsafe: true },
              intervalMinutes: 99999,
              options: {
                q: { unsafe: true },
                workflows: ["linkedin", { unsafe: true }],
              },
              startedAt: { unsafe: true },
              nextRunAt: "not-a-date",
              lastRunAt: "not-a-date",
              lastError: { unsafe: true },
            },
            jobs: documentRestorePoint.jobs.map((job, index) =>
              index === 0
                ? {
                    ...job,
                    company: { unsafe: true },
                    title: { unsafe: true },
                    location: { unsafe: true },
                    url: "javascript:alert(1)",
                    source: { unsafe: true },
                    salary: { unsafe: true },
                    description: { unsafe: true },
                    status: "interview",
                    tags: ["Restored tag", { unsafe: true }],
                    matchReasons: ["Restored match reason", { unsafe: true }],
                    fitScore: 400,
                    numApplicants: -20,
                    notes: [
                      {
                        id: "duplicate-browser-note",
                        text: { unsafe: true },
                      },
                      {
                        id: "duplicate-browser-note",
                        text: "Restored private note",
                      },
                    ],
                    tasks: [
                      {
                        id: "duplicate-browser-task",
                        text: { unsafe: true },
                        due: "tomorrow",
                        done: true,
                      },
                      {
                        id: "duplicate-browser-task",
                        text: "Restored follow-up task",
                        due: "2030-04-05",
                        done: false,
                      },
                    ],
                    contacts: [
                      {
                        id: "duplicate-browser-contact",
                        name: { unsafe: true },
                        role: { unsafe: true },
                        email: { unsafe: true },
                        linkedIn: { unsafe: true },
                      },
                      {
                        id: "duplicate-browser-contact",
                        name: "Restored Contact",
                        role: "Recruiter",
                      },
                    ],
                    interviewRounds: [
                      {
                        id: "duplicate-browser-round",
                        roundType: { unsafe: true },
                        notes: { unsafe: true },
                      },
                      {
                        id: "duplicate-browser-round",
                        roundType: "Interview Round 2",
                        notes: "Restored interview notes",
                      },
                    ],
                    statusHistory: [
                      { status: "interview", at: { unsafe: true } },
                    ],
                  }
                : job,
            ),
            templates: [
              {
                id: "malformed-browser-template",
                name: { unsafe: true },
                description: { unsafe: true },
                sections: "invalid",
              },
            ],
            resumes: [
              {
                id: "malformed-browser-resume",
                name: { unsafe: true },
                content: { unsafe: true },
                templateId: "missing-template",
              },
            ],
            coverLetters: [
              {
                id: "malformed-browser-letter",
                title: { unsafe: true },
                body: { unsafe: true },
              },
            ],
            coachConversations: [
              {
                id: "malformed-browser-conversation",
                title: { unsafe: true },
                messages: [
                  { role: "system", content: "Do not render" },
                  { role: "user", content: { unsafe: true } },
                  { role: "user", content: "Restored coaching question" },
                  {
                    role: "assistant",
                    content: "Restored coaching answer",
                  },
                ],
              },
            ],
            careerStories: [
              {
                id: "malformed-browser-story",
                title: { unsafe: true },
                action: { unsafe: true },
                result: "Restored measurable result",
                skills: ["React", { unsafe: true }],
              },
            ],
            coachingSessions: [
              {
                id: "malformed-browser-session",
                questions: ["Restored practice question", { unsafe: true }],
                answers: {
                  "Restored practice question": "Restored practice answer",
                },
                matchedStoryIds: ["malformed-browser-story", "missing-story"],
                talkingPoints: ["Restored talking point", { unsafe: true }],
                companyResearch: ["Restored research task", { unsafe: true }],
                researchDone: ["Restored research task", "Unknown task"],
              },
            ],
            outreachDrafts: [
              {
                id: "duplicate-browser-outreach",
                jobId: documentRestorePoint.jobs[0].id,
                recipient: { unsafe: true },
                subject: { unsafe: true },
                body: { unsafe: true },
                status: "sending",
                category: "unknown",
              },
              {
                id: "duplicate-browser-outreach",
                jobId: documentRestorePoint.jobs[0].id,
                recipient: "Restored Contact",
                subject: "Restored outreach subject",
                body: "Restored outreach body",
                status: "replied",
                category: "recruiter",
              },
            ],
            gigs: [
              {
                id: "duplicate-browser-gig",
                client: { unsafe: true },
                title: { unsafe: true },
                source: { unsafe: true },
                budget: -200,
                earned: 999999999,
                dueDate: "tomorrow",
                description: { unsafe: true },
                proposal: { unsafe: true },
                status: "paying",
                statusHistory: [{ status: "unknown", at: { unsafe: true } }],
              },
              {
                id: "duplicate-browser-gig",
                client: "Restored Client",
                title: "Restored Gig",
                source: "Partner Board",
                budget: "2500",
                earned: "500",
                dueDate: "2030-03-15",
                description: "Restored gig description",
                proposal: "Restored gig proposal",
                status: "in-progress",
                statusHistory: [
                  { status: "proposal", at: "2029-01-01T00:00:00.000Z" },
                ],
              },
            ],
          },
        },
      );
      assert.equal(malformedDocumentRestore.ok(), true);
      await page.goto(`${baseUrl}/#/resume`);
      await page.reload();
      await page
        .getByRole("heading", { name: "ATS Resume Templates" })
        .waitFor();
      await page
        .locator(".v2-resume-templates b", { hasText: "Resume Template 1" })
        .waitFor();
      await page.getByRole("button", { name: "Show All" }).click();
      await page
        .locator(".v2-resume-groups b", { hasText: "Resume 1" })
        .first()
        .waitFor();
      await assertAccessible(page, "Restored Resume Studio");
      await page.goto(`${baseUrl}/#/cover-letter`);
      await page
        .getByRole("heading", { name: "Cover Letters", exact: true })
        .waitFor();
      await page
        .locator(".v2-template-grid footer b", { hasText: "Cover Letter 1" })
        .waitFor();
      await assertAccessible(page, "Restored Cover Letters");
      await page.goto(`${baseUrl}/#/coach`);
      await page
        .getByRole("button", { name: /Career coaching session/ })
        .first()
        .click();
      await page
        .getByText("Restored coaching question", { exact: true })
        .waitFor();
      await page
        .getByText("Restored coaching answer", { exact: true })
        .waitFor();
      await page.getByRole("button", { name: "Interview practice" }).click();
      await page.getByText(/Restored practice question/).waitFor();
      await page.getByRole("button", { name: "STAR story vault" }).click();
      await page.getByText("STAR Story 1", { exact: true }).waitFor();
      await page
        .getByText("Restored measurable result", { exact: true })
        .waitFor();
      await assertAccessible(page, "Restored Career Coach");
      await page.goto(`${baseUrl}/#/outreach`);
      await page.getByRole("heading", { name: "Outreach" }).waitFor();
      await page.getByText("Hiring team", { exact: true }).first().waitFor();
      await page.getByText("Outreach draft 1", { exact: true }).waitFor();
      await page.getByLabel("Show Connection Messages").check();
      assert.equal(
        await page.getByLabel("Subject").inputValue(),
        "Outreach draft 1",
      );
      assert.equal(
        await page
          .getByRole("textbox", { name: "Message", exact: true })
          .inputValue(),
        "",
      );
      await page.getByLabel("Subject").fill("Unsaved outreach subject");
      await page
        .getByRole("button", { name: /Restored Contact/ })
        .first()
        .click();
      const discardOutreachDialog = page.getByRole("alertdialog", {
        name: "Discard outreach changes?",
      });
      await discardOutreachDialog.waitFor();
      await assertAccessible(page, "Discard outreach changes confirmation");
      await discardOutreachDialog
        .getByRole("button", { name: "Cancel" })
        .click();
      await discardOutreachDialog.waitFor({ state: "hidden" });
      assert.equal(
        await page.getByLabel("Subject").inputValue(),
        "Unsaved outreach subject",
        "canceling contact navigation should preserve the unsaved message",
      );
      await page
        .getByRole("button", { name: /Restored Contact/ })
        .first()
        .click();
      await discardOutreachDialog.waitFor();
      await discardOutreachDialog
        .getByRole("button", { name: "Discard Changes" })
        .click();
      await discardOutreachDialog.waitFor({ state: "hidden" });
      assert.equal(
        await page.getByLabel("Subject").inputValue(),
        "Restored outreach subject",
      );
      assert.equal(
        await page
          .getByRole("textbox", { name: "Message", exact: true })
          .inputValue(),
        "Restored outreach body",
      );
      await assertAccessible(page, "Restored Outreach");
      await page.goto(`${baseUrl}/#/gigs`);
      await page.getByRole("heading", { name: "Gigs", exact: true }).waitFor();
      await page.getByText("Gig opportunity 1", { exact: true }).waitFor();
      await page.getByText("Restored Gig", { exact: true }).waitFor();
      assert.equal(
        await page.getByText("Invalid Date", { exact: true }).count(),
        0,
      );
      await page
        .locator(".v2-gig-applications")
        .getByRole("button", { name: /Restored Gig/ })
        .click();
      const restoredGigDialog = page.getByRole("dialog", {
        name: "Restored Gig",
      });
      await restoredGigDialog.waitFor();
      assert.equal(
        await restoredGigDialog.getByLabel("Potential earning").inputValue(),
        "2500",
      );
      assert.equal(
        await restoredGigDialog.getByLabel("Actual earning").inputValue(),
        "500",
      );
      assert.equal(
        await restoredGigDialog.getByLabel("Deadline").inputValue(),
        "2030-03-15",
      );
      assert.equal(
        await restoredGigDialog
          .getByLabel("Proposal / delivery notes")
          .inputValue(),
        "Restored gig proposal",
      );
      await assertAccessible(page, "Restored Gigs");
      await page.keyboard.press("Escape");
      await page.goto(
        `${baseUrl}/#/tracker?job=${documentRestorePoint.jobs[0].id}`,
      );
      const restoredJobDrawer = page.getByRole("dialog", {
        name: "Job opportunity 1 at Company 1 details",
      });
      await restoredJobDrawer.waitFor();
      await restoredJobDrawer
        .locator(".note", { hasText: "Restored private note" })
        .waitFor();
      await restoredJobDrawer
        .locator(".task-row", { hasText: "Restored follow-up task" })
        .waitFor();
      await restoredJobDrawer
        .locator(".interview-round-list article", {
          hasText: "Restored interview notes",
        })
        .waitFor();
      assert.equal(
        await restoredJobDrawer
          .getByText("Invalid Date", { exact: true })
          .count(),
        0,
      );
      assert.equal(
        await restoredJobDrawer
          .getByRole("link", { name: /Open job listing/ })
          .count(),
        0,
      );
      await assertAccessible(page, "Restored Job Tracker");
      await page.goto(`${baseUrl}/#/settings?tab=about-me`);
      await page.getByRole("heading", { name: "User Center" }).waitFor();
      await page.getByRole("tab", { name: "About Me" }).waitFor();
      const restoredFaq = page.getByLabel("Restored FAQ question", {
        exact: true,
      });
      await restoredFaq.waitFor();
      assert.equal(await restoredFaq.inputValue(), "Restored FAQ answer");
      assert.equal(
        await page.getByText("[object Object]", { exact: true }).count(),
        0,
      );
      await assertAccessible(page, "Restored About Me");
      await page
        .getByRole("button", { name: "Infinite Hunting", exact: true })
        .click();
      await page.getByRole("heading", { name: "Infinite Hunting" }).waitFor();
      await page
        .getByRole("button", {
          name: "Restored browser preset",
          exact: true,
        })
        .waitFor();
      assert.equal(
        await page.getByText(/Infinite Hunt is active every/).count(),
        0,
        "a malformed restored schedule must fail closed instead of running autonomously",
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Start infinite hunt", exact: true })
          .isEnabled(),
        true,
      );
      await assertAccessible(page, "Restored Infinite Hunting");
      await page.getByRole("button", { name: "LinkedIn Audit" }).click();
      await page
        .getByRole("heading", { name: "LinkedIn Profile Audit" })
        .waitFor();
      await page
        .locator(".recommendation", { hasText: "Restored audit suggestion" })
        .waitFor();
      assert.equal(
        await page.getByText("[object Object]", { exact: true }).count(),
        0,
      );
      await assertAccessible(page, "Restored LinkedIn Audit");
      const restoredDocumentWorkspace = await page.request.post(
        `${baseUrl}/api/import`,
        { data: documentRestorePoint },
      );
      assert.equal(restoredDocumentWorkspace.ok(), true);
      await page.goto(`${baseUrl}/#/privacy`);
      await page.getByRole("heading", { name: "Settings & data" }).waitFor();

      const mobileContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
      });
      const mobile = await mobileContext.newPage();
      await mobile.goto(baseUrl);
      await mobile.getByRole("heading", { name: /Welcome back/ }).waitFor();
      await mobile.setViewportSize({ width: 1024, height: 844 });
      await mobile
        .locator(".v2-sidebar")
        .hover({ position: { x: 30, y: 100 } });
      await mobile.locator(".v2-sidebar.expanded").waitFor();
      await mobile.setViewportSize({ width: 390, height: 844 });
      await mobile.locator(".v2-sidebar.collapsed").waitFor();
      assert.ok(
        (await mobile.locator(".v2-nav button").count()) >= 12,
        "resizing an expanded desktop sidebar must preserve every mobile navigation destination",
      );
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
      const floatingActions = await mobile.evaluate(() => {
        const bounds = (selector) => {
          const box = document.querySelector(selector).getBoundingClientRect();
          return {
            top: Math.round(box.top),
            right: Math.round(box.right),
            bottom: Math.round(box.bottom),
            left: Math.round(box.left),
          };
        };
        return {
          farewell: bounds(".v2-farewell-button"),
          farewellPosition: getComputedStyle(
            document.querySelector(".v2-farewell-button"),
          ).position,
          hunt: bounds(".v2-hunt-float > button"),
          navigation: bounds(".v2-sidebar"),
        };
      });
      assert.ok(
        floatingActions.farewellPosition === "static" &&
          floatingActions.farewell.left >= 16 &&
          floatingActions.farewell.right <= 374 &&
          floatingActions.hunt.bottom < floatingActions.navigation.top,
        "mobile Overview actions must stay in-flow or above navigation without covering dashboard content",
      );
      await assertAccessible(mobile, "Mobile Overview");
      await mobile
        .getByRole("button", { name: "Submission Queue", exact: true })
        .click();
      await mobile
        .getByRole("heading", { name: "Submission Queue" })
        .first()
        .waitFor();
      assert.match(
        mobile.url(),
        /#\/queue/,
        "the first real click in the bottom navigation must not be swallowed by desktop hover expansion",
      );
      await mobile
        .getByRole("button", { name: "Job Board", exact: true })
        .click();
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
        ["ATS Templates", "ATS Resume"],
        ["Cover Letter", "Cover Letters"],
        ["Job Tracker", "Job Tracker"],
        ["Outreach", "Outreach"],
        ["LinkedIn Audit", "LinkedIn Profile Audit"],
        ["Gigs", "Gigs"],
        ["AI Career Coach", "Hi, I'm your Career Coach!"],
        ["Profile and settings", "User Center"],
        ["Data and privacy", "Settings & data"],
      ]) {
        await mobile.locator(`button[title="${navigation}"]`).click();
        await mobile.getByRole("heading", { name: heading }).first().waitFor();
        await assertNamedFormControls(mobile, `Mobile ${navigation}`);
        assert.equal(
          await mobile.getByText("Invalid Date", { exact: true }).count(),
          0,
          `${navigation} should never render invalid dates on mobile`,
        );
        if (navigation === "Infinite Hunting") {
          const actionBounds = await mobile
            .locator(".v2-hunt-actions > button, .v2-hunt-actions select")
            .evaluateAll((controls) =>
              controls.map((control) => {
                const box = control.getBoundingClientRect();
                return { left: box.left, right: box.right, width: box.width };
              }),
            );
          assert.equal(actionBounds.length, 4);
          assert.ok(
            actionBounds.every(
              ({ left, right, width }) =>
                left >= 0 && right <= 390 && width >= 100,
            ),
            "every Infinite Hunt action must remain fully visible and usable on a 390px window",
          );
        }
        if (navigation === "Agent Runs") {
          const runHeader = await mobile.evaluate(() => {
            const heading = document
              .querySelector(".v2-runs-page > .v2-page-intro h1")
              .getBoundingClientRect();
            const buttons = [
              ...document.querySelectorAll(
                ".v2-runs-page > .v2-page-intro .inline button",
              ),
            ].map((button) => button.getBoundingClientRect());
            return {
              headingBottom: Math.round(heading.bottom),
              buttonTop: Math.round(buttons[0].top),
              widths: buttons.map((button) => Math.round(button.width)),
            };
          });
          assert.ok(
            runHeader.buttonTop > runHeader.headingBottom &&
              Math.abs(runHeader.widths[0] - runHeader.widths[1]) <= 1,
            "mobile Agent Runs should stack a balanced action row below the full-width heading",
          );
          const runRow = mobile.locator(".v2-run-row").first();
          assert.equal(
            await runRow.evaluate((row) => {
              const columns = window
                .getComputedStyle(row)
                .gridTemplateColumns.split(" ");
              return `${columns.length}:${columns[0]}:${columns.at(-1)}`;
            }),
            "3:24px:36px",
            "mobile Agent Runs should reserve a visible action column",
          );
          assert.equal(
            await runRow
              .getByRole("button", { name: /Actions for/ })
              .isVisible(),
            true,
            "mobile users must be able to manage an individual agent run",
          );
        }
        if (navigation === "ATS Templates") {
          assert.deepEqual(
            await mobile.locator(".v2-resume-history").evaluate((history) => {
              const bounds = history.getBoundingClientRect();
              return {
                left: bounds.left,
                right: bounds.right,
                headerDirection: getComputedStyle(
                  history.querySelector(".v2-resume-history-head"),
                ).flexDirection,
              };
            }),
            { left: 20, right: 370, headerDirection: "column" },
            "ATS resume history should remain fully visible at 390px",
          );
        }
        if (navigation === "Cover Letter") {
          await mobile
            .getByRole("button", { name: "Create Cover Letter" })
            .click();
          await mobile
            .getByRole("heading", { name: "Choose a Template" })
            .waitFor();
          assert.deepEqual(
            await mobile.locator(".v2-cover-wizard").evaluate((wizard) => {
              const footer = wizard.querySelector(".v2-cover-step-actions");
              const navigation = document.querySelector(".v2-sidebar");
              const wizardBounds = wizard.getBoundingClientRect();
              const footerBounds = footer.getBoundingClientRect();
              const navigationBounds = navigation.getBoundingClientRect();
              return {
                wizard: [
                  wizardBounds.left,
                  wizardBounds.top,
                  wizardBounds.right,
                  wizardBounds.bottom,
                ],
                footerAboveNavigation:
                  footerBounds.bottom <= navigationBounds.top + 1,
                continueVisible:
                  footer.querySelector("button:last-child").offsetParent !==
                  null,
              };
            }),
            {
              wizard: [0, 0, 390, 784],
              footerAboveNavigation: true,
              continueVisible: true,
            },
            "the cover-letter wizard should remain fully operable above mobile navigation",
          );
          await mobile
            .getByRole("button", { name: "Back to cover letters" })
            .click();
          await mobile
            .getByRole("heading", { name: "Cover Letters" })
            .waitFor();
        }
        if (navigation === "Profile and settings") {
          assert.equal(
            await mobile
              .locator('button[title="Profile and settings"]')
              .getAttribute("aria-haspopup"),
            null,
            "the mobile profile shortcut must not advertise a menu it never opens",
          );
          const userTabs = mobile.getByRole("tablist", {
            name: "User Center",
          });
          assert.equal(
            await userTabs.getByRole("tab").count(),
            4,
            "mobile User Center should expose every v2 tab",
          );
          const userTabGeometry = await userTabs.evaluate((tablist) => {
            const tabs = [...tablist.querySelectorAll('[role="tab"]')];
            const bounds = tabs.map((tab) => tab.getBoundingClientRect());
            return {
              scrollable: tablist.scrollWidth > tablist.clientWidth,
              separated: bounds.every(
                (box, index) =>
                  !bounds[index + 1] || box.right <= bounds[index + 1].left,
              ),
            };
          });
          assert.deepEqual(
            userTabGeometry,
            { scrollable: true, separated: true },
            "mobile User Center tabs should remain readable in a scrollable strip",
          );
          await userTabs.getByRole("tab", { name: "Settings" }).click();
          await mobile
            .getByRole("heading", { name: "Career preferences" })
            .waitFor();
          assert.equal(
            await userTabs
              .getByRole("tab", { name: "Settings" })
              .evaluate((tab) => {
                const tabBounds = tab.getBoundingClientRect();
                const listBounds = tab.parentElement.getBoundingClientRect();
                return (
                  tabBounds.left >= listBounds.left &&
                  tabBounds.right <= listBounds.right
                );
              }),
            true,
            "the active User Center tab should scroll fully into view",
          );
        }
        if (navigation === "Job Tracker") {
          assert.equal(
            await mobile
              .locator(".tracker-status-filters input:checked")
              .count(),
            6,
            "a new user should inherit v2's six active tracker columns while terminal columns stay hidden",
          );
          const mobileTrackerColumn = mobile.locator(".status-column").first();
          const trackerGeometry = await mobileTrackerColumn.evaluate(
            (column) => ({
              columnWidth: column.getBoundingClientRect().width,
              cardWidths: [...column.querySelectorAll(".job-card")].map(
                (card) => card.getBoundingClientRect().width,
              ),
            }),
          );
          assert.ok(
            trackerGeometry.columnWidth >= 356 &&
              trackerGeometry.columnWidth <= 360 &&
              trackerGeometry.cardWidths.every(
                (width) => width >= trackerGeometry.columnWidth - 28,
              ),
            "v2 tracker columns and stacked cards should use the readable mobile viewport width",
          );
          await mobile.locator(".kanban-card").first().click();
          const mobileJobDrawer = mobile.locator(".job-drawer");
          await mobileJobDrawer.waitFor();
          await mobile.waitForTimeout(350);
          const mobileDrawerBounds = await mobileJobDrawer.evaluate(
            (drawer) => {
              const box = drawer.getBoundingClientRect();
              return {
                left: box.left,
                right: box.right,
                width: box.width,
                viewportWidth: window.innerWidth,
              };
            },
          );
          assert.deepEqual(mobileDrawerBounds, {
            left: 0,
            right: 390,
            width: 390,
            viewportWidth: 390,
          });
          await mobile
            .getByRole("button", { name: "Close job details" })
            .click();
        }
        const activeNavigationIsVisible = await mobile
          .locator(`button[title="${navigation}"]`)
          .evaluate((button) => {
            const buttonRect = button.getBoundingClientRect();
            const navigationRect = button
              .closest(".v2-nav")
              ?.getBoundingClientRect();
            if (!navigationRect)
              return buttonRect.left >= 0 && buttonRect.right <= innerWidth;
            return (
              buttonRect.left >= navigationRect.left - 1 &&
              buttonRect.right <= navigationRect.right + 1
            );
          });
        assert.equal(
          activeNavigationIsVisible,
          true,
          `${navigation} should scroll into the visible mobile navigation`,
        );
        const overflow = await mobile.evaluate(
          () =>
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth + 1,
        );
        assert.equal(overflow, false, `${heading} should fit a 390px viewport`);
      }
      await mobile.setViewportSize({ width: 390, height: 640 });
      await mobile.locator('button[title="Agent Runs"]').click();
      await mobile.getByRole("heading", { name: "Agent Runs" }).waitFor();
      await mobile.getByRole("button", { name: "New Run" }).click();
      const minimumWindowRunDialog = mobile.getByRole("dialog", {
        name: "Create New Agent Run",
      });
      await minimumWindowRunDialog.waitFor();
      await minimumWindowRunDialog
        .locator(".v2-new-run-modal")
        .evaluate((modal) => {
          modal.scrollTop = modal.scrollHeight;
        });
      const minimumWindowActions = await Promise.all(
        ["Cancel", "Create"].map((name) =>
          minimumWindowRunDialog
            .getByRole("button", { name, exact: true })
            .boundingBox(),
        ),
      );
      assert.ok(
        minimumWindowActions.every(
          (bounds) =>
            bounds &&
            bounds.x >= 0 &&
            bounds.x + bounds.width <= 390 &&
            bounds.y >= 0 &&
            bounds.y + bounds.height <= 640,
        ),
        "new-run actions should be reachable at Electron's minimum window size",
      );
      await minimumWindowRunDialog
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
      await mobile.setViewportSize({ width: 768, height: 700 });
      await mobile.locator('button[title="Agent Runs"]').click();
      await mobile.getByRole("heading", { name: "Agent Runs" }).waitFor();
      const tabletRunRow = mobile.locator(".v2-run-row").first();
      assert.equal(
        await tabletRunRow.evaluate((row) => {
          const bounds = row.getBoundingClientRect();
          const main = row.closest("main").getBoundingClientRect();
          const columns = getComputedStyle(row).gridTemplateColumns.split(" ");
          const action = row.querySelector('[aria-label^="Actions for"]');
          const actionBounds = action.getBoundingClientRect();
          return (
            columns.length === 3 &&
            bounds.right <= main.right &&
            actionBounds.right <= main.right &&
            getComputedStyle(action).display !== "none"
          );
        }),
        true,
        "tablet Agent Runs should preserve a visible action column without clipping the table",
      );
      await mobile.setViewportSize({ width: 800, height: 640 });
      const compactDesktopLayout = await mobile.evaluate(async () => {
        const sidebar = document.querySelector(".v2-sidebar");
        const main = document.querySelector("main");
        sidebar.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 220));
        const mainBounds = main.getBoundingClientRect();
        const pageBounds = document
          .querySelector(".v2-runs-page")
          .getBoundingClientRect();
        sidebar.dispatchEvent(
          new MouseEvent("mouseout", { bubbles: true, relatedTarget: main }),
        );
        return {
          sidebarExpanded: sidebar.classList.contains("expanded"),
          mainLeft: Math.round(mainBounds.left),
          mainRight: Math.round(mainBounds.right),
          pageRight: Math.round(pageBounds.right),
        };
      });
      assert.deepEqual(
        compactDesktopLayout,
        {
          sidebarExpanded: true,
          mainLeft: 64,
          mainRight: 800,
          pageRight: 800,
        },
        "an expanded v2 rail should overlay rather than crush an 800px Electron workspace",
      );
      await mobile.setViewportSize({ width: 320, height: 568 });
      await mobile.locator('button[title="Job Board"]').click();
      await mobile.getByRole("heading", { name: "Today's Picks" }).waitFor();
      const narrowBoardHeader = await mobile.evaluate(() => {
        const description = document
          .querySelector(".v2-board-header .v2-page-intro p")
          .getBoundingClientRect();
        const actions = [
          ...document.querySelectorAll(".v2-board-header-actions button"),
        ].map((button) => button.getBoundingClientRect());
        return {
          descriptionBottom: Math.round(description.bottom),
          actionTop: Math.round(actions[0].top),
          actionsFit: actions.every(
            (bounds) => bounds.left >= 0 && bounds.right <= innerWidth,
          ),
        };
      });
      assert.ok(
        narrowBoardHeader.actionTop > narrowBoardHeader.descriptionBottom &&
          narrowBoardHeader.actionsFit,
        "the narrow Job Board header should stack readable copy above fully visible actions",
      );
      await mobile.locator('button[title="AI Career Coach"]').click();
      await mobile
        .getByRole("heading", { name: "Hi, I'm your Career Coach!" })
        .waitFor();
      assert.equal(
        await mobile.locator(".coach-toolbar .segmented").evaluate((tabs) => {
          const buttons = [...tabs.querySelectorAll("button")];
          return (
            getComputedStyle(tabs).gridTemplateColumns.split(" ").length ===
              2 &&
            buttons.every((button) => {
              const bounds = button.getBoundingClientRect();
              return bounds.left >= 0 && bounds.right <= innerWidth;
            })
          );
        }),
        true,
        "every Career Coach mode should remain visible at 320px",
      );
      await mobile.locator('button[title="Data and privacy"]').click();
      await mobile.getByRole("heading", { name: "Settings & data" }).waitFor();
      await assertAccessible(mobile, "Mobile Settings and data");
      await mobileContext.close();

      exportedBackup.profile.nickname = "Restored E2E Builder";
      await page.getByLabel("Import JobHuntr JSON backup").setInputFiles({
        name: "jobhuntr-export-restored.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(exportedBackup)),
      });
      await page.getByText(/Contains \d+ jobs/).waitFor();
      await page.getByRole("button", { name: "Review restore" }).click();
      const finalRestoreDialog = page.getByRole("dialog", {
        name: "Replace this workspace?",
      });
      await finalRestoreDialog.waitFor();
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/import") &&
            response.request().method() === "POST" &&
            response.ok(),
        ),
        finalRestoreDialog
          .getByRole("button", { name: "Replace workspace" })
          .click(),
      ]);
      await page.getByRole("heading", { name: "Settings & data" }).waitFor();
      await page.locator('[title="Profile and settings"]').click();
      await page.getByRole("menuitem", { name: "Profile & usage" }).click();
      await page.getByRole("heading", { name: "User Center" }).waitFor();
      assert.equal(
        await page.getByLabel("Nickname (for job cards)").inputValue(),
        "Restored E2E Builder",
        "a backup restored through the real UI must survive the resulting reload",
      );
      assert.deepEqual(
        unexpectedNetworkRequests,
        [],
        "a complete JobHuntr user journey must not transmit private workspace data to external hosts",
      );
      assert.deepEqual(
        runtimeErrors,
        [],
        "a complete real-user journey must not produce uncaught browser errors",
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
