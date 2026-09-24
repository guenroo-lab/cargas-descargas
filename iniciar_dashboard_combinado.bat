@echo off
title Dashboard Combinado TAISA - Arrancando...

set PS1=%TEMP%\taisa_keepalive_combo.ps1
set LOG=%TEMP%\taisa_keepalive_combo.log

rem === Cierra cualquier Chrome ya abierto: si queda uno corriendo, --kiosk NO tiene
rem     efecto (Chrome solo abre una pestaña en la ventana existente e ignora los flags) ===
taskkill /F /IM chrome.exe /T >nul 2>&1
timeout /t 2 /nobreak >nul

rem === Genera el script de mantener-activo. Usa mouse_event/keybd_event de user32.dll
rem     (inyeccion de input real a bajo nivel), que SI actualiza el temporizador de
rem     inactividad de Windows. Mover Cursor.Position o SendKeys (version anterior)
rem     NO siempre lo hace: por eso antes se seguia apagando la pantalla. ===
del "%LOG%" 2>nul
echo $log = '%LOG%' > "%PS1%"
echo try { >> "%PS1%"
echo   Add-Type @' >> "%PS1%"
echo using System; >> "%PS1%"
echo using System.Runtime.InteropServices; >> "%PS1%"
echo public class Native { >> "%PS1%"
echo     [DllImport("user32.dll")] >> "%PS1%"
echo     public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, UIntPtr dwExtraInfo); >> "%PS1%"
echo     [DllImport("user32.dll")] >> "%PS1%"
echo     public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo); >> "%PS1%"
echo } >> "%PS1%"
echo '@ >> "%PS1%"
echo   "$(Get-Date -Format 'HH:mm:ss') - keepalive iniciado (mouse_event+keybd_event)" | Out-File -FilePath $log -Append >> "%PS1%"
echo   while ($true) { >> "%PS1%"
echo     try { >> "%PS1%"
echo       [Native]::mouse_event(0x0001, 1, 0, 0, [UIntPtr]::Zero) >> "%PS1%"
echo       Start-Sleep -Milliseconds 50 >> "%PS1%"
echo       [Native]::mouse_event(0x0001, -1, 0, 0, [UIntPtr]::Zero) >> "%PS1%"
echo       [Native]::keybd_event(0x7E, 0, 0, [UIntPtr]::Zero) >> "%PS1%"
echo       [Native]::keybd_event(0x7E, 0, 2, [UIntPtr]::Zero) >> "%PS1%"
echo       "$(Get-Date -Format 'HH:mm:ss') - OK" | Out-File -FilePath $log -Append >> "%PS1%"
echo     } catch { >> "%PS1%"
echo       "$(Get-Date -Format 'HH:mm:ss') - ERROR ciclo: $($_.Exception.Message)" | Out-File -FilePath $log -Append >> "%PS1%"
echo     } >> "%PS1%"
echo     Start-Sleep -Seconds 90 >> "%PS1%"
echo   } >> "%PS1%"
echo } catch { >> "%PS1%"
echo   "$(Get-Date -Format 'HH:mm:ss') - ERROR FATAL AL ARRANCAR: $($_.Exception.Message)" | Out-File -FilePath $log -Append >> "%PS1%"
echo } >> "%PS1%"

rem === Lanza el keepalive en segundo plano, invisible ===
start "" /min powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File "%PS1%"

rem === Abre el Dashboard COMBINADO (archivo local, rota solo entre los dos cada 15 min) en Chrome a pantalla completa ===
start "" chrome --kiosk "%~dp0dashboard_combinado.html" --disable-infobars --disable-session-crashed-bubble --noerrdialogs --no-first-run
