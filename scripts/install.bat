@echo off
chcp 65001 >nul
title 灵墨小说工坊 - 依赖安装
echo ============================================
echo   灵墨小说工坊 - 依赖安装程序
echo ============================================
echo.

cd /d "%~dp0"
cd ..

echo [1/3] 检查 Node.js 版本...
where node >nul 2>nul
if errorlevel 1 (
    echo   [错误] 未检测到 Node.js，请先安装 Node.js 16+
    echo   下载地址: https://nodejs.org/
    pause
    exit /b 1
)
node -v
echo.

echo [2/3] 配置国内镜像（加速安装）...
npm config set registry https://registry.npmmirror.com
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
echo   完成.
echo.

echo [3/3] 安装项目依赖（首次可能需要 5-10 分钟）...
call npm install
if errorlevel 1 (
    echo.
    echo   [警告] 依赖安装部分失败，尝试清理缓存后重试...
    echo.
    pause
    exit /b 1
)
echo.

echo ============================================
echo   ✓ 依赖安装完成!
echo ============================================
echo.
echo   下一步可运行:
echo     - scripts\doctor.bat   （检查环境）
echo     - scripts\dev.bat      （启动开发服务器）
echo     - scripts\build.bat    （构建生产版本）
echo.
pause
