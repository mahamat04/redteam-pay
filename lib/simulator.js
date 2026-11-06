import { attacks, hardeningControls, resetStore, naiveHandler, hardenedHandler } from "./handlers.js";

const CURRENCIES = new Set(["USD", "EUR", "GBP", "CAD"]);

export async function runReferenceSimulation({
  amount = 10,
  currency = "USD",
  retryCount = 10,
  attackIds = attacks.map((attack) => attack.id),
} = {}) {
  const paymentAmount = Math.round(Number(amount) * 100) / 100;
  const normalizedCurrency = String(currency).toUpperCase();
  const retries = Number(retryCount);
  const selectedIds = new Set(attackIds);
  const selectedAttacks = attacks.filter((attack) => selectedIds.has(attack.id));

  if (!Number.isFinite(paymentAmount) || paymentAmount < 0.01 || paymentAmount > 1_000_000) {
    throw new Error("Amount must be between 0.01 and 1,000,000.");
  }
  if (!CURRENCIES.has(normalizedCurrency)) {
    throw new Error("Choose USD, EUR, GBP, or CAD.");
  }
  if (!Number.isInteger(retries) || retries < 2 || retries > 30) {
    throw new Error("Retry count must be a whole number from 2 to 30.");
  }
  if (!selectedAttacks.length || selectedAttacks.length !== selectedIds.size) {
    throw new Error("Choose at least one valid attack scenario.");
  }

  resetStore();
  const baseline = [];
  for (const attack of selectedAttacks) {
    const result = await attack.run(naiveHandler, { amount: paymentAmount, retryCount: retries });
    baseline.push({ id: attack.id, name: attack.name, success: result.success, loss: result.loss, detail: result.detail });
  }
  const simulatedExposure = baseline.reduce((total, result) => total + result.loss, 0);

  resetStore();
  const hardened = [];
  for (const attack of selectedAttacks) {
    const result = await attack.run(hardenedHandler, { amount: paymentAmount, retryCount: retries });
    hardened.push({
      id: attack.id,
      name: attack.name,
      blocked: !result.success,
      loss: result.loss,
      detail: result.detail,
    });
  }
  resetStore();

  const blockedCount = hardened.filter((result) => result.blocked).length;
  return {
    mode: "deterministic reference simulation",
    amount: paymentAmount,
    currency: normalizedCurrency,
    retryCount: retries,
    scenarios: selectedAttacks.map(({ id, name, severity, control }) => ({ id, name, severity, control })),
    baseline,
    hardened,
    summary: {
      simulatedExposure,
      exposurePrevented: simulatedExposure,
      blockedCount,
      scenarioCount: selectedAttacks.length,
    },
    controls: hardeningControls,
    caveat: "This exercises RedTeam Pay's in-memory reference handlers. It does not execute, scan, or certify the target project's payment code.",
  };
}
