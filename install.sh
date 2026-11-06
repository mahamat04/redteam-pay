#!/usr/bin/env bash
set -e
echo "Installing RedTeam Pay..."
npm install -g redteam-pay 2>/dev/null || npm install
echo ""
echo "Copy integrations/<tool>.mcp.json into your MCP client config."
echo "Then set PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, LLM_API_KEY in env."
echo "Run: redteam-pay   (opens http://localhost:3000)"