@echo off
chcp 65001 >nul
title 灵墨小说工坊 - 前端构建
echo ============================================
echo   灵墨小说工坊 - 前端构建
echo ============================================
echo.

cd /d "%~dp0"
cd ..

echo [1/3] 依赖检查...
node scripts\ensure-deps.cjs
echo.

echo [2/3] 清理旧构建...
if exist dist (
    echo   删除 dist\
    rmdir /s /q dist
)
if exist release (
    echo   删除 release\
    rmdir /s /q release
)
echo.

echo [3/3] 执行 Vite 构建...
call npx vite build
if errorlevel 1 (
    echo.
    echo   [错误] 前端构建失败，请查看上方错误信息
    pause
    exit /b 1
)

echo.
echo ============================================
echo   ✓ 构建完成！输出目录: dist\
echo ============================================
echo.
echo  可选下一步:
echo    scripts\pack.bat    打包为 Windows EXE
echo.
pause
