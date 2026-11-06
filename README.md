# RedTeam Pay — Adversarial Payment Simulator

Two AI agents face off: a **Builder** hardens a payment flow, an **Attacker** hammers it with frauds and failures (duplicate webhooks, tampered amounts, replay, late callbacks, retry storms). When the attacker finds a loss, the builder auto-patches and the loop re-runs. Watch the "losses avoided" counter fill up.

## Run

```bash
cd redteam-pay
npm install
cp .env.example .env   # optional: add PayPal sandbox creds + Groq key
npm start              # http://localhost:3000
```

Open the dashboard, click **Run adversarial loop**.

## PayPal (optional but recommended for hackathon)
Set `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET` (sandbox) in `.env`. The run loop will create a real sandbox order to prove integration.

## AI (optional, free)
Set `LLM_API_KEY` (Groq free tier) for LLM-generated hardening explanation. Falls back to a deterministic patch if unset. Fully free: use Groq or any OpenAI-compatible endpoint.

## License
MIT