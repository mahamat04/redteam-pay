#!/usr/bin/env node
import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pp, base as paypalBase } from "./lib/paypal.js";
import { resetStore, naiveHandler, hardenedHandler, attacks, hardeningControls } from "./lib/handlers.js";

const app = express();
const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const CURRENCIES = new Set(["USD", "EUR", "GBP", "CAD"]);
const MAX_AMOUNT = 1_000_000;

app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com");
  next();
});

const rateBuckets = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const windowMs = 60_000;
  const max = 10;
  for (const [key, bucket] of rateBuckets) {
    if (now - bucket.start > windowMs) rateBuckets.delete(key);
  }
  let bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.start > windowMs) bucket = { start: now, count: 0 };
  bucket.count += 1;
  rateBuckets.set(ip, bucket);
  if (bucket.count > max) {
    res.status(429).json({ error: "Too many requests. Wait a minute and try again." });
    return;
  }
  next();
}

app.use(express.static(join(ROOT, "public"), { extensions: ["html"] }));

const LLM_BASE = process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1";
const LLM_KEY = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "";
const LLM_MODEL = process.env.LLM_MODEL || "llama-3.3-70b-versatile";
const llm = new OpenAI({ apiKey: LLM_KEY || "none", baseURL: LLM_BASE });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let runActive = false;

app.get("/api/health", (req, res) => {
  res.json({ ok: true, version: "0.4.0", uptime: process.uptime() });
});

app.get("/api/config", (req, res) => {
  const configured = Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
  const sandbox = paypalBase.includes("sandbox");
  res.json({
    paypalSandboxReady: configured && sandbox,
    paypalConfigured: configured,
    paypalMode: sandbox ? "sandbox" : "live",
    aiExplanationAvailable: Boolean(LLM_KEY),
  });
});

app.get("/api/scenarios", (req, res) => {
  res.json({
    attacks: attacks.map(({ id, name, summary, severity, control }) => ({ id, name, summary, severity, control })),
    controls: hardeningControls,
    replayWindowMinutes: 5,
    signatureMode: "simulated fixture",
  });
});

