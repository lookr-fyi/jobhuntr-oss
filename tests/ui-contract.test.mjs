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
