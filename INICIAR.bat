@echo off
chcp 65001 >nul
cd /d "%~dp0"
title LaLolla (novo) - servidor de teste

echo.
echo   ============================================
echo    LaLolla · versao nova (Next.js)
echo   ============================================
echo.
echo    No PC ........ http://localhost:3000
echo    No celular ... http://10.20.40.200:3000
echo.
echo    Entrar com:   teste  /  Teste@2026!
echo.
echo    Para parar: feche esta janela ou Ctrl+C
echo   ============================================
echo.

REM -H 0.0.0.0 faz o servidor aceitar conexao da rede local,
REM que e o que permite abrir no celular. Sem isso, so no proprio PC.
call npm run dev -- -H 0.0.0.0 -p 3000

echo.
echo   O servidor parou. Pressione uma tecla para fechar.
pause >nul
