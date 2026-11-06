# RedTeam Pay — payment security agent and lab

RedTeam Pay is a local payment webhook security lab and an installable IDE agent. The browser app demonstrates common webhook failure modes with deterministic reference handlers. The MCP server gives an IDE agent read-only project scanning tools, and the included Agent Skill guides a careful code review.

The scan is heuristic: it returns payment-related source files and possible control indicators with line references for manual inspection. It does not execute or change project code. The simulator only runs RedTeam Pay's in-memory examples; it does not test the user's app or move money.

## Requirements

- Node.js 20 or newer.
- Codex or VS Code with agent and MCP support for IDE integration.

## Run the lab

    npm install
    npm start

Open http://localhost:3000. Choose attack scenarios, tune the amount and retry count, run the vulnerable and hardened reference passes, then inspect or export the report.

## Install the IDE agent

From the RedTeam Pay folder, install both the Codex and VS Code integrations into the current workspace:

    npm run setup:ide -- all .

Choose one agent if preferred:

    node scripts/install-ide.mjs codex .
    node scripts/install-ide.mjs vscode .

The installer places the review skill in `.agents/skills/redteam-pay/` for Codex and `.github/skills/redteam-pay/` for VS Code Copilot. It adds the MCP server to `.codex/config.toml` and `.vscode/mcp.json`, preserving other server entries. Restart or reload the IDE agent after setup.

If the IDE workspace is a parent folder, pass its path as the last argument, for example `node scripts/install-ide.mjs all ..`.

## Agent tools

- `redteam_pay_scan_project`: inspect supported source files for payment and webhook indicators, returning paths and line numbers. It stays inside the active IDE workspace, skips common dependency/build folders, and never writes to source files.
- `redteam_pay_list_scenarios`: describe the risks and controls represented in the lab.
- `redteam_pay_run_simulation`: compare selected scenarios against RedTeam Pay's in-memory vulnerable and hardened reference handlers.

The skill tells the IDE agent to inspect cited source in context, state uncertainty, and avoid presenting heuristic output as an audit or certification.

## Optional integrations in the web lab

### PayPal sandbox proof

Set `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` in `.env`, and keep `PAYPAL_ENVIRONMENT=sandbox`. The explicit dashboard button creates one sandbox order and does not capture it. The MCP server never uses PayPal credentials or sends payment requests.

### AI explanation

Set `LLM_API_KEY` to enable an optional explanation of the simulation's controls. `LLM_BASE_URL` and `LLM_MODEL` can point to another OpenAI-compatible provider. Without a key, the built-in guide works.

The interface uses JetBrains Mono, with Cascadia Code and Consolas fallbacks. When Google Fonts is unavailable, the local fallback fonts are used.

## Deploy to Vercel

Vercel detects the Express app from the root `server.js` default export and serves the dashboard in `public/` as static assets. Keep Vercel's build and output-directory settings at their automatic defaults; import the `redteam-pay/` folder as the project root. The simulation works without credentials; to demonstrate the live AI explanation and PayPal sandbox proof, add these in Vercel's project environment settings:

- `LLM_API_KEY` (secret), plus `LLM_BASE_URL` and `LLM_MODEL` if using a compatible provider other than the defaults.
- `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` (secrets), with `PAYPAL_ENVIRONMENT=sandbox`.

Never commit `.env` or paste credentials into the source repository. The PayPal proof button only creates a sandbox order; it does not capture it.

## Development

    npm run dev
    npm test

## License

MIT
