@echo off
chcp 65001 >nul
title 灵墨小说工坊 - 开发模式
echo ============================================
echo   灵墨小说工坊 - 开发模式
echo ============================================
echo.

cd /d "%~dp0"
cd ..

REM === Electron 国内镜像 (解决下载超时) ===
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_CACHE=%USERPROFILE%\.electron-builder-cache

echo [1/3] 检查 Node.js...
where node >nul 2>nul
if errorlevel 1 (
    echo   [错误] 未检测到 Node.js，请先安装 Node.js 16+
    echo   下载地址: https://nodejs.org/
    echo.
    pause
    exit /b 1
)
echo   Node.js 版本:
node -v
echo.

echo [2/3] 依赖检查...
node scripts\ensure-deps.cjs
if errorlevel 1 (
    echo.
    echo   [警告] 依赖检查发现问题，如关键依赖缺失会自动尝试安装
    echo.
)

echo.
echo [3/3] 启动开发服务器 (前端 Vite + 后端 API)...
echo   前端: http://localhost:5173
echo   后端: http://localhost:3001
echo   按 Ctrl+C 停止
echo.
echo ============================================
echo.

REM 同时启动 Vite (前端) + dev-server (后端)
npx concurrently -n "CLIENT,SERVER" -c "yellow,blue" "npx vite" "node scripts/dev-server.js"

if errorlevel 1 (
    echo.
    echo [提示] 如遇命令未找到，请确保 npx 可用，或运行:
    echo   scripts\install.bat
    echo.
)
echo.
echo 服务已停止。
pause
