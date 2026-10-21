@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-dream-skin.ps1"
if errorlevel 1 (
  pause
  exit /b 1
)
if exist "%~dp0xskin.exe" start "" "%~dp0xskin.exe"
