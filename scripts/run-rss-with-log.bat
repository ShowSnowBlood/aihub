@echo off
cd /d "c:\Users\Lenovo\WorkBuddy\20260407193651"
echo === RSS资讯自动抓取 === > scripts\fetch-rss-output.log
echo 开始时间: %date% %time% >> scripts\fetch-rss-output.log
echo. >> scripts\fetch-rss-output.log
"C:\nvm4w\nodejs\node.exe" node_modules\tsx\dist\cli.mjs scripts/fetch-rss.ts >> scripts\fetch-rss-output.log 2>&1
echo. >> scripts\fetch-rss-output.log
echo 结束时间: %date% %time% >> scripts\fetch-rss-output.log
echo Exit code: %ERRORLEVEL% >> scripts\fetch-rss-output.log
