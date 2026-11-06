# install.ps1 - Windows installer for RedTeam Pay
$ErrorActionPreference = "Stop"
Write-Host "Installing RedTeam Pay..."
npm install -g redteam-pay 2>$null
if ($LASTEXITCODE -ne 0) { npm install }
Write-Host ""
Write-Host "Copy integrations\<tool>.mcp.json into your MCP client config."
Write-Host "Set PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, LLM_API_KEY in env."
Write-Host "Run: redteam-pay   (opens http://localhost:3000)"