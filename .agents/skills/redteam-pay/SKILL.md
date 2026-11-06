---
name: redteam-pay
description: Review payment and PayPal webhook code for signature, idempotency, amount, payment-state, replay, and retry risks. Use when investigating a checkout or webhook integration, preparing a security review, or explaining payment-flow hardening in an IDE.
---

# RedTeam Pay review workflow

Use this skill to review payment-related code in the active IDE workspace.

1. Call `redteam_pay_scan_project` to locate payment-related source files and possible control indicators. Start with the whole workspace; narrow the scan with `subpath` when it is large.
2. Open the cited files in the IDE and inspect the surrounding control flow. Check whether signature verification uses the provider's real verification mechanism, whether event IDs are persisted atomically, whether amount and currency are reconciled against the intended order, whether event age and payment state are checked, and whether retries are safe.
3. Explain each finding with its file and line, the evidence, the likely impact, and a concrete remediation. Separate confirmed behavior from patterns that need more context. Treat a missing heuristic match as unknown, never as proof that a defense is absent.
4. When useful, call `redteam_pay_list_scenarios` or `redteam_pay_run_simulation` to explain the lab's examples. Clearly label those results as reference simulations; they do not run the target project.
5. Summarize what was reviewed, what remains uncertain, and the next practical action. Do not claim certification or a complete audit from this scan.

## Boundaries

- The project scan is read-only and limited to source files inside the active workspace. It returns heuristic indicators and line references, not complete program analysis.
- Do not run project code, send live payment or webhook requests, access credentials, or edit files as part of this review unless the user separately asks for that action.
- The reference simulation runs only RedTeam Pay's in-memory example handlers. It cannot establish whether the user's integration is vulnerable or safe.
- Never ask the user to paste API secrets into chat. If credentials are needed for a separately requested local setup, use the project's local environment file and keep them out of reports.
