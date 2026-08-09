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
      await window.getByLabel("Preferred locations").fill("Seattle, Remote");
      await window.getByLabel("Minimum salary").fill("150000");
      await window.getByLabel("Weekly application goal").fill("7");
      await window
        .getByRole("button", { name: "Open my command center" })
        .click();
      await window.getByRole("heading", { name: /Welcome back/ }).waitFor();
      await window.getByText("Welcome back, Electron").waitFor();
      assert.equal(await window.title(), "JobHuntr");
      await fs.access(path.join(userDataDir, "data", "jobhuntr.json"));
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
        BrowserWindow.getAllWindows()[0].close();
      });
      await new Promise((resolve) => setTimeout(resolve, 500));
      assert.equal(
        await electronApp.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].isVisible(),
        ),
        false,
        "closing the window must keep an active Infinite Hunt alive in the tray",
      );
      await electronApp.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].show();
      });
      await new Promise((resolve) => setTimeout(resolve, 250));
      await window.getByRole("button", { name: "Stop Infinite Hunt" }).click();
      await window
        .getByText("Infinite Hunt is active every 60 minutes.")
        .waitFor({ state: "hidden" });
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
      await electronApp.firstWindow();
      const restoredBounds = await electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].getBounds(),
      );
      assert.deepEqual(restoredBounds, {
        x: 80,
        y: 90,
        width: 1110,
        height: 740,
      });
    } finally {
      await electronApp?.close();
      await fs.rm(userDataDir, { recursive: true, force: true });
    }
  },
);
