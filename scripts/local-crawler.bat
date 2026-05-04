@echo off
chcp 65001 >nul
echo ==========================================
echo   AI工具导航站 - 本地数据自动抓取
echo   %date% %time%
echo ==========================================
echo.

cd /d "C:\Users\Lenovo\WorkBuddy\20260407193651"

echo [1/2] 正在抓取最新AI工具...
npm run crawl:latest

echo.
echo [2/2] 正在抓取AI资讯...
npm run crawl:rss

echo.
echo ==========================================
echo   抓取完成！
echo   %date% %time%
echo ==========================================

pause
