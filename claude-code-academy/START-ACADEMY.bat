@echo off
REM ------------------------------------------------------------------
REM  Claude Code Academy - double-click to start the app.
REM  First run installs what it needs (1-2 minutes).
REM ------------------------------------------------------------------
title Claude Code Academy
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is needed to run Claude Code Academy. Installing it now...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  echo.
  echo Node.js installed. Close this window and double-click START-ACADEMY.bat again.
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo First run: installing the app. This takes a minute or two...
  call npm install
  if errorlevel 1 (
    echo Install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

start "" "node_modules\electron\dist\electron.exe" .
