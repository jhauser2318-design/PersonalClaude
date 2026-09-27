@echo off
REM ------------------------------------------------------------------
REM  Life Control Center - starts the app and opens it in your browser.
REM  (The Desktop icon made by INSTALL.bat runs this file.)
REM ------------------------------------------------------------------
cd /d "%~dp0"
title Life Control Center - keep this window open (closing it stops the app)

REM Already running? Then just open it in the browser.
curl.exe -s -o nul http://localhost:8000/api/areas >nul 2>&1
if not errorlevel 1 (
    start "" http://localhost:8000
    exit /b 0
)

if not exist ".venv\Scripts\python.exe" (
    echo First run: creating a private Python environment. This takes a minute...
    py -m venv .venv 2>nul || python -m venv .venv
    if errorlevel 1 (
        echo.
        echo Could not find Python. Double-click INSTALL.bat to set everything up.
        pause
        exit /b 1
    )
    call ".venv\Scripts\activate.bat"
    python -m pip install --quiet --disable-pip-version-check -r requirements.txt
) else (
    call ".venv\Scripts\activate.bat"
)

if not exist ".env" (
    copy ".env.example" ".env" >nul
    echo Created a .env file. Run INSTALL.bat or open .env in Notepad to add your API key.
)

REM Open the browser in a few seconds, once the app has started.
start "" /min cmd /c "ping -n 5 127.0.0.1 >nul & start http://localhost:8000"

echo.
echo  Life Control Center is running at http://localhost:8000
echo  Keep this window open while you use the app. Close it to stop the app.
echo.
python -m uvicorn backend.main:app --port 8000
if errorlevel 1 pause
