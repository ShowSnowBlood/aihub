@echo off
cd /d "c:\Users\Lenovo\WorkBuddy\20260407193651"
echo Current directory: %CD%
echo Starting RSS fetch...
node_modules\.bin\tsx.cmd scripts/fetch-rss.ts
echo Exit code: %ERRORLEVEL%
pause
