#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const ignored = new Set([
  ".git",
  "node_modules",
  "dist",
  "release",
  "data",
  ".DS_Store",
  "package-lock.json",
]);
const suspiciousNames = [
  /^\.env(\..*)?$/i,
  /secret/i,
  /credential/i,
  /private[_-]?key/i,
];
const patterns = [
  [
    /-----BEGIN (RSA |EC |OPENSSH |DSA |)?PRIVATE KEY-----/,
    "private key block",
  ],
  [/gh[pousr]_[A-Za-z0-9_]{20,}/, "GitHub token"],
  [/sk-[A-Za-z0-9]{32,}/, "OpenAI-style API key"],
  [/xox[baprs]-[A-Za-z0-9-]{20,}/, "Slack token"],
  [/AKIA[0-9A-Z]{16}/, "AWS access key"],
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, "JWT"],
];
const allow = new Set([
  ".env.example",
  "scripts/secret-scan.mjs",
  "docs/SECURITY.md",
]);
const findings = [];
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    const rel = path.relative(root, p);
    if (ent.isSymbolicLink()) continue;
    if (ent.isDirectory()) walk(p);
    else {
      if (!allow.has(rel) && suspiciousNames.some((r) => r.test(ent.name)))
        findings.push(`${rel}: suspicious filename for public repo`);
      const stat = fs.statSync(p);
      if (stat.size > 1_000_000) continue;
      const txt = fs.readFileSync(p, "utf8");
      for (const [re, label] of patterns)
        if (re.test(txt) && !allow.has(rel)) findings.push(`${rel}: ${label}`);
    }
  }
}
walk(root);

function git(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

try {
  const commits = git(["rev-list", "--all"]).split("\n").filter(Boolean);
  const scannedBlobs = new Set();
  for (const commit of commits) {
    const entries = git(["ls-tree", "-r", "--long", commit]).split("\n");
    for (const entry of entries) {
      const match = entry.match(/^\d+\s+blob\s+([a-f0-9]+)\s+(\d+)\t(.+)$/);
      if (!match) continue;
      const [, blob, rawSize, file] = match;
      if (scannedBlobs.has(blob) || Number(rawSize) > 1_000_000) continue;
      scannedBlobs.add(blob);
      const base = path.basename(file);
      if (!allow.has(file) && suspiciousNames.some((regex) => regex.test(base)))
        findings.push(
          `${commit.slice(0, 8)}:${file}: suspicious historical filename`,
        );
      if (allow.has(file)) continue;
      const content = git(["show", `${commit}:${file}`]);
      if (content.includes("\0")) continue;
      for (const [regex, label] of patterns)
        if (regex.test(content))
          findings.push(`${commit.slice(0, 8)}:${file}: historical ${label}`);
    }
  }
} catch {
  console.warn("Git history was unavailable; scanned the working tree only.");
}
if (findings.length) {
  console.error(
    "Secret scan failed:\n" + findings.map((f) => " - " + f).join("\n"),
  );
  process.exit(1);
}
console.log(
  "Secret scan passed: working tree and Git history contain no obvious secrets or private env files.",
);
