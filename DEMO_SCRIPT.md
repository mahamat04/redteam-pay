# RedTeam Pay demo video (about 100 seconds)

Keep the recording under three minutes. Show the product working on screen, use narration or captions, and do not add unlicensed music. The PayPal sandbox order must be shown as a sandbox order that is not captured.

## Shot list and narration

### 0:00–0:12 — The problem

Show the RedTeam Pay dashboard. Say: “Payment teams rely on webhooks to confirm orders. Duplicate events, amount mismatches, and replays can turn a small integration bug into a payment incident.”

### 0:12–0:42 — The IDE agent

In Codex or VS Code, ask the RedTeam Pay agent to review the sample payment project. Show it calling `redteam_pay_scan_project`, opening one cited file, and explaining a finding. Say: “The MCP tool locates likely controls. The IDE’s AI inspects the surrounding code and explains the evidence. The scan is read-only and heuristic, so every claim links back to code.”

### 0:42–1:12 — The interactive lab

Select duplicate delivery, amount tampering, and retry storm. Run the simulation and expand one result. Say: “The lab runs the same attacks against a vulnerable and a hardened reference handler. This is an educational model; it does not run or change the developer’s app.”

### 1:12–1:30 — PayPal sandbox

If sandbox credentials are configured, create one sandbox order and show its status. Say: “RedTeam Pay can create a real PayPal sandbox order. It is not captured and no real funds move.” If credentials are unavailable, show the setup explanation in the dashboard and keep the rest of the demo live.

### 1:30–1:40 — Close

Say: “RedTeam Pay brings payment webhook review into the IDE and makes common failure modes visible before release.” Show the project name and GitHub repository URL on screen.

## Recording checklist

- Public YouTube link, under 3 minutes, included in the Devpost entry.
- Show both the IDE agent interaction and the working dashboard.
- Keep API keys, tokens, account details, and personal notifications out of frame.
- Use the hosted app or start the local dashboard with `npm start`.
