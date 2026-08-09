import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { _electron as electron } from "playwright-core";

test(
  "the packaged desktop entry launches the real JobHuntr Electron experience",
  { timeout: 30_000 },
  async () => {
    const userDataDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "jobhuntr-electron-"),
    );
    let electronApp;
    const environment = {
      ...process.env,
      JOBHUNTR_DATA_DIR: "",
      JOBHUNTR_USER_DATA_DIR: userDataDir,
      JOBHUNTR_WINDOW_STATE_PATH: "",
    };
    try {
      electronApp = await electron.launch({
        args: ["electron/main.mjs"],
        cwd: process.cwd(),
        env: environment,
      });
      const window = await electronApp.firstWindow();
      await window.getByRole("button", { name: "Set up my workspace" }).click();
      await window.getByLabel("Your name").fill("Electron User");
      await window.getByLabel("Primary target role").fill("Product Engineer");
      await window.getByLabel("Home location").fill("Seattle, WA");
      await window.getByRole("button", { name: /Continue/ }).click();
      await window
        .getByLabel("Skills, comma-separated")
        .fill("React, TypeScript, Product Strategy");
      await window.getByRole("button", { name: /Continue/ }).click();
      await window
        .getByLabel("Resume text")
        .fill(
          "Product engineer with eight years of experience delivering React and TypeScript products. Improved customer conversion by 42% and led cross-functional launches.",
        );
      await window.getByRole("button", { name: /Continue/ }).click();
      await window.getByLabel("Preferred locations").fill("Seattle, Remote");
      await window.getByLabel("Minimum salary").fill("150000");
      await window.getByLabel("Weekly application goal").fill("7");
      await window
        .getByRole("button", { name: "Open my command center" })
        .click();
      await window.getByRole("heading", { name: /Welcome back/ }).waitFor();
      await window.getByText("Welcome back, Electron").waitFor();
      assert.equal(await window.title(), "JobHuntr");
      const workspacePath = path.join(userDataDir, "data", "jobhuntr.json");
      await fs.access(workspacePath);
      const onboardedWorkspace = JSON.parse(
        await fs.readFile(workspacePath, "utf8"),
      );
      assert.match(onboardedWorkspace.profile.resumeText, /conversion by 42%/);
      const security = await electronApp.evaluate(({ BrowserWindow }) => {
        const preferences =
          BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
        return {
          contextIsolation: preferences.contextIsolation,
          nodeIntegration: preferences.nodeIntegration,
          sandbox: preferences.sandbox,
          safeDialogs: preferences.safeDialogs,
        };
      });
      assert.deepEqual(security, {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        safeDialogs: true,
      });
      assert.equal(
        await window.evaluate(
          async () =>
            (await navigator.permissions.query({ name: "geolocation" })).state,
        ),
        "denied",
      );
      await electronApp.evaluate(({ shell }) => {
        globalThis.__jobhuntrExternalTargets = [];
        shell.openExternal = async (target) => {
          globalThis.__jobhuntrExternalTargets.push(target);
        };
      });
      await window.locator('button[title="Job Board"]').click();
      await window.getByRole("heading", { name: "Today's Picks" }).waitFor();
      await window.getByRole("link", { name: /View original post/ }).click();
      let externalTargets = [];
      for (
        let attempt = 0;
        attempt < 20 && !externalTargets.length;
        attempt++
      ) {
        externalTargets = await electronApp.evaluate(
          () => globalThis.__jobhuntrExternalTargets || [],
        );
        if (!externalTargets.length)
          await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.equal(externalTargets.length, 1);
      assert.match(externalTargets[0], /^https?:\/\//);
      assert.match(window.url(), /^http:\/\/127\.0\.0\.1:/);
      const popupPromise = electronApp.waitForEvent("window");
      await window.evaluate(() => window.open("/api/health", "_blank"));
      const popup = await popupPromise;
      await popup.waitForLoadState();
      const popupSecurity = await electronApp.evaluate(({ BrowserWindow }) => {
        const preferences = BrowserWindow.getAllWindows()
          .at(-1)
          .webContents.getLastWebPreferences();
        return {
          contextIsolation: preferences.contextIsolation,
          nodeIntegration: preferences.nodeIntegration,
          sandbox: preferences.sandbox,
          safeDialogs: preferences.safeDialogs,
        };
      });
      assert.deepEqual(popupSecurity, security);
      await popup.close();
      await window.locator('button[title="Infinite Hunting"]').click();
      await window.getByRole("heading", { name: "Infinite Hunting" }).waitFor();
      await window
        .getByRole("button", { name: "Start infinite hunt", exact: true })
        .click();
      await window
        .getByText("Infinite Hunt is active every 60 minutes.")
        .waitFor();
      await electronApp.evaluate(({ BrowserWindow }) => {
        const activeWindow = BrowserWindow.getAllWindows()[0];
        activeWindow.close();
        activeWindow.close();
      });
      await new Promise((resolve) => setTimeout(resolve, 500));
      assert.equal(
        await electronApp.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].isVisible(),
        ),
        false,
        "even rapid repeated closes must keep an active Infinite Hunt alive in the tray",
      );
      await electronApp.evaluate(({ app }) => {
        app.emit("activate");
      });
      await new Promise((resolve) => setTimeout(resolve, 250));
      assert.equal(
        await electronApp.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].isVisible(),
        ),
        true,
        "activating JobHuntr must reopen a window hidden by Infinite Hunt",
      );
      await electronApp.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].setBounds({
          x: 80,
          y: 90,
          width: 1110,
          height: 740,
        });
      });
      await electronApp.close();
      electronApp = await electron.launch({
        args: ["electron/main.mjs"],
        cwd: process.cwd(),
        env: environment,
      });
      const relaunchedWindow = await electronApp.firstWindow();
      await relaunchedWindow
        .getByRole("heading", { name: /Welcome back/ })
        .waitFor();
      await relaunchedWindow.getByText("Welcome back, Electron").waitFor();
      assert.equal(
        await relaunchedWindow.getByRole("dialog").count(),
        0,
        "a completed onboarding must stay completed across a full Electron restart",
      );
      const restoredBounds = await electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].getBounds(),
      );
      assert.deepEqual(restoredBounds, {
        x: 80,
        y: 90,
        width: 1110,
        height: 740,
      });
      await relaunchedWindow
        .locator('button[title="Infinite Hunting"]')
        .click();
      await relaunchedWindow
        .getByText("Infinite Hunt is active every 60 minutes.")
        .waitFor();
      await relaunchedWindow
        .getByRole("button", { name: "Stop Infinite Hunt" })
        .click();
      await relaunchedWindow
        .getByText("Infinite Hunt is active every 60 minutes.")
        .waitFor({ state: "hidden" });
    } finally {
      await electronApp?.close();
      await fs.rm(userDataDir, { recursive: true, force: true });
    }
  },
);
