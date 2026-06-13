@echo off
echo ========================================
echo  灵墨小说工坊 - 开发模式启动
echo ========================================

echo.
echo 正在安装依赖...
call npm install

echo.
echo 正在启动开发服务器...
echo 前端: http://localhost:5173
echo 后端: http://localhost:3001
echo.

npm run dev
