@echo off
setlocal EnableExtensions
title AIHub Collector - Local Admin

cd /d "%~dp0"

echo.
echo ==========================================
echo   AIHub Collector Local Admin
echo ==========================================
echo   Project dir: %cd%
echo   Admin URL  : http://localhost:3001/collector
echo   Options    : start-collector.cmd --skip-seed
echo.

if not exist package.json (
  echo [ERROR] package.json was not found. Put this file in the aihub project root.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Please install Node.js 20 or newer.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found. Please reinstall Node.js.
  pause
  exit /b 1
)

echo [CHECK] Node version:
node -v
echo [CHECK] npm version:
call npm -v
echo.

echo [CHECK] Detecting existing listener on port 3001...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$c = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue; if ($c) { exit 0 } else { exit 1 }" >nul 2>nul
if %errorlevel%==0 (
  echo [OK] Port 3001 is already listening.
  start "" "http://localhost:3001/collector"
  echo.
  echo Press any key to close this window. The existing server will keep running.
  pause >nul
  exit /b 0
)

if not exist node_modules (
  echo [SETUP] node_modules not found. Installing dependencies...
  call npm install
  if errorlevel 1 goto :error
) else (
  echo [SKIP] node_modules already exists.
)

echo.
if exist node_modules\.prisma\client\query_engine-windows.dll.node (
  echo [SKIP] Prisma Client already exists.
) else (
  echo [SETUP] Generating Prisma Client...
  call npm run db:generate
  if errorlevel 1 goto :error
)

if /i "%~1"=="--skip-seed" (
  echo.
  echo [SKIP] Source seeding was skipped by --skip-seed.
) else (
  echo.
  echo [CHECK] Checking PostgreSQL on localhost:5432...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok = Test-NetConnection -ComputerName localhost -Port 5432 -InformationLevel Quiet; if ($ok) { exit 0 } else { exit 1 }" >nul 2>nul
  if not %errorlevel%==0 (
    echo [WARN] PostgreSQL is not reachable at localhost:5432.
    echo [WARN] Starting offline console mode. Data tables need the database.
    echo [TIP] Start PostgreSQL later, then refresh http://localhost:3001/collector.
  ) else (
    echo.
    echo [SETUP] Seeding collector sources: GitHub and skills.sh...
    call npm run collector:seed-sources
    if errorlevel 1 goto :error
  )
)

echo.
echo [START] Starting collector admin on port 3001...
echo [OPEN]  http://localhost:3001/collector
start "" "http://localhost:3001/collector"
echo.

call npm run collector:dev-ui
if errorlevel 1 goto :error

exit /b 0

:error
echo.
echo [FAILED] Startup failed. Please send the error text above to Codex.
pause
exit /b 1
