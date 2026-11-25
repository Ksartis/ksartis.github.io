@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  Запускаю сайт ksartis...
echo  Сайт:    http://localhost:8080
echo  Админка: http://localhost:8080/admin
echo.
echo  Не закрывайте это окно, пока работаете с сайтом.
echo.
start "" http://localhost:8080
node server\server.js
pause
