#!/usr/bin/env node
import { spawnSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
process.chdir(root);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
const url = `http://${host}:${port}`;
const run = (args) => {
  const result = spawnSync(npm, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
};

if (!fs.existsSync("node_modules/.package-lock.json")) {
  console.log("Installing locked dependencies locally (first run only)…");
  run(["ci"]);
}
console.log("Building the local app…");
run(["run", "build"]);
console.log(`Starting JobHuntr OSS at ${url}`);
const child = spawn(npm, ["run", "preview"], {
  stdio: "inherit",
  detached: process.platform !== "win32",
  env: {
    ...process.env,
    HOST: host,
    PORT: String(port),
    JOBHUNTR_DATA_DIR: process.env.JOBHUNTR_DATA_DIR || "./data",
  },
});

const stop = (signal) => {
  if (child.killed) return;
  try {
    process.platform === "win32"
      ? child.kill(signal)
      : process.kill(-child.pid, signal);
  } catch {}
};
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
child.on("exit", (code, signal) => process.exit(signal ? 0 : (code ?? 0)));

if (!process.env.JOBHUNTR_NO_OPEN && process.stdout.isTTY) {
  setTimeout(() => {
    const command =
      process.platform === "darwin"
        ? ["open", [url]]
        : process.platform === "win32"
          ? ["cmd", ["/c", "start", "", url]]
          : ["xdg-open", [url]];
    const opener = spawn(command[0], command[1], {
      detached: true,
      stdio: "ignore",
    });
    opener.on("error", () => {});
    opener.unref();
  }, 1200);
}
