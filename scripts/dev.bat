@echo off
chcp 65001 >nul
title 灵墨小说工坊 - 开发模式
echo ============================================
echo   灵墨小说工坊 - 开发模式启动
echo ============================================
echo.

cd /d "%~dp0"
cd ..

where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 16+
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

if not exist node_modules (
    echo [1/2] 首次运行，安装依赖...
    echo 如果下载缓慢，请先运行: scripts\install.bat
    echo.
    call npm install
    if errorlevel 1 (
        echo   [警告] 依赖安装失败，请尝试运行 scripts\install.bat
        pause
        exit /b 1
    )
)

echo [2/2] 启动开发服务器...
echo   前端: http://localhost:5173
echo   后端: http://localhost:3001
echo   按 Ctrl+C 停止服务
echo.
npm run dev
echo.
echo 服务已停止。
pause
