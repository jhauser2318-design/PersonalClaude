@echo off
REM ------------------------------------------------------------------
REM  Life Control Center - Windows launcher. Double-click to start.
REM ------------------------------------------------------------------
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo First run: creating a private Python environment. This takes a minute...
    py -m venv .venv 2>nul || python -m venv .venv
    if errorlevel 1 (
        echo.
        echo Could not find Python. Please install it first - see README step 1.
        pause
        exit /b 1
    )
)

call ".venv\Scripts\activate.bat"
echo Checking required packages...
python -m pip install --quiet --disable-pip-version-check -r requirements.txt

if not exist ".env" (
    copy ".env.example" ".env" >nul
    echo Created a .env file. Open it in Notepad and paste your API key - see README step 3.
)

REM Open the browser a few seconds from now, once the server is up.
start "" cmd /c "timeout /t 4 >nul & start http://localhost:8000"

python -m uvicorn backend.main:app --port 8000
pause
