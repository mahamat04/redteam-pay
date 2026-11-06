// lib/handlers.js
export const payments = new Map();

export function newPayment(amount = 10.0) {
  const id = "pay_" + Math.random().toString(36).slice(2, 9);
  const p = { id, amount, status: "pending", credited: 0, events: new Set(), createdAt: Date.now() };
  payments.set(id, p);
  return p;
}

export function resetStore() { payments.clear(); }

export function naiveHandler(evt) {
  const p = payments.get(evt.paymentId);
  if (!p) return { ok: false, reason: "unknown payment" };
  p.credited += 1;
  p.status = "credited";
  p.events.add(evt.eventId);
  return { ok: true, credited: p.credited, loss: evt.amount };
}

const REPLAY_WINDOW_MS = 5 * 60 * 1000;
export function hardenedHandler(evt) {
  const p = payments.get(evt.paymentId);
  if (!p) return { ok: false, reason: "unknown payment" };
  if (Date.now() - evt.timestamp > REPLAY_WINDOW_MS) return { ok: false, reason: "stale/replay event" };
  if (p.events.has(evt.eventId)) return { ok: false, reason: "duplicate event (idempotent)" };
  if (Number(evt.amount) !== Number(p.amount)) return { ok: false, reason: "amount mismatch" };
  if (evt.signature !== "valid") return { ok: false, reason: "bad signature" };
  p.events.add(evt.eventId);
  p.credited += 1;
  p.status = "credited";
  return { ok: true, credited: p.credited, loss: 0 };
}

export function makeEvent(p, overrides = {}) {
  return {
    eventId: "evt_" + Math.random().toString(36).slice(2, 9),
    paymentId: p.id,
    amount: p.amount,
    timestamp: Date.now(),
    signature: "valid",
    ...overrides,
  };
}

export const attacks = [
  {
    name: "Duplicate webhook (replay)",
    async run(handler) {
      const p = newPayment(10);
      const e = makeEvent(p);
      handler(e);
      const r2 = handler({ ...e, eventId: e.eventId });
      const dup = r2.ok;
      return { success: dup, loss: dup ? p.amount : 0, detail: dup ? "double" : "deduped" };
    },
  },
  {
    name: "Tampered amount",
    async run(handler) {
      const p = newPayment(10);
      const e = makeEvent(p, { amount: 100, eventId: "evt_tampered" });
      const r = handler(e);
      return { success: r.ok, loss: r.ok ? 100 - p.amount : 0, detail: r.ok ? "over-credit" : "rejected" };
    },
  },
  {
    name: "Replay of old transaction id",
    async run(handler) {
      const p = newPayment(10);
      const oldId = "evt_old_" + p.id;
      p.events.add(oldId);
      const e = makeEvent(p, { eventId: oldId, timestamp: Date.now() - 10 * 60 * 1000 });
      const r = handler(e);
      return { success: r.ok, loss: r.ok ? p.amount : 0, detail: r.ok ? "replay" : "rejected" };
    },
  },
  {
    name: "Late callback (out of window)",
    async run(handler) {
      const p = newPayment(10);
      const e = makeEvent(p, { timestamp: Date.now() - 30 * 60 * 1000 });
      const r = handler(e);
      return { success: r.ok, loss: r.ok ? p.amount : 0, detail: r.ok ? "late credit" : "rejected" };
    },
  },
  {
    name: "Retry storm (10x duplicate)",
    async run(handler) {
      const p = newPayment(10);
      const e = makeEvent(p);
      let extra = 0;
      for (let i = 0; i < 10; i++) {
        const r = handler({ ...e, eventId: e.eventId });
        if (i > 0 && r.ok) extra++;
      }
      return { success: extra > 0, loss: extra * p.amount, detail: extra > 0 ? `${extra} extra` : "deduped" };
    },
  },
];