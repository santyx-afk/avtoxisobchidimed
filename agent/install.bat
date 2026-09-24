@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo ============================================================
echo   Dimed Salary - IVMS Agent o'rnatish
echo ============================================================
echo.

REM --- Python tekshirish ---
where python >nul 2>nul
if errorlevel 1 (
  echo [XATO] Python topilmadi.
  echo Python 3.9+ o'rnating: https://www.python.org/downloads/
  echo O'rnatishda "Add Python to PATH" ni belgilang.
  pause
  exit /b 1
)
echo [1/4] Python topildi.

REM --- Kutubxonalar ---
echo [2/4] Kutubxonalar o'rnatilmoqda...
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -r requirements.txt
if errorlevel 1 (
  echo [XATO] Kutubxonalar o'rnatilmadi. Internetni tekshiring.
  pause
  exit /b 1
)

REM --- Konfiguratsiya ---
if not exist config.json (
  copy config.example.json config.json >nul
  echo [3/4] config.json yaratildi. Uni to'ldiring...
  echo.
  echo >>> config.json faylini to'ldiring:
  echo     - supabase_url, supabase_anon_key, agent_email, agent_password
  echo     - watch_folder (IVMS-4200 export papkasi)
  echo.
  notepad config.json
) else (
  echo [3/4] config.json allaqachon mavjud.
)

REM --- Windows rejalashtiruvchi (har kuni 10:00 da) ---
echo [4/4] Avtomatik ishga tushirish sozlanmoqda...
for /f "delims=" %%p in ('where python') do set "PYEXE=%%p" & goto :gotpy
:gotpy
schtasks /Create /TN "DimedIVMSAgent" /TR "\"!PYEXE!\" \"%~dp0ivms_agent.py\"" /SC DAILY /ST 10:00 /F >nul 2>nul
if errorlevel 1 (
  echo [OGOHLANTIRISH] Rejalashtiruvchi sozlanmadi (administrator huquqi kerak bo'lishi mumkin).
  echo Qo'lda: install.bat ni "Run as administrator" bilan ishga tushiring.
) else (
  echo Rejalashtiruvchi sozlandi: har kuni 10:00 da tekshiradi.
)

echo.
echo ============================================================
echo   Tayyor! Sinov uchun: run_agent.bat ni ishga tushiring.
echo ============================================================
pause
