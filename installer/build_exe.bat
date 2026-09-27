@echo off
REM ============================================================
REM  小红书采集工作台 —— exe 安装包重建脚本
REM  依赖：本机 Python venv（含 PyInstaller）
REM  产出：dist\xhs-collector-setup.exe  (单文件，自包含，目标机无需 Python)
REM ============================================================
setlocal
set PY="C:\Users\gaore\.workbuddy-ai\binaries\python\envs\default\Scripts\python.exe"

%PY% -m PyInstaller --noconfirm --onefile ^
  --name xhs-collector-setup ^
  --add-data "xhs-collector.crx;." ^
  --add-data "xhs-collector.pem;." ^
  --add-data "xhs-collector-v1.0.0.tar.gz;." ^
  install.py

echo.
echo 构建完成：dist\xhs-collector-setup.exe
endlocal
