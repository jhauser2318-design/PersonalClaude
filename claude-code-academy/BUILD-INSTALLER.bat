@echo off
REM Builds a normal Windows installer: dist\Claude Code Academy Setup <version>.exe
title Build Claude Code Academy installer
cd /d "%~dp0"
call npm install || (pause & exit /b 1)
call npm run check || (pause & exit /b 1)
call npm run dist || (pause & exit /b 1)
echo.
echo Done! Your installer is in the "dist" folder.
explorer dist
pause
