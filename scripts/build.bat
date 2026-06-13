@echo off
chcp 65001 >nul
title 灵墨小说工坊 - 生产构建
echo ============================================
echo   灵墨小说工坊 - 生产构建
echo ============================================
echo.

cd /d "%~dp0"
cd ..

where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 16+
    pause
    exit /b 1
)

if not exist node_modules (
    echo [1/3] 首次运行，安装依赖...
    call npm install
    if errorlevel 1 (
        echo   [错误] 依赖安装失败
        pause
        exit /b 1
    )
)

echo.
echo [2/3] 构建前端 (Vite)...
call npm run build
if errorlevel 1 (
    echo   [错误] 前端构建失败
    pause
    exit /b 1
)

echo.
echo ============================================
echo   ✓ 构建完成！
echo   输出目录: dist\
echo ============================================
echo.
echo 如需打包为 Windows EXE，请运行:
echo   scripts\pack.bat
echo.
pause
