# App Cargas/Descargas — Plataforma Málaga (TAISA / Leroy Merlin)

Sistema en producción. Google Apps Script + Google Sheets. Gestión de muelles de carga/descarga.

## Arranque en Claude Code

1. Abre esta carpeta en Claude Code.
2. Lee **CLAUDE.md** — tiene TODO el contexto (arquitectura, IDs, flujos, bugs resueltos).
3. El código vivo está en **`src/`** (5 archivos .gs + 4 .html + appsscript.json).

## Estructura

```
proyecto_cargas/
├── CLAUDE.md          ← contexto completo del proyecto (LÉELO PRIMERO)
├── README.md          ← este archivo
├── .clasp.json        ← config de clasp (pon tu Script ID)
└── src/
    ├── appsscript.json     ← manifiesto (timezone, scopes, webapp)
    ├── CargasDescargas.gs  ← núcleo: routing, iniciar/finalizar, Registros, foto, menú
    ├── B2B.gs              ← integración con el documento B2B externo
    ├── GestionJefe.gs      ← correos (admin + Mijas 6:30) y CONFIG_CORREO
    ├── Programacion.gs     ← solicitudes carga extra (tiendas)
    ├── cargas.html         ← terminal de muelles
    ├── Dashboard.html      ← monitor TV
    ├── Tiendas.html        ← formulario tiendas
    └── Jefe.html           ← pantalla jefe (Seguimiento + Gestionar)
```

## Para sincronizar con Apps Script (clasp)

```bash
npm install -g @google/clasp
clasp login
# edita .clasp.json con tu Script ID (Apps Script → Config del proyecto)
clasp push          # sube src/ al proyecto
```
Tras `clasp push`, crea **versión nueva** del despliegue desde el editor
(Implementar → Gestionar implementaciones → lápiz → Nueva versión) para no cambiar la URL.

## Reglas rápidas
- Backend GAS: concatenación, **no template literals**.
- Front: `google.script.run`, no fetch.
- Fechas: forzar texto `@` en Sheets (ver "Bug fechas" en CLAUDE.md).
- Entregar archivos completos, listos para pegar.
- Desplegar siempre como **versión nueva** para mantener la URL.
