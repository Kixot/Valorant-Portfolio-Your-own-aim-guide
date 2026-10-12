@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\preview.ps1"
if errorlevel 1 pause
