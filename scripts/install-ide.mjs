#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const agents = new Set(["codex", "vscode", "all"]);
const selectedAgent = (args[0] || "all").toLowerCase();
const workspaceRoot = resolve(args[1] || process.cwd());
if (!agents.has(selectedAgent)) {
  console.error("Usage: node scripts/install-ide.mjs [codex|vscode|all] [workspace-folder]");
  process.exit(2);
}
if (!existsSync(workspaceRoot)) {
  console.error(`Workspace folder does not exist: ${workspaceRoot}`);
  process.exit(2);
}

const skillSource = join(appRoot, ".agents", "skills", "redteam-pay", "SKILL.md");
const mcpServer = join(appRoot, "mcp-server.js");
if (!existsSync(skillSource) || !existsSync(mcpServer)) {
  console.error("Run the installer from the RedTeam Pay package or repository.");
  process.exit(2);
}

function copySkill(destination) {
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(skillSource, destination);
  console.log(`Installed skill: ${destination}`);
}

function writeCodexConfig() {
  const configPath = join(workspaceRoot, ".codex", "config.toml");
  mkdirSync(dirname(configPath), { recursive: true });
  const existing = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
  if (/^\[mcp_servers\.redteam-pay\]\s*$/m.test(existing)) {
    console.log(`Codex MCP entry already exists; left unchanged: ${configPath}`);
    return;
  }
  const quote = (value) => JSON.stringify(value);
  const entry = [
    "[mcp_servers.redteam-pay]",
    `command = ${quote(process.execPath)}`,
    `args = [${quote(mcpServer)}]`,
    `cwd = ${quote(appRoot)}`,
    `env = { REDTEAM_PAY_WORKSPACE = ${quote(workspaceRoot)} }`,
  ].join("\n");
  const prefix = existing.trimEnd();
  writeFileSync(configPath, `${prefix ? `${prefix}\n\n` : ""}${entry}\n`, "utf8");
  console.log(`Configured Codex MCP server: ${configPath}`);
}

function parseJsonc(text) {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      output += char;
    } else if (char === "/" && next === "/") {
      while (index < text.length && text[index] !== "\n") index += 1;
      output += "\n";
    } else if (char === "/" && next === "*") {
      index += 2;
      while (index < text.length && !(text[index] === "*" && text[index + 1] === "/")) index += 1;
      index += 1;
    } else {
      output += char;
    }
  }
  return output.replace(/,\s*([}\]])/g, "$1");
}

function writeVsCodeConfig() {
  const configPath = join(workspaceRoot, ".vscode", "mcp.json");
  mkdirSync(dirname(configPath), { recursive: true });
  let config = { servers: {} };
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(parseJsonc(readFileSync(configPath, "utf8")));
    } catch {
      console.error(`Could not safely merge the existing VS Code MCP config; left unchanged: ${configPath}`);
      return;
    }
  }
  if (!config || typeof config !== "object" || Array.isArray(config)) config = {};
  if (!config.servers || typeof config.servers !== "object" || Array.isArray(config.servers)) config.servers = {};
  if (config.servers["redteam-pay"]) {
    console.log(`VS Code MCP entry already exists; left unchanged: ${configPath}`);
    return;
  }
  const relativeServer = mcpServer.startsWith(workspaceRoot + sep)
    ? `\${workspaceFolder}/${mcpServer.slice(workspaceRoot.length + 1).split(sep).join("/")}`
    : mcpServer.replaceAll("\\", "/");
  const relativeAppRoot = appRoot.startsWith(workspaceRoot + sep)
    ? `\${workspaceFolder}/${appRoot.slice(workspaceRoot.length + 1).split(sep).join("/")}`
    : appRoot.replaceAll("\\", "/");
  config.servers["redteam-pay"] = {
    type: "stdio",
    command: process.execPath,
    args: [relativeServer],
    cwd: relativeAppRoot,
    env: { REDTEAM_PAY_WORKSPACE: "\${workspaceFolder}" },
  };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  console.log(`Configured VS Code MCP server: ${configPath}`);
}

if (selectedAgent === "codex" || selectedAgent === "all") {
  copySkill(join(workspaceRoot, ".agents", "skills", "redteam-pay", "SKILL.md"));
  writeCodexConfig();
}
if (selectedAgent === "vscode" || selectedAgent === "all") {
  copySkill(join(workspaceRoot, ".github", "skills", "redteam-pay", "SKILL.md"));
  writeVsCodeConfig();
}
console.log("Restart the IDE or reload its agent window so it discovers the new skill and MCP server.");
