@echo off
chcp 65001 >nul
title 灵墨小说工坊 - 构建前端
echo ============================================
echo   灵墨小说工坊 - 前端构建
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
    call npm install --legacy-peer-deps
    if errorlevel 1 (
        echo   [错误] 依赖安装失败
        pause
        exit /b 1
    )
)

echo.
echo [2/3] 清理旧构建产物...
if exist dist (
    echo   删除 dist 目录...
    rmdir /s /q dist
)

echo.
echo [3/3] 执行 Vite 构建...
call npx vite build
if errorlevel 1 (
    echo.
    echo [错误] 前端构建失败
    pause
    exit /b 1
)

echo.
echo ============================================
echo   ✓ 构建完成！输出目录: dist\
echo ============================================
echo.
echo 可选下一步:
echo   scripts\pack.bat      打包为 Windows EXE
echo.
pause
