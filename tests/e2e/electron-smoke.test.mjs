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
    const dataDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "jobhuntr-electron-"),
    );
    let electronApp;
    try {
      electronApp = await electron.launch({
        args: ["electron/main.mjs"],
        cwd: process.cwd(),
        env: { ...process.env, JOBHUNTR_DATA_DIR: dataDir },
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
      const security = await electronApp.evaluate(({ BrowserWindow }) => {
        const preferences =
          BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
        return {
          contextIsolation: preferences.contextIsolation,
          nodeIntegration: preferences.nodeIntegration,
          sandbox: preferences.sandbox,
        };
      });
      assert.deepEqual(security, {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      });
    } finally {
      await electronApp?.close();
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  },
);
