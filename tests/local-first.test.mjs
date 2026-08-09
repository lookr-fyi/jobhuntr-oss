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
    "pdfjs-dist",
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
    "scripts/dependency-state.mjs",
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
  assert.equal(
    Object.values(pkg.dependencies).every((version) =>
      /^\d+\.\d+\.\d+$/.test(version),
    ),
    true,
    "runtime dependencies must use reproducible exact versions",
  );
  const electronMain = read("electron/main.mjs");
  assert.match(electronMain, /contextIsolation: true/);
  assert.match(electronMain, /nodeIntegration: false/);
  assert.match(electronMain, /sandbox: true/);
  assert.match(electronMain, /safeDialogs: true/);
  assert.match(electronMain, /clipboard-sanitized-write/);
  assert.match(electronMain, /setPermissionCheckHandler/);
  assert.match(electronMain, /setPermissionRequestHandler/);
  assert.match(electronMain, /will-attach-webview/);
  assert.match(
    electronMain,
    /did-create-window[\s\S]*?hardenWebContents\(childWindow\.webContents, localOrigin\)/,
    "every local preview window must inherit external-navigation and popup restrictions",
  );
  assert.match(
    electronMain,
    /event\.preventDefault\(\);[\s\S]*?if \(checkingClose\) return;[\s\S]*?checkingClose = true/,
    "every repeated native close must remain cancelled during the asynchronous Infinite Hunt check",
  );
  assert.match(
    electronMain,
    /if \(!tray \|\| !localUrl \|\| syncingTray\) return/,
  );
  assert.match(
    electronMain,
    /syncingTray = true[\s\S]*?finally \{\s*syncingTray = false/,
  );
  assert.ok(
    electronMain.match(/AbortSignal\.timeout\(LOCAL_REQUEST_TIMEOUT_MS\)/g)
      .length >= 3,
    "tray stop, tray polling, and native close checks must all be bounded",
  );
  assert.match(
    electronMain,
    /if \(!response\.ok\)\s*throw new Error\(`Infinite Hunt stop failed with \$\{response\.status\}`\)/,
  );
  const trayStopAction = electronMain.slice(
    electronMain.indexOf('label: "Stop Infinite Hunt"'),
    electronMain.indexOf('{ type: "separator"'),
  );
  assert.ok(
    trayStopAction.indexOf("await stopInfiniteHunt()") <
      trayStopAction.indexOf("tray?.destroy()"),
    "the native tray must only be removed after the stop request succeeds",
  );
  assert.ok(
    trayStopAction.indexOf("tray?.destroy()") <
      trayStopAction.indexOf("catch (error)"),
    "a rejected stop must preserve the Infinite Hunt tray for retry",
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

test("production startup keeps the v2 renderer separate from cacheable framework code", () => {
  const viteConfig = read("vite.config.js");
  assert.match(viteConfig, /name: "react-vendor"/);
  assert.match(viteConfig, /react\|react-dom\|scheduler/);
  assert.match(viteConfig, /name: "icons-vendor"/);
  assert.match(viteConfig, /lucide-react/);
  assert.match(
    viteConfig,
    /rolldownOptions:[\s\S]*?output:[\s\S]*?codeSplitting:[\s\S]*?groups:/,
    "the production build must not regress to one oversized renderer entry chunk",
  );
});
