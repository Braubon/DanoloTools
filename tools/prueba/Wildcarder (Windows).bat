@echo off
title Wildcarder
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\server.ps1"
if errorlevel 1 (
  where python >nul 2>nul && python "%~dp0server\server.py"
  pause
)
