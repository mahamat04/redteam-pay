#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { attacks, hardeningControls } from "./lib/handlers.js";
import { scanProject } from "./lib/project-scanner.js";
import { runReferenceSimulation } from "./lib/simulator.js";

const server = new McpServer({ name: "redteam-pay", version: "0.4.0" });
const attackIds = attacks.map((attack) => attack.id);
const attackIdSchema = z.enum(attackIds);
let simulationTail = Promise.resolve();

async function runSerializedSimulation(options) {
  let release;
  const previous = simulationTail;
  simulationTail = new Promise((resolve) => { release = resolve; });
  await previous;
  try {
    return await runReferenceSimulation(options);
  } finally {
    release();
  }
}

server.tool(
  "redteam_pay_list_scenarios",
  "List the payment webhook risks and reference controls available in RedTeam Pay.",
  async () => ({
    content: [{
      type: "text",
      text: JSON.stringify({
        scenarios: attacks.map(({ id, name, summary, severity, control }) => ({ id, name, summary, severity, control })),
        controls: hardeningControls,
        note: "Scenarios exercise an in-memory teaching model; they do not execute the user's integration.",
      }, null, 2),
    }],
  }),
);

server.tool(
  "redteam_pay_scan_project",
  "Perform a read-only heuristic scan of payment-related source files in the current IDE workspace. Returns candidate file paths and line numbers for manual review.",
  { subpath: z.string().default(".").describe("Optional relative folder inside the IDE workspace; defaults to the workspace root.") },
  async ({ subpath }) => {
    try {
      return { content: [{ type: "text", text: JSON.stringify(scanProject(subpath), null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: error instanceof Error ? error.message : "The workspace scan failed." }],
        isError: true,
      };
    }
  },
);

server.tool(
  "redteam_pay_run_simulation",
  "Run the selected deterministic attacks against RedTeam Pay's vulnerable and hardened reference handlers. Does not run the user's app or move money.",
  {
    amount: z.number().min(0.01).max(1_000_000).default(10).describe("Simulated payment amount."),
    currency: z.enum(["USD", "EUR", "GBP", "CAD"]).default("USD"),
    retryCount: z.number().int().min(2).max(30).default(10).describe("Number of repeated deliveries in the retry-storm scenario."),
    attacks: z.array(attackIdSchema).min(1).default(attackIds).describe("Attack scenario IDs to include."),
  },
  async ({ amount, currency, retryCount, attacks: selectedIds }) => {
    try {
      const result = await runSerializedSimulation({
        amount,
        currency,
        retryCount,
        attackIds: selectedIds,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: error instanceof Error ? error.message : "The reference simulation failed." }],
        isError: true,
      };
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  // stdout is reserved for MCP JSON-RPC messages.
  console.error("[redteam-pay-mcp]", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
