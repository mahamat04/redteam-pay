$ErrorActionPreference = "Stop"
Push-Location $PSScriptRoot
try {
    Write-Host "Installing RedTeam Pay dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed." }
    Write-Host ""
    Write-Host "Installing the Codex and VS Code agent integrations in this folder..."
    npm run setup:ide -- all .
    if ($LASTEXITCODE -ne 0) { throw "IDE setup failed." }
    Write-Host ""
    Write-Host "Ready. Start the dashboard with: npm start"
    Write-Host "Then open http://localhost:3000"
    Write-Host "Restart or reload your IDE agent to discover RedTeam Pay."
} finally {
    Pop-Location
}
