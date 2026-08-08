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
      await window.getByRole("button", { name: "Use demo profile" }).click();
      await window.getByRole("heading", { name: /Welcome back/ }).waitFor();
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
