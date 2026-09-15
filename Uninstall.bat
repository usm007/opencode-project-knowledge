@echo off
rem One-click uninstaller for opencode-project-knowledge (Windows).
rem How to use: double-click this file. Only files installed by this package
rem are removed; unrelated OpenCode configuration is preserved.
rem Optional args (e.g. -ConfigDir DIR -DryRun) are passed to uninstall.ps1;
rem when any arg is given the window does NOT pause at the end (for scripts).
setlocal
title OpenCode Project Knowledge - Uninstall
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1" %*
set UNINSTALL_CODE=%ERRORLEVEL%
echo.
if %UNINSTALL_CODE%==0 (
  echo Done. Unrelated OpenCode/Antigravity configuration was preserved.
) else (
  echo FAILED with exit code %UNINSTALL_CODE%. See the messages above.
)
if "%~1"=="" pause
exit /b %UNINSTALL_CODE%
