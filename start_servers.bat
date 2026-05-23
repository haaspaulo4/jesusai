@echo off
cls
echo ==========================================================
echo === Iniciando Servicos do MetaPersona.AI / Jesus.ai ===
echo ==========================================================

echo [1/3] TTS: Iniciando TTS Kokoro na porta 8001...
start "" "C:\laragon\bin\cmder\vendor\conemu-maximus5\ConEmu64.exe" -Dir "c:\laragon\www\jesus.ai" -cmd cmd /k "C:\laragon\bin\cmder\vendor\init.bat && npm run tts:start"

echo [2/3] STT: Iniciando STT Whisper na porta 9000...
start "" "C:\laragon\bin\cmder\vendor\conemu-maximus5\ConEmu64.exe" -Dir "c:\laragon\www\jesus.ai" -cmd cmd /k "C:\laragon\bin\cmder\vendor\init.bat && npm run whisper:start"

echo Aguardando 3 segundos para estabilizacao dos motores de IA...
ping 127.0.0.1 -n 4 > nul

echo [3/3] Backend: Iniciando Servidor Backend (Node.js dev) na porta 3000...
start "" "C:\laragon\bin\cmder\vendor\conemu-maximus5\ConEmu64.exe" -Dir "c:\laragon\www\jesus.ai" -cmd cmd /k "C:\laragon\bin\cmder\vendor\init.bat && npm run dev"

echo ==========================================================
echo !!! Todos os processos foram disparados em novas janelas do Cmder !!!
echo Voce pode monitorar os logs de cada servico de forma independente.
echo ==========================================================
