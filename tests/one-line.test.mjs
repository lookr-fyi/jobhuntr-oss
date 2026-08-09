import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, execFileSync } from "node:child_process";

const freePort = () =>
  new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

test(
  "one-line launcher builds and serves the complete local app",
  { timeout: 30000 },
  async () => {
    const port = await freePort();
    const dataDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "jobhuntr-launch-"),
    );
    const child = spawn(process.execPath, ["scripts/one-line-run.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        HOST: "127.0.0.1",
        JOBHUNTR_DATA_DIR: dataDir,
        JOBHUNTR_NO_OPEN: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    try {
      let response;
      for (let i = 0; i < 80; i++) {
        try {
          response = await fetch(`http://127.0.0.1:${port}/api/health`);
          if (response.ok) break;
        } catch {}
        await new Promise((r) => setTimeout(r, 200));
      }
      assert.ok(response?.ok, `launcher did not become healthy:\n${output}`);
      const page = await fetch(`http://127.0.0.1:${port}/`);
      assert.equal(page.status, 200);
      assert.match(await page.text(), /<title>JobHuntr<\/title>/);
    } finally {
      try {
        process.platform === "win32"
          ? child.kill("SIGTERM")
          : process.kill(-child.pid, "SIGTERM");
      } catch {}
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 3000);
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  },
);

test("one-command desktop launcher bootstraps and opens Electron", async () => {
  const output = execFileSync(
    process.execPath,
    ["scripts/one-line-desktop.mjs"],
    {
      cwd: process.cwd(),
      env: { ...process.env, JOBHUNTR_DESKTOP_DRY_RUN: "1" },
      encoding: "utf8",
    },
  );
  const plan = JSON.parse(output);
  assert.equal(plan.launch, "npm run desktop:launch");
  assert.equal(path.resolve(plan.root), process.cwd());
  const pkg = JSON.parse(
    await fs.readFile(path.join(process.cwd(), "package.json"), "utf8"),
  );
  assert.equal(pkg.scripts.desktop, "node scripts/one-line-desktop.mjs");
  assert.match(pkg.scripts["desktop:launch"], /electron electron\/main\.mjs/);
});
