@echo off
chcp 65001 >nul
title 灵墨小说工坊 - 依赖安装
echo ============================================
echo   灵墨小说工坊 - 依赖安装
echo ============================================
echo.

cd /d "%~dp0"
cd ..

echo [1/2] 环境检测...
where node >nul 2>nul
if errorlevel 1 (
    echo   [错误] 未检测到 Node.js，请先安装 Node.js 16+
    echo   下载: https://nodejs.org/
    echo.
    pause
    exit /b 1
)
echo   Node.js 版本:
node -v
echo.

echo [2/2] 安装依赖 (使用国内镜像加速)...
echo   如遇权限错误，请关闭 VS Code/IDE 后重试
echo   或尝试以管理员身份运行
echo.

REM 设置 npm registry:
npm config set registry https://registry.npmmirror.com

REM 设置 Electron 下载镜像 (解决国内下载超时)
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_CACHE=%USERPROFILE%\.electron-builder-cache
set npm_config_electron_mirror=https://npmmirror.com/mirrors/electron/

echo.
echo   开始安装 (可能需要 5-15 分钟)...
echo.

call npm install --legacy-peer-deps

if errorlevel 1 (
    echo.
    echo   [警告] 安装过程出现警告/错误
    echo.
    echo   常见问题:
    echo     1. EPERM/权限不足 - 请以管理员身份运行
    echo     2. 网络超时 - 重新运行本脚本
    echo     3. 文件被锁定 - 关闭 IDE 后重试
    echo.
    echo   可执行 node scripts\doctor.js 查看详细诊断
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   ✓ 依赖安装完成
echo ============================================
echo.
echo   接下来可以执行:
echo     scripts\dev.bat     启动开发模式
echo     scripts\build.bat 构建前端
echo     scripts\pack.bat 打包 EXE
echo.
pause
