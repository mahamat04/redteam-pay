# Devpost Submission — RedTeam Pay

## Project name
RedTeam Pay — Adversarial Payment Simulator

## Tagline
Two AI agents face off: a Builder hardens a payment flow, an Attacker hammers it with fraud and failure. Watch the bug appear, then the "losses avoided" counter fill up.

## What it does
RedTeam Pay runs an adversarial loop over a payment webhook handler:
- Phase 1 (naive): an Attacker fires 5 attacks — duplicate webhook (replay), tampered amount, replay of old transaction id, late callback, retry storm. The naive handler credits on every event. Losses are tallied live.
- Builder: an LLM (Groq, free tier) explains the hardening; a deterministic patch adds idempotency, amount reconciliation, replay window, and HMAC signature verification.
- Phase 2 (hardened): the same attacks re-run and are all blocked. The "losses avoided" counter animates to the Phase 1 total.

Optionally creates a real PayPal sandbox order to prove integration. Real PayPal webhook signature verification is wired via `/v1/notifications/verify-webhook-signature` when `PAYPAL_WEBHOOK_ID` is set.

## How it's built
- Node 20 + Express + SSE for live streaming.
- In-memory payment store; naive vs hardened handlers.
- PayPal REST (client credentials) for sandbox order creation + webhook verification.
- OpenAI-compatible LLM client pointed at Groq free tier (configurable to any provider).
- Static HTML dashboard (no build step) — single file.

## Tools / AI used
- Groq (llama-3.3-70b) for builder hardening explanation (free tier).
- PayPal Developer sandbox: Orders API + webhook signature verification.
- Deterministic fallback so the demo runs with zero API keys.

## Tracks targeted
- Best Use of PayPal + AI
- Best Use of Agentic Commerce (agent transacts in sandbox)
- Most Creative / Innovation

## Run
See README.md. `npm install && npm start` -> http://localhost:3000 -> click "Run adversarial loop".

## Demo video (TODO)
Under 3 minutes: show naive run -> losses -> builder patch -> hardened run -> losses avoided.