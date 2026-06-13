@echo off
echo ========================================
echo  灵墨小说工坊 - 生产构建
echo ========================================

echo.
echo 正在安装依赖...
call npm install

echo.
echo 正在构建前端...
call npm run build

echo.
echo 构建完成！
echo.
pause
