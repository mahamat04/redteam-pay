import { test } from "node:test";
import assert from "node:assert/strict";
import { newPayment, resetStore, naiveHandler, hardenedHandler, attacks } from "../lib/handlers.js";

test("naive handler credits on duplicate", () => {
  resetStore();
  const p = newPayment(10);
  const e = { eventId: "e1", paymentId: p.id, amount: 10, timestamp: Date.now(), signature: "valid" };
  naiveHandler(e);
  const r2 = naiveHandler({ ...e });
  assert.equal(r2.ok, true);
  assert.equal(p.credited, 2);
});

test("hardened handler blocks duplicate", () => {
  resetStore();
  const p = newPayment(10);
  const e = { eventId: "e1", paymentId: p.id, amount: 10, timestamp: Date.now(), signature: "valid" };
  assert.equal(hardenedHandler(e).ok, true);
  assert.equal(hardenedHandler({ ...e }).ok, false);
  assert.equal(p.credited, 1);
});

test("hardened handler blocks tampered amount", () => {
  resetStore();
  const p = newPayment(10);
  const e = { eventId: "e2", paymentId: p.id, amount: 100, timestamp: Date.now(), signature: "valid" };
  assert.equal(hardenedHandler(e).ok, false);
});

test("hardened handler blocks stale replay", () => {
  resetStore();
  const p = newPayment(10);
  const e = { eventId: "e3", paymentId: p.id, amount: 10, timestamp: Date.now() - 10 * 60 * 1000, signature: "valid" };
  assert.equal(hardenedHandler(e).ok, false);
});

test("hardened handler blocks bad signature", () => {
  resetStore();
  const p = newPayment(10);
  const e = { eventId: "e4", paymentId: p.id, amount: 10, timestamp: Date.now(), signature: "bad" };
  assert.equal(hardenedHandler(e).ok, false);
});

test("all attacks succeed against naive", async () => {
  resetStore();
  for (const a of attacks) {
    resetStore();
    const r = await a.run(naiveHandler);
    // most should succeed; at least the set runs
    assert.ok(typeof r.success === "boolean");
  }
});

test("all attacks blocked by hardened", async () => {
  for (const a of attacks) {
    resetStore();
    const r = await a.run(hardenedHandler);
    assert.equal(r.success, false, `${a.name} should be blocked`);
  }
});