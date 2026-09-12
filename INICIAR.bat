@echo off
chcp 65001 >nul
cd /d "%~dp0"
title LaLolla (novo) - servidor de teste

REM Descobre o IP desta maquina na hora, em vez de deixar fixo no arquivo.
REM O PC antigo tinha 10.20.40.200 escrito aqui dentro; quando o app mudou de
REM maquina, a tela continuou mostrando o endereco errado e o celular nao abria.
set "IP="
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4" ^| findstr /v "169.254"') do (
  if not defined IP set "IP=%%a"
)
set "IP=%IP: =%"
if not defined IP set "IP=(sem rede)"

echo.
echo   ============================================
echo    LaLolla · versao nova (Next.js)
echo   ============================================
echo.
echo    No PC ........ http://localhost:3000
echo    No celular ... http://%IP%:3000
echo.
echo    Entrar com:   teste  /  Teste@2026!
echo.
echo    Rede INTERNA apenas. Nao esta publicado na
echo    internet - so quem esta no mesmo wi-fi abre.
echo.
echo    Para parar: feche esta janela ou Ctrl+C
echo   ============================================
echo.

REM Confere se as dependencias existem. Sem isso o npm cospe um erro
REM enorme que nao diz o que fazer.
if not exist "node_modules" (
  echo   [!] Falta instalar as dependencias.
  echo       Rode uma vez:  npm install
  echo.
  pause
  exit /b 1
)

REM -H 0.0.0.0 faz o servidor aceitar conexao da rede local, que e o que
REM permite abrir no celular. O IP precisa estar em allowedDevOrigins no
REM next.config.ts, senao a tela abre e nenhum botao funciona.
call npm run dev -- -H 0.0.0.0 -p 3000

echo.
echo   O servidor parou. Pressione uma tecla para fechar.
pause >nul
