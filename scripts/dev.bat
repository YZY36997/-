@echo off
chcp 65001 >nul
title 灵墨小说工坊 - 开发模式
echo ============================================
echo   灵墨小说工坊 - 开发模式
echo ============================================
echo.

cd /d "%~dp0"
cd ..

echo [1/3] 检查 Node.js 环境...
where node >nul 2>nul
if errorlevel 1 (
    echo   [错误] 未检测到 Node.js，请先安装 Node.js 16+
    echo   下载地址: https://nodejs.org/
    echo.
    pause
    exit /b 1
)
echo   ✓ Node.js 版本:
node -v
echo.

echo [2/3] 检查项目依赖...
if not exist node_modules (
    echo   依赖未安装，开始安装...
    echo   使用国内镜像加速下载...
    npm config set registry https://registry.npmmirror.com >nul 2>&1
    call npm install --legacy-peer-deps
    if errorlevel 1 (
        echo   [警告] 安装过程有错误，请查看上方日志
    )
) else (
    echo   ✓ node_modules 已存在
)
echo.

echo [3/3] 启动开发服务器...
echo   前端地址: http://localhost:5173
echo   后端 API: http://localhost:3001
echo   按 Ctrl+C 停止服务
echo.
echo ============================================
echo.

npx concurrently -n "client,server" -c "yellow,blue" "npx vite" "node scripts/dev-server.js"
if errorlevel 1 (
    echo.
    echo [提示] 如遇到 "command not found" 错误，请先运行: scripts\install.bat
)
echo.
echo 服务已停止。
pause