app.get("/api/run", rateLimit, async (req, res) => {
  if (runActive) {
    res.status(409).json({ error: "A simulation is already running. Wait for it to finish." });
    return;
  }

  const amount = Math.round(Number(req.query.amount ?? 10) * 100) / 100;
  const retryCount = Number(req.query.retryCount ?? 10);
  const currency = String(req.query.currency ?? "USD").toUpperCase();
  const selectedIds = typeof req.query.attacks === "string"
    ? new Set(req.query.attacks.split(",").filter(Boolean))
    : new Set(attacks.map((attack) => attack.id));
  const selectedAttacks = attacks.filter((attack) => selectedIds.has(attack.id));

  if (!Number.isFinite(amount) || amount < 0.01 || amount > MAX_AMOUNT) {
    res.status(400).json({ error: `Amount must be between 0.01 and ${MAX_AMOUNT.toLocaleString("en-US")}.` });
    return;
  }
  if (!Number.isInteger(retryCount) || retryCount < 2 || retryCount > 30) {
    res.status(400).json({ error: "Retry count must be a whole number from 2 to 30." });
    return;
  }
  if (!CURRENCIES.has(currency)) {
    res.status(400).json({ error: "Choose USD, EUR, GBP, or CAD." });
    return;
  }
  if (selectedAttacks.length === 0 || selectedAttacks.length !== selectedIds.size) {
    res.status(400).json({ error: "Choose at least one valid attack scenario." });
    return;
  }

  runActive = true;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  let aborted = false;
  res.on("close", () => {
    if (!res.writableEnded) aborted = true;
  });
  const send = (payload) => {
    if (!aborted && !res.writableEnded) res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };
  const progressTotal = selectedAttacks.length * 2;
  let completed = 0;
  let baselineLoss = 0;

  try {
    resetStore();
    send({ type: "run_start", amount, currency, retryCount, attackCount: selectedAttacks.length });
    send({ type: "phase", phase: 1, title: "Baseline · vulnerable handler" });

    for (const attack of selectedAttacks) {
      if (aborted) return;
      send({ type: "attack_start", phase: 1, id: attack.id, name: attack.name });
      const result = await attack.run(naiveHandler, { amount, retryCount });
      baselineLoss += result.loss;
      completed += 1;
      send({
        type: "attack_result",
        phase: 1,
        id: attack.id,
        name: attack.name,
        success: result.success,
        loss: result.loss,
        detail: result.detail,
        progress: completed / progressTotal,
      });
      await sleep(320);
    }
    send({
      type: "phase_done",
      phase: 1,
      totalLoss: baselineLoss,
      message: `Baseline exposed ${currency} ${baselineLoss.toFixed(2)} in this simulation.`,
    });

    if (aborted) return;
    send({ type: "builder", status: "patching" });
    let explanation = null;
    if (LLM_KEY) {
      try {
        const response = await llm.chat.completions.create({
          model: LLM_MODEL,
          messages: [
            {
              role: "system",
              content: "You are a payment security educator. Explain, in three concise sentences, why idempotency, amount reconciliation, a replay window, and provider signature verification matter for webhook handlers. Clearly distinguish the simulator fixture from real PayPal signature verification.",
            },
            {
              role: "user",
              content: `The learner ran ${selectedAttacks.map((attack) => attack.name).join(", ")}. Explain the relevant controls without claiming that application code was changed.`,
            },
          ],
          max_tokens: 320,
        });
        explanation = response.choices?.[0]?.message?.content?.trim() || null;
      } catch {
        explanation = null;
      }
    }

    send({
      type: "builder",
      status: "done",
      source: explanation ? "AI explanation" : "Built-in guide",
      patch: explanation || "The reference handler checks each payment against four controls before crediting it. This lab models the checks; it does not edit your application code.",
      controls: hardeningControls,
    });
    if (aborted) return;

    resetStore();
    send({ type: "phase", phase: 2, title: "Hardened reference · same attacks" });
    let blockedCount = 0;
    for (const attack of selectedAttacks) {
      if (aborted) return;
      send({ type: "attack_start", phase: 2, id: attack.id, name: attack.name });
      const result = await attack.run(hardenedHandler, { amount, retryCount });
      const blocked = !result.success;
      if (blocked) blockedCount += 1;
      completed += 1;
      send({
        type: "attack_result",
        phase: 2,
        id: attack.id,
        name: attack.name,
        success: result.success,
        blocked,
        loss: result.loss,
        detail: result.detail,
        progress: completed / progressTotal,
      });
      await sleep(320);
    }

    send({
      type: "phase_done",
      phase: 2,
      totalLoss: 0,
      avoided: baselineLoss,
      blockedCount,
      message: `${blockedCount} of ${selectedAttacks.length} attack scenarios were stopped by the reference handler.`,
    });
    send({
      type: "done",
      currency,
      amount,
      retryCount,
      selectedAttacks: selectedAttacks.map(({ id, name }) => ({ id, name })),
      totalLoss: baselineLoss,
      avoided: baselineLoss,
      blockedCount,
      progress: 1,
    });
  } catch (error) {
    send({ type: "error", message: error instanceof Error ? error.message : "The simulation could not finish." });
  } finally {
    runActive = false;
    if (!res.writableEnded) res.end();
  }
});

app.post("/api/paypal/sandbox-order", rateLimit, async (req, res) => {
  const amount = Number(req.body?.amount ?? 10);
  const currency = String(req.body?.currency ?? "USD").toUpperCase();
  if (!Number.isFinite(amount) || amount < 0.01 || amount > MAX_AMOUNT) {
    res.status(400).json({ error: "Enter an amount between 0.01 and 1,000,000." });
    return;
  }
  if (!CURRENCIES.has(currency)) {
    res.status(400).json({ error: "Choose USD, EUR, GBP, or CAD." });
    return;
  }
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
    res.status(503).json({ error: "PayPal sandbox credentials are not configured." });
    return;
  }
  if (!paypalBase.includes("sandbox")) {
    res.status(409).json({ error: "The app is configured for PayPal live mode. The lab only creates sandbox orders." });
    return;
  }
  try {
    const order = await pp("POST", "/v2/checkout/orders", {
      intent: "CAPTURE",
      purchase_units: [{ amount: { currency_code: currency, value: amount.toFixed(2) } }],
    });
    res.json({ id: order.id, status: order.status, amount: amount.toFixed(2), currency });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "PayPal sandbox request failed." });
  }
});

app.use((req, res) => res.status(404).json({ error: "Not found" }));
app.use((error, req, res, next) => {
  console.error("[error]", error instanceof Error ? error.message : error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: "Internal server error" });
});

export { app };
export default app;

if (process.env.VERCEL !== "1") {
  const server = app.listen(PORT, HOST, () => {
    console.log(`RedTeam Pay v0.4.0 running on http://${HOST}:${PORT}`);
    console.log(`PayPal proof: ${process.env.PAYPAL_CLIENT_ID ? (paypalBase.includes("sandbox") ? "sandbox ready" : "live mode, sandbox proof disabled") : "not configured"}`);
    console.log(`AI explanation: ${LLM_KEY ? LLM_MODEL : "built-in guide"}`);
  });

  function shutdown(signal) {
    console.log(`\n${signal} received, shutting down gracefully...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  }
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
