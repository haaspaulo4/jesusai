# PowerShell script to start all MetaPersona.AI / Jesus.ai services in separate Cmder windows

Clear-Host
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ">>> Iniciando Servicos do MetaPersona.AI / Jesus.ai <<<" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Iniciar o Servidor de Voz TTS Kokoro
Write-Host "[1/3] TTS: Iniciando TTS Kokoro na porta 8001..." -ForegroundColor Green
Start-Process "C:\laragon\bin\cmder\vendor\conemu-maximus5\ConEmu64.exe" -ArgumentList "-Dir `"c:\laragon\www\jesus.ai`"", "-cmd cmd /k `"C:\laragon\bin\cmder\vendor\init.bat && npm run tts:start`"" -WindowStyle Normal

# 2. Iniciar o Servidor de Transcricao STT Whisper
Write-Host "[2/3] STT: Iniciando STT Whisper na porta 9000..." -ForegroundColor Green
Start-Process "C:\laragon\bin\cmder\vendor\conemu-maximus5\ConEmu64.exe" -ArgumentList "-Dir `"c:\laragon\www\jesus.ai`"", "-cmd cmd /k `"C:\laragon\bin\cmder\vendor\init.bat && npm run whisper:start`"" -WindowStyle Normal

# Aguarda alguns segundos para os servidores locais de IA iniciarem antes do backend
Write-Host "Aguardando 3 segundos para estabilizacao dos motores de IA..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# 3. Iniciar o Servidor Backend (Node.js dev)
Write-Host "[3/3] Backend: Iniciando Servidor Backend (Node.js dev) na porta 3000..." -ForegroundColor Green
Start-Process "C:\laragon\bin\cmder\vendor\conemu-maximus5\ConEmu64.exe" -ArgumentList "-Dir `"c:\laragon\www\jesus.ai`"", "-cmd cmd /k `"C:\laragon\bin\cmder\vendor\init.bat && npm run dev`"" -WindowStyle Normal

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "!!! Todos os processos foram disparados em novas janelas do Cmder !!!" -ForegroundColor Cyan
Write-Host "Voce pode monitorar os logs de cada servico individualmente." -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Cyan

