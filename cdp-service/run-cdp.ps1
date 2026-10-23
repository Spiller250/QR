# Starts the VERIQ CDP analysis service on http://127.0.0.1:8100 (internal; Express calls it).
# Usage:  powershell -ExecutionPolicy Bypass -File cdp-service\run-cdp.ps1 [-Port 8100] [-Test]
param(
  [int]$Port = 8100,
  [switch]$Test
)
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

$python = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path $python)) {
  Write-Host 'Creating virtual environment (.venv)...'
  $base = (Get-Command py -ErrorAction SilentlyContinue)
  if ($base) { & py -3 -m venv .venv } else { & python -m venv .venv }
  & $python -m pip install --upgrade pip
}
Write-Host 'Installing/updating dependencies...'
& $python -m pip install -q -r requirements-dev.txt

if ($Test) {
  & $python -m pytest -q
  exit $LASTEXITCODE
}

Write-Host "CDP service listening on http://127.0.0.1:$Port  (health: /health, docs: /docs)"
& $python -m uvicorn app.main:app --host 127.0.0.1 --port $Port
