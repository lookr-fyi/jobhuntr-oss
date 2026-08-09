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
