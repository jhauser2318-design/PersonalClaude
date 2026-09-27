@echo off
REM ------------------------------------------------------------------
REM  Life Control Center - one-time setup. Double-click this file.
REM  It installs everything and puts an icon on your Desktop.
REM ------------------------------------------------------------------
title Life Control Center - setup
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1"
if errorlevel 1 pause
