@echo off
chcp 65001 >nul
title 灵墨小说工坊 - 打包 Windows EXE
echo ============================================
echo   灵墨小说工坊 - 打包 Windows EXE
echo ============================================
echo.
echo  修复说明 (基于截图 1 错误):
echo    - 移除 package.json build 字段 + electron-builder.yml
echo    - 单一配置源: electron/desktop-config.js
echo    - 禁止使用 npx electron-builder (避免 _npx 临时目录 EPERM)
echo    - 强制使用 node_modules/.bin/electron-builder
echo    - Electron 镜像 URL 精确拼接: mirror/v{version}/electron-v{version}-win-x64.zip
echo.

cd /d "%~dp0"
cd ..

set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_CACHE=%USERPROFILE%\.cache\electron-builder
set npm_config_electron_mirror=https://npmmirror.com/mirrors/electron/

echo [1/5] 依赖检查...
node scripts\ensure-deps.cjs
echo.

echo [2/5] 清理旧构建产物...
if exist dist (
    echo   删除 dist\
    rmdir /s /q dist
)
if exist release (
    echo   删除 release\
    rmdir /s /q release
)
echo.

echo [3/5] 构建前端...
call npx vite build
if errorlevel 1 (
    echo.
    echo   [错误] 前端构建失败
    pause
    exit /b 1
)
echo.

echo [4/5] 打包前环境验证...
node scripts\verify-desktop.cjs
if errorlevel 1 (
    echo.
    echo   [警告] 环境验证失败
    echo   诊断命令: node scripts\doctor.js
    echo   清理命令: node scripts\clean.js --deep
    pause
    exit /b 1
)
echo.

echo [5/5] 执行打包 (本地 electron-builder)...
echo   输出文件位于 release\ 目录
echo.
node scripts\run-electron-builder.cjs --win --x64
if errorlevel 1 (
    echo.
    echo   [警告] 打包失败
    echo.
    echo   诊断命令: node scripts\doctor.js
    echo   清理命令: node scripts\clean.js --deep
    echo   手动下载 Electron: node scripts\download-electron.cjs --win --x64
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   ✓ 打包完成！输出目录: release\
echo ============================================
echo.
pause
