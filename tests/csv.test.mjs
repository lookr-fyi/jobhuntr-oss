import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "../src/csv.js";

test("CSV parser handles quoted commas, escaped quotes, CRLF, and tags", () => {
  const rows = parseCsv(
    '\uFEFFcompany,title,location,tags,description\r\n"Acme, Inc.",Engineer,Remote,react|node,"Built ""great"" tools"\r\n',
  );
  assert.deepEqual(rows, [
    {
      company: "Acme, Inc.",
      title: "Engineer",
      location: "Remote",
      tags: ["react", "node"],
      description: 'Built "great" tools',
    },
  ]);
});

test("CSV parser ignores empty rows and rows missing required headers", () => {
  assert.deepEqual(
    parseCsv("company,title\nAcme,Engineer\n,Missing company\n\n"),
    [{ company: "Acme", title: "Engineer" }],
  );
});
