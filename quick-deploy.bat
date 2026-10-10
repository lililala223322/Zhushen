@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "PORT=%~1"
if "%PORT%"=="" set "PORT=8878"

echo [1/6] Checking Node.js and npm...
where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm was not found. Please install Node.js first.
  goto fail
)

echo [2/6] Installing dependencies...
call npm install
if errorlevel 1 goto fail

echo [3/6] Building browser core bundle...
call npm run web:core
if errorlevel 1 goto fail

echo [4/6] Running core checks...
call npm run core:typecheck
if errorlevel 1 goto fail
call npm run core:test
if errorlevel 1 goto fail

echo [5/6] Verifying web runtime...
call npm run verify:web-core
if errorlevel 1 goto fail

echo [6/6] Starting local web server...
where python >nul 2>nul
if not errorlevel 1 (
  set "PYTHON_CMD=python"
) else (
  where py >nul 2>nul
  if errorlevel 1 (
    echo ERROR: Python was not found. Please install Python or run another static file server for the web folder.
    goto fail
  )
  set "PYTHON_CMD=py -3"
)

echo.
echo Local preview: http://127.0.0.1:%PORT%/
echo Press Ctrl+C in this window to stop the server.
echo.
start "" "http://127.0.0.1:%PORT%/"
cd /d "%~dp0web"
%PYTHON_CMD% -m http.server %PORT% --bind 127.0.0.1
goto end

:fail
echo.
echo Deployment failed. Check the error above.
pause
exit /b 1

:end
endlocal
