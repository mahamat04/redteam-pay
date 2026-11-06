# Devpost Submission — RedTeam Pay

## Project name

RedTeam Pay — Payment Webhook Security Agent

## Tagline

Install a payment security agent in your IDE. Find webhook risks before they reach production.

## What it does

RedTeam Pay combines an interactive payment webhook lab with an installable IDE agent. Its MCP server exposes three tools to an IDE agent:

- Find payment-related source files and likely security-control indicators, with file and line references.
- Explain the lab's webhook attack scenarios and defensive controls.
- Run deterministic reference attacks against an in-memory vulnerable handler and hardened reference.

An included Agent Skill guides the IDE agent to inspect the cited code in context, explain concrete evidence, and call out uncertainty. The scanner is read-only and heuristic; the reference attacks never execute the developer's application.

## PayPal and AI

- The web dashboard can optionally create a PayPal sandbox order after an explicit click. It is not captured. The MCP tools do not call PayPal or access credentials.
- An optional OpenAI-compatible LLM explains the defenses used in a simulation. The built-in guide works without an API key.
- Signature verification in the reference simulation is a fixture. A production integration must use PayPal's real webhook verification and reconcile events against its own order record.

## How it's built

- Node.js 20+, Express, and the Model Context Protocol TypeScript SDK.
- Static HTML, CSS, and JavaScript dashboard, styled with JetBrains Mono.
- MCP server over stdio for Codex and VS Code agent integrations.
- Agent Skill in the standard `.agents/skills/` and `.github/skills/` locations.
- Deterministic in-memory scenarios, server-sent progress events, browser-local history, and JSON report export.

## Install and demo

1. From the RedTeam Pay folder, run `npm install`, then `npm run setup:ide -- all .`.
2. Restart the IDE agent and ask it to review the current project's payment or webhook code.
3. Inspect the returned source references and ask the agent to explain any uncertain indicator.
4. In the web lab, select attacks and run the reference comparison; inspect the report and export it as JSON.
5. Optionally create a PayPal sandbox order from the dashboard. It is not captured.

## Scope

RedTeam Pay is a review aid and learning lab, not an automated security certification. Its source scan can miss controls or flag irrelevant patterns. Findings require manual review in context. The simulator does not execute user code, edit project files, send webhook events, or move real money.
