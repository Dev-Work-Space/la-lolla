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

REM -Profile Any (e nao "Domain,Private", como estava antes).
REM
REM O Windows classificou a rede da loja como PUBLICA - acontece sozinho em
REM rede por cabo e em wi-fi onde ninguem respondeu "permitir que este PC seja
REM descoberto". Com a regra limitada a Domain,Private ela simplesmente nao
REM valia nessa rede: o comando dizia "Pronto", a regra aparecia no firewall,
REM e o celular continuava sem abrir. Uma hora perdida atras de nada.
REM
REM Quem segura a seguranca aqui e o RemoteAddress=LocalSubnet: so quem esta
REM na MESMA rede alcanca a porta. Nada fica exposto para a internet, seja
REM qual for o perfil da rede.
powershell -NoProfile -Command ^
  "Remove-NetFirewallRule -DisplayName 'LaLolla 3000' -ErrorAction SilentlyContinue; ^
   New-NetFirewallRule -DisplayName 'LaLolla 3000' -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Any -RemoteAddress LocalSubnet | Out-Null; ^
   Write-Host '   Pronto. Regra criada (somente rede local).'; ^
   Write-Host ''; ^
   Write-Host '   Enderecos para abrir no celular:'; ^
   Get-NetIPAddress -AddressFamily IPv4 ^| Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } ^| ForEach-Object { Write-Host ('      http://' + $_.IPAddress + ':3000   (' + $_.InterfaceAlias + ')') }"

echo.
echo   Se o celular ainda nao abrir, confira se o IP acima esta na lista
echo   allowedDevOrigins do next.config.ts - sem isso a tela abre mas
echo   nenhum botao funciona.
echo.
pause
