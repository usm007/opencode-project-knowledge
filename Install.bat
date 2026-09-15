@echo off
rem One-click installer for opencode-project-knowledge (Windows).
rem How to use: double-click this file. No admin rights needed (per-user install).
rem Optional args (e.g. -ConfigDir DIR -DryRun) are passed to install.ps1;
rem when any arg is given the window does NOT pause at the end (for scripts).
setlocal
title OpenCode Project Knowledge - Install
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
set INSTALL_CODE=%ERRORLEVEL%
echo.
if %INSTALL_CODE%==0 (
  echo SUCCESS: installed for OpenCode + Antigravity. Open any repository to use it.
) else (
  echo FAILED with exit code %INSTALL_CODE%. See the messages above.
)
if "%~1"=="" pause
exit /b %INSTALL_CODE%
