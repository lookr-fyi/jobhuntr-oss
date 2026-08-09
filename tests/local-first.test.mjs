import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("runtime dependency allowlist contains no cloud, auth, payment, database, or telemetry SDK", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), [
    "express",
    "lucide-react",
    "nanoid",
    "react",
    "react-dom",
    "zod",
  ]);
  const runtime = [
    "server/index.mjs",
    "server/store.mjs",
    "server/render.mjs",
    "server/profile-audit.mjs",
    "src/main.jsx",
    "src/csv.js",
    "scripts/one-line-run.mjs",
    "scripts/one-line-desktop.mjs",
  ]
    .map(read)
    .join("\n");
  assert.doesNotMatch(
    runtime,
    /(?:from|require\()["'](?:@?supabase|@?clerk|stripe|firebase|@aws-sdk|pg|postgres|langfuse|posthog|@vercel|railway)/i,
  );
  assert.match(
    read("server/index.mjs"),
    /process\.env\.HOST \|\| "127\.0\.0\.1"/,
  );
});

test("public Git index excludes personal data and private environment files", () => {
  const files = execFileSync("git", ["ls-files"], {
    cwd: root,
    encoding: "utf8",
  })
    .trim()
    .split("\n");
  assert.ok(files.includes(".env.example"));
  assert.equal(
    files.some(
      (file) =>
        /^data\//.test(file) ||
        (/^\.env(?:\.|$)/.test(file) && file !== ".env.example") ||
        /^dist\//.test(file),
    ),
    false,
  );
});
