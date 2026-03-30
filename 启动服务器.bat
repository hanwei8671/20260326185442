@echo off
chcp 65001 >nul 2>&1
title MDR Agent - 竞品不良事件监控系统
echo ============================================
echo   竞品医疗器械不良事件监控系统
echo ============================================
echo.

:: 检查 Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

:: 获取本机局域网 IP
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set IP=%%a
)
set IP=%IP: =%

echo [信息] 本机地址: http://%IP%:3000
echo [信息] 局域网其他电脑请打开上述地址访问
echo [信息] 按 Ctrl+C 可停止服务器
echo.
echo --------------------------------------------
echo   启动中，请稍候...
echo --------------------------------------------
echo.

cd /d "%~dp0"
node server.js

pause
