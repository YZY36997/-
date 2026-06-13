@echo off
chcp 65001 >nul
title 灵墨小说工坊 - 打包 Windows EXE
echo ============================================
echo   灵墨小说工坊 - Windows EXE 打包
echo ============================================
echo.
echo   注意: 本脚本需在 Windows 环境运行
echo   首次运行会下载 Electron (约 150MB)
echo.

cd /d "%~dp0"
cd ..

REM === Electron 下载国内镜像（解决 404/超时问题）===
echo [配置] 设置 Electron 国内镜像...
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_CACHE=%USERPROFILE%\.electron-builder-cache
set npm_config_electron_mirror=https://npmmirror.com/mirrors/electron/
echo   ✓ 已配置
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 16+
    echo 下载: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo   ✓ Node.js:
node -v
echo.

if not exist node_modules (
    echo [1/4] 首次运行，安装依赖...
    echo   使用国内镜像加速...
    npm config set registry https://registry.npmmirror.com >nul 2>&1
    call npm install --legacy-peer-deps
    if errorlevel 1 (
        echo   [错误] 依赖安装失败，请检查网络
        echo   如出现权限错误，请尝试以管理员身份运行
        pause
        exit /b 1
    )
)

echo.
echo [2/4] 清理旧构建产物...
if exist dist (
    echo   删除 dist\...
    rmdir /s /q dist
)
if exist release (
    echo   删除 release\...
    rmdir /s /q release
)

echo.
echo [3/4] 构建前端...
call npx vite build
if errorlevel 1 (
    echo.
    echo   [错误] 前端构建失败
    pause
    exit /b 1
)

echo.
echo [4/4] 打包为 Windows EXE...
echo   这可能需要 5-15 分钟，首次会下载 Electron...
echo   生成的文件将保存在 release\ 目录
echo.
call npx electron-builder --win --x64
if errorlevel 1 (
    echo.
    echo   [警告] 如遇到下载失败，请重试
    echo   如出现权限错误，请以管理员身份运行
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   ✓ 打包完成！输出目录: release\
echo ============================================
echo.
echo 包含文件:
echo   - 安装版: 灵墨小说工坊 Setup x.x.x.exe
echo   - 便携版: 灵墨小说工坊 x.x.x.exe
echo.
pause
