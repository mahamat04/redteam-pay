#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "Installing RedTeam Pay dependencies..."
npm install
echo
echo "Installing the Codex and VS Code agent integrations in this folder..."
npm run setup:ide -- all .
echo
echo "Ready. Start the dashboard with: npm start"
echo "Then open http://localhost:3000"
echo "Restart or reload your IDE agent to discover RedTeam Pay."
