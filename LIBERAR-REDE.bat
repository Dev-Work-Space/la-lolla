@echo off
chcp 65001 >nul
title LaLolla - liberar a porta 3000 na rede interna

REM Roda UMA VEZ so, com botao direito > "Executar como administrador".
REM Sem isso o Windows barra o celular: o app sobe, o PC abre normal, e o
REM celular fica carregando para sempre sem dizer o motivo.

net session >nul 2>&1
if errorlevel 1 (
  echo.
  echo   [!] Precisa ser administrador.
  echo       Feche, clique com o botao direito neste arquivo
  echo       e escolha "Executar como administrador".
  echo.
  pause
  exit /b 1
)

echo.
echo   Liberando a porta 3000 para a rede local...
echo.

REM RemoteAddress=LocalSubnet limita a quem esta na mesma rede. Nada fica
REM exposto para a internet.
powershell -NoProfile -Command ^
  "Remove-NetFirewallRule -DisplayName 'LaLolla 3000' -ErrorAction SilentlyContinue; ^
   New-NetFirewallRule -DisplayName 'LaLolla 3000' -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Domain,Private -RemoteAddress LocalSubnet | Out-Null; ^
   Write-Host '   Pronto. Regra criada (somente rede local).'"

echo.
echo   Pode fechar. Agora e so usar o INICIAR.bat.
echo.
pause
