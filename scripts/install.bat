@echo off
chcp 65001 >nul
title 灵墨小说工坊 - 依赖安装
echo ============================================
echo   灵墨小说工坊 - 依赖安装
echo ============================================
echo.

cd /d "%~dp0"
cd ..

echo [1/3] 环境检测...
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

echo [2/3] 配置国内镜像 (加速下载)...
npm config set registry https://registry.npmmirror.com >nul 2>&1
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_CACHE=%USERPROFILE%\.cache\electron-builder
set npm_config_electron_mirror=https://npmmirror.com/mirrors/electron/
echo   npm registry: https://registry.npmmirror.com
echo   Electron 镜像: %ELECTRON_MIRROR%
echo.

echo [3/3] 安装依赖 (npm install --legacy-peer-deps)...
echo   这可能需要 3-10 分钟，首次下载 Electron 约 150MB
echo.
echo   如遇 EPERM/文件被占用错误，请:
echo     1. 关闭 VS Code / 文件管理器
echo     2. 临时关闭杀毒软件
echo     3. 以管理员身份运行本脚本
echo.

call npm install --legacy-peer-deps --no-audit --no-fund

if errorlevel 1 (
    echo.
    echo   [警告] 安装过程出现警告 (通常是 npm EPERM 文件锁)
    echo.
    echo   可尝试以下步骤:
    echo     scripts\clean.bat
    echo     scripts\install.bat
    echo.
) else (
    echo.
    echo ============================================
    echo   ✓ 依赖安装完成！
    echo ============================================
    echo.
    echo   下一步:
    echo     scripts\dev.bat     启动开发服务器
    echo     scripts\build.bat   构建前端
    echo     scripts\pack.bat    打包 Windows EXE
)

echo.
pause
