import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { _electron as electron } from "playwright-core";

const packagedExecutable = async () => {
  const arch = process.arch;
  const candidates =
    process.platform === "darwin"
      ? [
          `release/mac-${arch}/JobHuntr.app/Contents/MacOS/JobHuntr`,
          "release/mac/JobHuntr.app/Contents/MacOS/JobHuntr",
        ]
      : process.platform === "win32"
        ? [
            `release/win-${arch}-unpacked/JobHuntr.exe`,
            "release/win-unpacked/JobHuntr.exe",
          ]
        : [
            `release/linux-${arch}-unpacked/jobhuntr-oss`,
            `release/linux-${arch}-unpacked/JobHuntr`,
            "release/linux-unpacked/jobhuntr-oss",
            "release/linux-unpacked/JobHuntr",
          ];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return path.resolve(candidate);
    } catch {}
  }
  assert.fail(
    `Packaged JobHuntr executable not found: ${candidates.join(", ")}`,
  );
};

test(
  "the actual platform distributable launches and completes a user flow",
  { timeout: 30_000 },
  async () => {
    const executablePath = await packagedExecutable();
    const dataDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "jobhuntr-packaged-e2e-"),
    );
    let electronApp;
    try {
      electronApp = await electron.launch({
        executablePath,
        env: {
          ...process.env,
          JOBHUNTR_DATA_DIR: dataDir,
          JOBHUNTR_WINDOW_STATE_PATH: path.join(dataDir, "window-state.json"),
        },
      });
      const window = await electronApp.firstWindow();
      await window.getByRole("button", { name: "Use demo profile" }).waitFor();
      await window.getByRole("button", { name: "Use demo profile" }).click();
      await window.getByRole("heading", { name: /Welcome back/ }).waitFor();
      await window
        .getByRole("button", { name: "Job Tracker", exact: true })
        .click();
      await window.getByRole("heading", { name: "Job Tracker" }).waitFor();
      assert.equal(await window.title(), "JobHuntr");
      const persisted = JSON.parse(
        await fs.readFile(path.join(dataDir, "jobhuntr.json"), "utf8"),
      );
      assert.equal(persisted.profile.onboarded, true);
    } finally {
      await electronApp?.close();
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  },
);
