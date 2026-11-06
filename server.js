import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import { pp } from "./lib/paypal.js";
import { newPayment, resetStore, naiveHandler, hardenedHandler, attacks, makeEvent } from "./lib/handlers.js";

const app = express();
app.use(express.json({ limit: "64kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'");
  next();
});
const rateBuckets = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const windowMs = 60000;
  const max = 10;
  let b = rateBuckets.get(ip);
  if (!b || now - b.start > windowMs) b = { start: now, count: 0 };
  b.count++;
  rateBuckets.set(ip, b);
  if (b.count > max) { res.status(429).json({ error: "Too many requests" }); return; }
  next();
}
app.use("/api/run", rateLimit);
app.use(express.static("public"));

const LLM_BASE = process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1";
const LLM_KEY = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "";
const LLM_MODEL = process.env.LLM_MODEL || "llama-3.3-70b-versatile";
const llm = new OpenAI({ apiKey: LLM_KEY || "none", baseURL: LLM_BASE });

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

const REPLAY_WINDOW_MS = 5 * 60 * 1000;

app.get("/api/run", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  try {
    resetStore();
    send({ type: "phase", phase: 1, title: "Phase 1 — Naive handler (vulnerable)" });
    let totalLoss = 0;
    for (const a of attacks) {
      send({ type: "attack_start", name: a.name });
      const r = await a.run(naiveHandler);
      if (r.success) totalLoss += r.loss;
      send({ type: "attack_result", name: a.name, success: r.success, loss: r.loss, detail: r.detail });
      await sleep(600);
    }
    send({ type: "phase_done", phase: 1, totalLoss, message: `Naive handler lost $${totalLoss.toFixed(2)}` });

    send({ type: "builder", status: "patching" });
    let explanation = null;
    if (LLM_KEY) {
      try {
        const r = await llm.chat.completions.create({
          model: LLM_MODEL,
          messages: [{ role: "user", content: "In 3 sentences, explain how to harden a payment webhook handler against duplicate webhooks, tampered amounts, replay attacks, and retry storms. Be concrete." }],
          max_tokens: 400,
        });
        explanation = r.choices?.[0]?.message?.content || null;
      } catch (e) { explanation = null; }
    }
    send({
      type: "builder",
      status: "done",
      patch: explanation || "Applied hardening: idempotency keys, amount reconciliation, replay window (5min), HMAC signature verification.",
      diff: [
        "- if (webhook) credit();",
        "+ if (seen(eventId)) return 200;          // idempotency",
        "+ if (amount !== storedAmount) reject;    // reconciliation",
        "+ if (now - ts > 5min) reject;           // replay window",
        "+ if (!verifyHmac(body, sig)) reject;     // signature",
        "+ credit(); markSeen(eventId);",
      ].join("\n"),
    });

    let paypalProof = "PayPal creds not set — running in mock mode.";
    if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) {
      try {
        const o = await pp("POST", "/v2/checkout/orders", {
          intent: "CAPTURE",
          purchase_units: [{ amount: { currency_code: "USD", value: "10.00" } }],
        });
        paypalProof = `PayPal sandbox order created: ${o.id} (${o.status})`;
      } catch (e) {
        paypalProof = `PayPal call failed: ${e.message}`;
      }
    }
    send({ type: "paypal", proof: paypalProof });

    send({ type: "phase", phase: 2, title: "Phase 2 — Hardened handler (patched)" });
    for (const a of attacks) {
      send({ type: "attack_start", name: a.name });
      const r = await a.run(hardenedHandler);
      send({ type: "attack_result", name: a.name, success: r.success, loss: r.loss, detail: r.detail, blocked: !r.success });
      await sleep(600);
    }
    send({ type: "phase_done", phase: 2, totalLoss: 0, avoided: totalLoss, message: `All attacks blocked. Losses avoided: $${totalLoss.toFixed(2)}` });
    send({ type: "done", avoided: totalLoss });
  } catch (e) {
    send({ type: "error", message: e.message });
  } finally {
    res.end();
  }
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`RedTeam Pay running on http://localhost:${PORT}`));
