export const payments = new Map();

export function newPayment(amount = 10) {
  const id = "pay_" + Math.random().toString(36).slice(2, 9);
  const payment = {
    id,
    amount: Number(amount),
    status: "pending",
    credited: 0,
    events: new Set(),
    createdAt: Date.now(),
  };
  payments.set(id, payment);
  return payment;
}

export function resetStore() {
  payments.clear();
}

// Deliberately unsafe reference handler used only in the local simulation.
export function naiveHandler(event) {
  const payment = payments.get(event.paymentId);
  if (!payment) return { ok: false, reason: "unknown payment" };
  payment.credited += 1;
  payment.status = "credited";
  payment.events.add(event.eventId);
  return { ok: true, credited: payment.credited, loss: Number(event.amount) };
}

const REPLAY_WINDOW_MS = 5 * 60 * 1000;
const FUTURE_CLOCK_TOLERANCE_MS = 30 * 1000;

// This is a deterministic teaching model. `signature === "valid"` is a fixture,
// not cryptographic verification of a PayPal webhook.
export function hardenedHandler(event) {
  const payment = payments.get(event.paymentId);
  if (!payment) return { ok: false, reason: "unknown payment" };

  const age = Date.now() - Number(event.timestamp);
  if (!Number.isFinite(age) || age > REPLAY_WINDOW_MS) {
    return { ok: false, reason: "event outside the 5 minute replay window" };
  }
  if (age < -FUTURE_CLOCK_TOLERANCE_MS) {
    return { ok: false, reason: "event timestamp is in the future" };
  }
  if (payment.events.has(event.eventId)) {
    return { ok: false, reason: "duplicate event ID" };
  }
  if (Number(event.amount) !== payment.amount) {
    return { ok: false, reason: "event amount does not match the stored payment" };
  }
  if (event.signature !== "valid") {
    return { ok: false, reason: "signature fixture rejected" };
  }

  payment.events.add(event.eventId);
  payment.credited += 1;
  payment.status = "credited";
  return { ok: true, credited: payment.credited, loss: 0 };
}

export function makeEvent(payment, overrides = {}) {
  return {
    eventId: "evt_" + Math.random().toString(36).slice(2, 9),
    paymentId: payment.id,
    amount: payment.amount,
    timestamp: Date.now(),
    signature: "valid",
    ...overrides,
  };
}

export const hardeningControls = [
  { id: "idempotency", label: "Idempotency", description: "Accept an event ID only once." },
  { id: "amount", label: "Amount match", description: "Reconcile the event amount with the stored order." },
  { id: "replay-window", label: "Replay window", description: "Reject events older than five minutes or with a future timestamp." },
  { id: "signature", label: "Signature check", description: "The simulator uses a fixture; production code must verify PayPal's signature." },
];

export const attacks = [
  {
    id: "duplicate",
    name: "Duplicate webhook",
    summary: "Send the same event ID twice.",
    severity: "High",
    control: "Idempotency",
    async run(handler, { amount = 10 } = {}) {
      const payment = newPayment(amount);
      const event = makeEvent(payment);
      handler(event);
      const retry = handler({ ...event });
      const exploited = retry.ok;
      return {
        success: exploited,
        loss: exploited ? payment.amount : 0,
        detail: exploited
          ? `The repeated event credited the same ${payment.amount.toFixed(2)} payment twice.`
          : "The duplicate event ID was rejected; the payment was credited once.",
      };
    },
  },
  {
    id: "amount-tampering",
    name: "Amount tampering",
    summary: "Change the webhook amount after order creation.",
    severity: "Critical",
    control: "Amount match",
    async run(handler, { amount = 10 } = {}) {
      const payment = newPayment(amount);
      const alteredAmount = Number((payment.amount * 10).toFixed(2));
      const result = handler(makeEvent(payment, { amount: alteredAmount, eventId: "evt_tampered" }));
      const exploited = result.ok;
      return {
        success: exploited,
        loss: exploited ? Math.max(0, alteredAmount - payment.amount) : 0,
        detail: exploited
          ? `The handler accepted ${alteredAmount.toFixed(2)} against an order for ${payment.amount.toFixed(2)}.`
          : `The event for ${alteredAmount.toFixed(2)} did not match the stored order for ${payment.amount.toFixed(2)}.`,
      };
    },
  },
  {
    id: "old-replay",
    name: "Old event replay",
    summary: "Replay an event from ten minutes ago.",
    severity: "High",
    control: "Replay window",
    async run(handler, { amount = 10 } = {}) {
      const payment = newPayment(amount);
      const oldEventId = `evt_old_${payment.id}`;
      payment.events.add(oldEventId);
      const result = handler(makeEvent(payment, {
        eventId: oldEventId,
        timestamp: Date.now() - 10 * 60 * 1000,
      }));
      const exploited = result.ok;
      return {
        success: exploited,
        loss: exploited ? payment.amount : 0,
        detail: exploited
          ? "A ten-minute-old event was accepted again."
          : "The event was outside the five-minute window and could not credit the payment.",
      };
    },
  },
  {
    id: "late-callback",
    name: "Late callback",
    summary: "Deliver a callback thirty minutes late.",
    severity: "Medium",
    control: "Replay window",
    async run(handler, { amount = 10 } = {}) {
      const payment = newPayment(amount);
      const result = handler(makeEvent(payment, { timestamp: Date.now() - 30 * 60 * 1000 }));
      const exploited = result.ok;
      return {
        success: exploited,
        loss: exploited ? payment.amount : 0,
        detail: exploited
          ? "A callback outside the allowed time window credited the payment."
          : "The thirty-minute-old callback was rejected as stale.",
      };
    },
  },
  {
    id: "retry-storm",
    name: "Retry storm",
    summary: "Retry one delivery repeatedly with the same event ID.",
    severity: "High",
    control: "Idempotency",
    async run(handler, { amount = 10, retryCount = 10 } = {}) {
      const payment = newPayment(amount);
      const event = makeEvent(payment);
      let extraCredits = 0;
      for (let attempt = 0; attempt < retryCount; attempt += 1) {
        const result = handler({ ...event });
        if (attempt > 0 && result.ok) extraCredits += 1;
      }
      return {
        success: extraCredits > 0,
        loss: extraCredits * payment.amount,
        detail: extraCredits > 0
          ? `${extraCredits} of ${retryCount - 1} retries credited the payment again.`
          : `All ${retryCount - 1} repeated deliveries were deduplicated.`,
      };
    },
  },
];
