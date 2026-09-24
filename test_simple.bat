@echo off
title TEST SIMPLE - no cerrar esta ventana
echo Si ves este mensaje, el script sigue vivo.
echo Abriendo Chrome...
start "" chrome --kiosk "https://script.google.com/a/macros/ext.leroymerlin.es/s/AKfycby54-q25pbCrtpEUhVSNK033iE6NPEKnq3qhd-OK4Vb7VLw1oVDB6BO_leHdk9_Fx4YJA/exec?view=dashboard"
echo.
echo Si ves ESTE mensaje, el script llego hasta el final sin que nada lo matara.
pause
