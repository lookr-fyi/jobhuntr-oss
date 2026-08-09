#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
process.chdir(root);

const run = (args) => {
  const result = spawnSync(npm, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
};

const needsInstall = !fs.existsSync(
  path.join(root, "node_modules", ".package-lock.json"),
);

if (process.env.JOBHUNTR_DESKTOP_DRY_RUN === "1") {
  console.log(
    JSON.stringify({
      root,
      install: needsInstall ? "npm ci" : null,
      launch: "npm run desktop:launch",
    }),
  );
  process.exit(0);
}

if (needsInstall) {
  console.log("Installing locked dependencies locally (first run only)…");
  run(["ci"]);
}

console.log("Building and opening the JobHuntr desktop app…");
run(["run", "desktop:launch"]);
