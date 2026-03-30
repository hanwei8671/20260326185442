@echo off
chcp 65001 >nul
echo ========================================
echo   配置防火墙放行端口 3000
echo ========================================
echo.

:: 检查管理员权限
net session >nul 2>&1
if errorlevel 1 (
    echo [错误] 需要管理员权限！
    echo 请右键点击此脚本，选择"以管理员身份运行"
    pause
    exit /b 1
)

echo [1/2] 删除旧规则（如果存在）...
netsh advfirewall firewall delete rule name="MDR Server" >nul 2>&1

echo [2/2] 添加新规则...
netsh advfirewall firewall add rule name="MDR Server" dir=in action=allow protocol=tcp localport=3000 description="不良事件应用Web服务"

echo.
echo ========================================
echo   配置完成！
echo ========================================
echo.
echo 端口 3000 已放行，局域网设备可以访问了。
pause
