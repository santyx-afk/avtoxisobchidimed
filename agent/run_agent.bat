@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo IVMS Agent darhol ishga tushirilmoqda (--now)...
python ivms_agent.py --now
echo.
pause
