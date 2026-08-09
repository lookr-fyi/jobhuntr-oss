import assert from "node:assert/strict";
import test from "node:test";

import { createLatestRequest } from "../src/latest-request.mjs";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
};

test("only the newest overlapping state request can update the UI", async () => {
  const committed = [];
  const failures = [];
  const load = createLatestRequest(
    (state) => committed.push(state),
    (error) => failures.push(error.message),
  );
  const stale = deferred();
  const fresh = deferred();
  const staleLoad = load(() => stale.promise);
  const freshLoad = load(() => fresh.promise);

  fresh.resolve({ profile: { name: "Fresh User" } });
  await freshLoad;
  stale.resolve({ profile: { name: "Stale User" } });
  await staleLoad;

  assert.deepEqual(committed, [{ profile: { name: "Fresh User" } }]);
  assert.deepEqual(failures, []);
});

test("a stale request failure cannot replace a newer successful state", async () => {
  const committed = [];
  const failures = [];
  const load = createLatestRequest(
    (state) => committed.push(state),
    (error) => failures.push(error.message),
  );
  const stale = deferred();
  const fresh = deferred();
  const staleLoad = load(() => stale.promise);
  const freshLoad = load(() => fresh.promise);

  fresh.resolve({ ready: true });
  await freshLoad;
  stale.reject(new Error("stale network failure"));
  await staleLoad;

  assert.deepEqual(committed, [{ ready: true }]);
  assert.deepEqual(failures, []);
});
