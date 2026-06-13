@echo off
chcp 65001 >nul
title 灵墨小说工坊 - 打包 Windows EXE
echo ============================================
echo   灵墨小说工坊 - 打包 Windows EXE
echo ============================================
echo.
echo  注意:
echo    - 本脚本需在 Windows 环境运行
echo    - 首次运行会下载 Electron (约 150MB)
echo    - 如遇 EPERM 权限错误，请关闭 IDE/杀毒软件后重试
echo.

cd /d "%~dp0"
cd ..

REM === 关键环境变量 (解决 electron-builder 版本检测问题) ===
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_CACHE=%USERPROFILE%\.electron-builder-cache
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
    echo   [警告] 环境验证失败，请先修复上述问题
    echo   诊断命令: node scripts\doctor.js
    echo   清理命令: node scripts\clean.js --deep
    pause
    exit /b 1
)
echo.

echo [5/5] 使用智能脚本打包 (多镜像探测 + app-builder 修复)...
echo   这可能需要 3-15 分钟 (首次会下载 Electron)
echo   输出文件将位于 release\ 目录
echo   如遇 Electron 404/下载失败，将自动尝试其他镜像
echo.
node scripts\run-electron-builder.cjs --win --x64
if errorlevel 1 (
    echo.
    echo   [警告] 打包过程出现错误
    echo.
    echo   常见错误及解决:
    echo     1. EPERM/文件被锁定 - 请关闭 VS Code/资源管理器后重试
    echo     2. Electron 下载失败 - 请执行: node scripts\download-electron.cjs
    echo     3. 版本未固定 - 运行: node scripts\doctor.js 检查
    echo     4. app-builder.exe 损坏 - 脚本会自动尝试修复
    echo.
    echo   诊断命令: node scripts\doctor.js
    echo   清理命令: node scripts\clean.js --deep
    echo   手动下载: node scripts\download-electron.cjs
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   ✓ 打包完成！输出目录: release\
echo ============================================
echo.
echo  包含文件:
echo    - 灵墨小说工坊 Setup x.x.x.exe    (安装版)
echo    - 灵墨小说工坊 x.x.x.exe           (便携版)
echo.
echo  双击安装版即可安装，便携版可直接运行
echo.
pause
