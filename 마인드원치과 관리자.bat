@echo off
chcp 65001 >nul
title 마인드원치과 백업 사이트 관리자
cd /d "%~dp0"

echo.
echo   마인드원치과 백업 사이트 관리자를 시작합니다...
echo.

rem 이미 실행 중인지 확인 (포트 8811 사용 여부)
netstat -ano | findstr ":8811 " | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
  echo   이미 실행 중입니다. 관리자 창을 엽니다.
  start "" "http://localhost:8811/admin/"
  timeout /t 2 >nul
  exit /b
)

rem 서버 시작 (이 창이 서버 창이 됩니다)
start "" "http://localhost:8811/admin/"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\serve.ps1"

echo.
echo   관리자가 종료되었습니다. 이 창을 닫으셔도 됩니다.
pause >nul
