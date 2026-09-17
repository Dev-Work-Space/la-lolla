@echo off
chcp 65001 >nul
cd /d "%~dp0"
title LaLolla - atualizar o banco de dados

REM Aplica as atualizacoes de estrutura do banco que ainda nao foram
REM aplicadas. E o passo que o assistente NAO da sozinho: mexer no banco e
REM ordem do Joao, entao a decisao fica aqui, com dois cliques.
REM
REM "Atualizar" aqui e ACRESCENTAR: colunas e tabelas novas. Nao troca de
REM banco, nao apaga dado, nao mexe no que ja esta gravado. Cada atualizacao
REM mora num arquivo em prisma\migrations e so roda uma vez - clicar de novo
REM depois de pronto nao faz nada.
REM
REM Depois de atualizar o servidor PRECISA subir de novo: o que ja estava no
REM ar continua com o modelo antigo na memoria, e as telas vem vazias sem
REM dizer o motivo. Por isso este arquivo chama o INICIAR.bat no fim.

echo.
echo   ============================================
echo    LaLolla - atualizar o banco de dados
echo   ============================================
echo.
echo    Acrescenta ao banco as colunas e tabelas
echo    que as telas novas precisam.
echo.
echo    NAO apaga nada. NAO troca de banco.
echo    O que ja esta gravado continua igual.
echo.
echo    Se ja estiver tudo aplicado, ele avisa e
echo    nao faz nada.
echo.
echo   --------------------------------------------
echo    Para CONTINUAR:  aperte qualquer tecla
echo    Para CANCELAR :  feche esta janela
echo   --------------------------------------------
echo.
pause >nul

if not exist "node_modules" (
  echo   [!] Falta instalar as dependencias.
  echo       Rode uma vez:  npm install
  echo.
  pause
  exit /b 1
)

if not exist ".env" (
  echo   [!] Nao achei o arquivo .env, que tem o endereco do banco.
  echo.
  pause
  exit /b 1
)

echo.
echo   Atualizando o banco...
echo.
call npx prisma migrate deploy
if errorlevel 1 (
  echo.
  echo   [!] A atualizacao FALHOU. O banco nao fica pela metade:
  echo       a atualizacao que der erro e desfeita inteira.
  echo.
  echo       Manda o texto vermelho acima para o assistente.
  echo.
  pause
  exit /b 1
)

echo.
echo   Gerando o codigo que conversa com o banco...
echo.
call npx prisma generate
if errorlevel 1 (
  echo.
  echo   [!] O banco foi atualizado, mas a geracao do codigo falhou.
  echo       Rode na mao:  npx prisma generate
  echo.
  pause
  exit /b 1
)

echo.
echo   ============================================
echo    Pronto. Banco atualizado.
echo   ============================================
echo.
echo   Abrindo o app em seguida...
echo.
ping -n 4 127.0.0.1 >nul

start "" "%~dp0INICIAR.bat"
