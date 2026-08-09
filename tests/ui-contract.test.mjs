import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("every rendered form control has a stable name for browser identification", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const controls = [
    ...source.matchAll(/<(input|select|textarea)\b[\s\S]*?\/?>/g),
  ];
  const unnamed = controls
    .filter((match) => !/\bname\s*=/.test(match[0]))
    .map((match) => ({
      line: source.slice(0, match.index).split("\n").length,
      control: match[0].replace(/\s+/g, " ").slice(0, 180),
    }));

  assert.deepEqual(
    unnamed,
    [],
    "inputs, selects, and textareas must remain identifiable to Chrome, autofill, and E2E tooling",
  );
});

test("persisted timestamps cannot bypass safe date formatters", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const unsafeDateFormatting = [
    ...source.matchAll(
      /new Date\((?!\s*\))[^;]*?\)\.toLocale(?:DateString|String)\(/g,
    ),
  ].map((match) => ({
    line: source.slice(0, match.index).split("\n").length,
    expression: match[0].replace(/\s+/g, " ").slice(0, 180),
  }));

  assert.deepEqual(
    unsafeDateFormatting,
    [],
    "persisted dates must use formatCalendarDate or formatDateTime so corrupt records cannot render Invalid Date",
  );
});

test("every JobHuntr CSS custom property is defined", async () => {
  const source = await readFile(
    new URL("../src/styles.css", import.meta.url),
    "utf8",
  );
  const definitions = new Set(
    [...source.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map((match) => match[1]),
  );
  const usages = new Set(
    [...source.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)].map((match) => match[1]),
  );
  const undefinedProperties = [...usages]
    .filter((property) => !definitions.has(property))
    .sort();

  assert.deepEqual(
    undefinedProperties,
    [],
    "undefined CSS variables silently make v2 controls transparent or drop their styling",
  );
});

test("user-triggered API actions contain rejected requests", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const uncontained = [];
  for (const match of source.matchAll(
    /const\s+(\w+)\s*=\s*async\s*\([^)]*\)\s*=>\s*\{/g,
  )) {
    const end = source.indexOf("\n  };", match.index + match[0].length);
    if (end < 0) continue;
    const body = source.slice(match.index + match[0].length, end);
    if (body.includes("await api(") && !body.includes("catch"))
      uncontained.push({
        action: match[1],
        line: source.slice(0, match.index).split("\n").length,
      });
  }

  assert.deepEqual(
    uncontained,
    [],
    "async UI actions must preserve their form state and let the shared error surface handle failed API requests",
  );
});

test("modal dialogs receive focus and return it to their trigger", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /const useDialogFocusManagement = \(\) =>/);
  assert.match(source, /document\.querySelectorAll\('\[role="dialog"\]'\)/);
  assert.match(source, /returnFocus = document\.activeElement/);
  assert.match(source, /returnFocus\.focus\(\)/);
  assert.match(source, /function App\(\) \{\s+useDialogFocusManagement\(\);/);
});

test("an uncaught renderer failure has a local recovery screen", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /class ErrorBoundary extends Component/);
  assert.match(source, /static getDerivedStateFromError\(error\)/);
  assert.match(source, /Your local workspace was not cleared or uploaded/);
  assert.match(source, /<ErrorBoundary>\s*<App \/>\s*<\/ErrorBoundary>/);
});

test("dense v2 controls keep usable touch targets on compact screens", async () => {
  const styles = await readFile(
    new URL("../src/styles.css", import.meta.url),
    "utf8",
  );

  assert.match(styles, /@media \(max-width: 760px\), \(pointer: coarse\)/);
  assert.match(styles, /\.v2-run-delete,[\s\S]*?min-width: 36px/);
  assert.match(styles, /\.v2-coach-delete[\s\S]*?min-height: 36px/);
});

test("v2 getting-started guidance does not obscure the expanded sidebar", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const guidance = source.slice(
    source.indexOf("function GettingStarted"),
    source.indexOf("function App()"),
  );

  assert.match(guidance, /useState\(false\)/);
  assert.match(guidance, /aria-controls="getting-started-checklist"/);
  assert.match(guidance, /id="getting-started-checklist"/);
});

test("refresh, bulk outreach, and legacy migration failures stay contained", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  for (const action of ["refresh", "markSelectedOutreached"]) {
    const start = source.indexOf(`const ${action} = async`);
    assert.notEqual(start, -1, `${action} must exist`);
    const nextAction = source.indexOf("\n  };", start);
    const body = source.slice(start, nextAction);
    assert.match(body, /catch/, `${action} must contain rejected work`);
  }
  assert.match(source, /void migrate\(\)\.catch/);
});

test("ATS template scoring is single-flight and retryable", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("const advanceTemplateWizard = async");
  const end = source.indexOf("\n  const saveResume", start);
  const scoringFlow = source.slice(start, end);

  assert.match(scoringFlow, /scoring: true/);
  assert.match(scoringFlow, /try \{/);
  assert.match(scoringFlow, /catch \{/);
  assert.match(scoringFlow, /scoring: false/);
  assert.match(source, /templateDialog\.scoring \|\|/);
  assert.match(source, /"Scoring…"/);
});

test("the expanded sidebar overlays instead of crushing compact desktop pages", async () => {
  const styles = await readFile(
    new URL("../src/styles.css", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(
    styles,
    /@media \(min-width: 761px\) \{\s*\.app\.sidebar-open main/,
  );
  assert.match(
    styles,
    /@media \(min-width: 961px\) \{\s*\.app\.sidebar-open main \{\s*margin-left: 280px/,
  );
});

test("editing a saved User Center form clears its saved confirmation", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const settings = source.slice(
    source.indexOf("function SettingsPage"),
    source.indexOf("function Privacy"),
  );

  assert.match(
    settings,
    /const markFormDirty = \(\) => \{[\s\S]*?setSaved\(false\);[\s\S]*?const editForm = \(next\) => \{\s*markFormDirty\(\);\s*setForm\(next\);/,
  );
  assert.match(
    settings,
    /name=\{`profile-\$\{key\}`\}[\s\S]*?onChange=[\s\S]*?editForm\(/,
  );
  for (const control of [
    "profile-career-context",
    "settings-target-roles",
    "settings-ats-threshold",
    "settings-remote-roles",
  ]) {
    const start = settings.indexOf(`name="${control}"`);
    assert.notEqual(start, -1, `${control} must exist`);
    assert.match(
      settings.slice(start, start + 700),
      /onChange=[\s\S]*?editForm\(/,
      `${control} must invalidate the saved notice when edited`,
    );
  }
});

test("User Center saves are single-flight and cannot bless newer edits", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const settings = source.slice(
    source.indexOf("function SettingsPage"),
    source.indexOf("function Privacy"),
  );

  assert.match(settings, /const \[savingProfile, setSavingProfile\]/);
  assert.match(settings, /const formRevision = useRef\(0\)/);
  assert.match(settings, /formRevision\.current \+= 1/);
  assert.match(settings, /if \(savingProfile\) return/);
  assert.match(
    settings,
    /if \(formRevision\.current === savingRevision\) setSaved\(true\)/,
  );
  assert.match(settings, /finally \{\s*setSavingProfile\(false\)/);
  assert.match(settings, /aria-busy=\{savingProfile\}/);
});
