@echo off
echo ========================================
echo  灵墨小说工坊 - Electron 打包
echo ========================================

echo.
echo 正在安装依赖...
call npm install

echo.
echo 正在构建前端...
call npm run build

echo.
echo 正在打包 Electron 应用...
call npx electron-builder --win --config electron-builder.yml

echo.
echo 打包完成！
echo 输出目录: release\
echo.
pause
