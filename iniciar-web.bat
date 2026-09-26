@echo off
setlocal
title PokeIdle Wiki - Servidor local
cd /d "%~dp0"

echo ============================================
echo   PokeIdle Wiki - comprobando actualizaciones
echo ============================================
echo.

if exist "sincronizar-pokeidle.ps1" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0sincronizar-pokeidle.ps1"
) else (
  echo [AVISO] No encuentro sincronizar-pokeidle.ps1. Se usara la version local.
)

:start_game
echo.
echo ============================================
echo   PokeIdle Wiki - arrancando la web
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] No tienes Node.js instalado.
  echo Descargalo desde https://nodejs.org ^(version 20.19 o superior^) e intentalo de nuevo.
  echo.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo [ERROR] No encuentro package.json en esta carpeta.
  echo Copia este archivo .bat dentro de la carpeta del proyecto ^(donde esta package.json^).
  echo.
  pause
  exit /b 1
)

rem Reinstala si falta node_modules o si la actualizacion cambio package-lock.json.
set "NEED_INSTALL="
if not exist "node_modules" set "NEED_INSTALL=1"
set "LOCK_HASH=sin-lockfile"
if exist "package-lock.json" (
  for /f "usebackq delims=" %%h in (`powershell.exe -NoProfile -Command "(Get-FileHash -Algorithm SHA256 -LiteralPath 'package-lock.json').Hash"`) do set "LOCK_HASH=%%h"
)
set "SAVED_HASH="
if exist "node_modules\.pokeidle-lock-hash" set /p SAVED_HASH=<"node_modules\.pokeidle-lock-hash"
if not "%LOCK_HASH%"=="%SAVED_HASH%" set "NEED_INSTALL=1"

if defined NEED_INSTALL (
  echo Instalando dependencias ^(la primera vez o tras una actualizacion, puede tardar unos minutos^)...
  if exist "package-lock.json" (
    call npm ci --legacy-peer-deps
  ) else (
    call npm install --legacy-peer-deps
  )
  if errorlevel 1 (
    echo.
    echo [ERROR] Fallo la instalacion de dependencias. Revisa el mensaje de arriba.
    pause
    exit /b 1
  )
  >"node_modules\.pokeidle-lock-hash" echo %LOCK_HASH%
)

echo.
echo Iniciando servidor en http://localhost:3000
echo Deja esta ventana abierta mientras uses la web. Cierra con Ctrl+C.
echo.

start "" /b cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:3000"
call npm run dev

echo.
pause
