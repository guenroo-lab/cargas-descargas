# Monitor en vivo de soportes Generix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar en vivo, en una nueva pantalla `?view=generix` de `proyecto_cargas`, los soportes que se están cargando en Generix, capturados por una extensión de Chrome nueva.

**Architecture:** Extensión de Chrome (content script + script inyectado en la página) engancha las llamadas XHR/fetch de Generix a `/idesign/api/rpc/`, detecta cambios de situación por soporte y los manda por `fetch` a un `doPost` nuevo en `proyecto_cargas`. El backend guarda cada soporte en la pestaña `GENERIX_EVENTOS` (clave: nº soporte) y una nueva vista de solo lectura los agrupa por tienda (campo propio de Generix — sin cruce con `EnCurso`/`Registros`, que no tienen esa granularidad).

**Tech Stack:** Google Apps Script (V8) + HtmlService, Chrome Extension Manifest V3, JavaScript plano (sin build step), Node 24 (`node --test`) para la lógica pura de la extensión.

---

## Contexto para quien implemente

- Spec completa: `docs/superpowers/specs/2026-07-17-monitor-generix-design.md` — léela primero, tiene el porqué de cada decisión.
- `proyecto_cargas` **no es un repositorio git** — no hay que hacer commits, solo guardar los archivos. Verifica con `git status` en la carpeta si tienes dudas (dará "not a git repository").
- `proyecto_cargas` **no tiene test runner ni build step para el código `.gs`/`.html`** — Apps Script no se ejecuta en local. La verificación de esas partes es: (a) desplegar con `clasp push --force` y (b) ejecutar funciones de prueba manualmente desde el editor de Apps Script (patrón ya usado en el proyecto: `probarCorreoMijas()`, `probarCorreoMijas()` en `GestionJefe.gs`). Sigue ese mismo patrón para las nuevas funciones de prueba.
- El proyecto de la extensión de Chrome (`generix-monitor-extension/`) es nuevo y **sí puede probarse en local** con Node — usa `node --test` (Node 24 ya instalado, sin dependencias que instalar) para la lógica pura de parseo/diff.
- **Riesgo a verificar en el paso final (no antes, no se puede probar sin desplegar):** `proyecto_cargas` tiene `"access": "DOMAIN"` en `appsscript.json` (solo usuarios logueados del dominio pueden llamar al Web App). El `fetch` de la extensión debe llevar `credentials: 'include'` para mandar la cookie de sesión de Google — si aun así falla, es la primera cosa a mirar (ver Task 7).

## File Structure

**En `C:\Users\30081048\Desktop\Proyectos\proyecto_cargas\src\`:**
- Crear `GenerixEventos.gs` — almacenamiento y lectura de eventos de Generix.
- Crear `Generix.html` — vista de solo lectura `?view=generix`.
- Modificar `CargasDescargas.gs` — añadir `doPost(e)` y la entrada `generix` al mapa de vistas de `doGet`.
- Modificar `Jefe.html` — añadir un enlace a `?view=generix`.

**En `C:\Users\30081048\Desktop\Proyectos\generix-monitor-extension\` (proyecto nuevo):**
- `manifest.json` — Manifest V3.
- `src/parser.js` — lógica pura (parseo de `rowDatas`, diff de situaciones). Testable con Node.
- `src/page-injected.js` — hook de `fetch`/`XHR` en el contexto de la página de Generix.
- `src/content-script.js` — puente entre la página y el backend: inyecta `page-injected.js`, recibe sus mensajes, llama a `parser.js`, hace el `fetch` al backend.
- `src/config.js` — constante `BACKEND_URL` (se rellena tras desplegar `proyecto_cargas`, Task 6).
- `test/parser.test.js` — tests de `parser.js` con `node --test`.

---

### Task 1: Almacenamiento de eventos Generix (backend)

**Files:**
- Create: `C:\Users\30081048\Desktop\Proyectos\proyecto_cargas\src\GenerixEventos.gs`

- [ ] **Step 1: Crear el archivo con la función de guardado, lectura agrupada y una función de prueba manual**

```javascript
/**
 * GenerixEventos.gs
 * Recibe eventos en vivo de soportes desde la extensión de Chrome que vigila
 * Generix (idesign-lm-spain.generix.biz) y los deja disponibles para la
 * vista de solo lectura ?view=generix.
 *
 * No hay cruce con EnCurso/Registros: proyecto_cargas no maneja pedidos ni
 * soportes individuales (solo un total por operación de muelle), así que
 * esto es una vista independiente agrupada por Tienda/Nombre tienda,
 * campos que vienen de Generix, no de proyecto_cargas.
 */

const CAB_GENERIX = ['Nº Soporte', 'Situación', 'Referencia Pedido', 'Tienda', 'Nombre tienda', 'Personal', 'Primera vez visto', 'Última actualización'];

// Guarda o actualiza un evento de soporte. Devuelve {ok, mensaje}.
function registrarEventoGenerix(evento) {
  try {
    if (!evento || !evento.numSoporte) {
      return { ok: false, mensaje: 'Falta numSoporte.' };
    }
    const h = _hoja('GENERIX_EVENTOS', CAB_GENERIX, '#3498db');
    const tz = CONFIG_CARGAS.ZONA_HORARIA;
    const ahora = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm:ss');
    const vals = h.getDataRange().getValues();
    for (let i = 1; i < vals.length; i++) {
      if (String(vals[i][0]) === String(evento.numSoporte)) {
        h.getRange(i + 1, 2, 1, 5).setValues([[
          evento.situacion || '', evento.referenciaPedido || '', evento.tienda || '',
          evento.nombreTienda || '', evento.personal || ''
        ]]);
        h.getRange(i + 1, 8).setValue(ahora);
        return { ok: true, mensaje: 'Actualizado.' };
      }
    }
    h.appendRow([
      evento.numSoporte, evento.situacion || '', evento.referenciaPedido || '',
      evento.tienda || '', evento.nombreTienda || '', evento.personal || '', ahora, ahora
    ]);
    return { ok: true, mensaje: 'Registrado.' };
  } catch (e) {
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}

// Lee GENERIX_EVENTOS y agrupa por "Tienda · Nombre tienda", cada grupo
// ordenado por última actualización descendente. Consumida por Generix.html.
function obtenerEventosGenerixAgrupados() {
  const h = _hoja('GENERIX_EVENTOS', CAB_GENERIX, '#3498db');
  const vals = h.getDataRange().getValues();
  const grupos = {};
  for (let i = 1; i < vals.length; i++) {
    const f = vals[i];
    if (!f[0]) continue;
    const clave = String(f[3] || '—') + ' · ' + String(f[4] || '—');
    if (!grupos[clave]) grupos[clave] = [];
    grupos[clave].push({
      numSoporte: String(f[0]), situacion: String(f[1] || ''), referenciaPedido: String(f[2] || ''),
      tienda: String(f[3] || ''), nombreTienda: String(f[4] || ''), personal: String(f[5] || ''),
      primeraVez: String(f[6] || ''), ultimaActualizacion: String(f[7] || '')
    });
  }
  Object.keys(grupos).forEach(function (k) {
    grupos[k].sort(function (a, b) { return b.ultimaActualizacion.localeCompare(a.ultimaActualizacion); });
  });
  return grupos;
}

// ===== PRUEBA MANUAL (ejecutar desde el editor de Apps Script) =====
// Registra 2 soportes de prueba, actualiza uno (simulando cambio de situación)
// y muestra el resultado agrupado en el Execution log.
function probarGenerixEventos() {
  var r1 = registrarEventoGenerix({
    numSoporte: 'TEST-0001', situacion: 'Soporte validado (en muelle)',
    referenciaPedido: '999999', tienda: 'E036', nombreTienda: 'MALAGA', personal: 'ULMAGPTEST'
  });
  Logger.log('Registro 1: ' + JSON.stringify(r1));

  var r2 = registrarEventoGenerix({
    numSoporte: 'TEST-0002', situacion: 'Soporte validado (en muelle)',
    referenciaPedido: '999998', tienda: 'E036', nombreTienda: 'MALAGA', personal: 'ULMAGPTEST'
  });
  Logger.log('Registro 2: ' + JSON.stringify(r2));

  // Simula que TEST-0001 pasó a "Cargado"
  var r3 = registrarEventoGenerix({
    numSoporte: 'TEST-0001', situacion: 'Cargado',
    referenciaPedido: '999999', tienda: 'E036', nombreTienda: 'MALAGA', personal: 'ULMAGPTEST'
  });
  Logger.log('Actualización (debe decir "Actualizado."): ' + JSON.stringify(r3));

  var agrupado = obtenerEventosGenerixAgrupados();
  Logger.log('Agrupado: ' + JSON.stringify(agrupado));
  Logger.log('Comprueba a mano: la pestaña GENERIX_EVENTOS debe tener 2 filas (no 3) y TEST-0001 debe decir "Cargado".');
}
```

- [ ] **Step 2: Verificación manual en el editor de Apps Script**

No se puede ejecutar `.gs` en local. Tras subir el archivo (`clasp push --force`, ver Task 6 para el flujo completo de despliegue), abre el editor de Apps Script, selecciona `probarGenerixEventos` en el desplegable de funciones y pulsa "Ejecutar". Revisa:
1. El **Execution log** debe mostrar `Registro 1`/`Registro 2` con `{"ok":true,"mensaje":"Registrado."}` y la actualización con `{"ok":true,"mensaje":"Actualizado."}`.
2. Abre el Spreadsheet: debe existir una pestaña `GENERIX_EVENTOS` con cabecera en negrita/azul (`#3498db`), fila congelada, y exactamente **2 filas de datos** (`TEST-0001` con Situación `Cargado`, `TEST-0002` con `Soporte validado (en muelle)`).
3. Borra las 2 filas de prueba de la hoja a mano antes de seguir (son datos ficticios).

_No hay "Step: commit" en este proyecto — no es un repositorio git._

---

### Task 2: `doPost` y enrutado del backend

**Files:**
- Modify: `C:\Users\30081048\Desktop\Proyectos\proyecto_cargas\src\CargasDescargas.gs:81` (justo después del cierre de `doGet`, antes de `function obtenerConfig()` en la línea 83)

- [ ] **Step 1: Añadir `doPost(e)` después de `doGet`**

Este proyecto no tiene ningún `doPost` hoy — `google.script.run` (usado por todas las vistas HTML existentes) no sirve para una extensión de Chrome externa, así que hace falta un endpoint HTTP real.

Inserta esto **entre la línea 81 (`}` que cierra `doGet`) y la línea 83 (`function obtenerConfig() {`)**:

```javascript

// ===================== API EXTERNA (extensión Chrome Generix) =====================
// La extensión de Chrome que vigila Generix no puede usar google.script.run
// (solo funciona dentro de páginas servidas por este propio Apps Script), así
// que manda eventos por POST normal a esta URL /exec.
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.accion === 'registrarEventoGenerix') {
      const r = registrarEventoGenerix(body.evento);
      return ContentService.createTextOutput(JSON.stringify(r)).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: false, mensaje: 'Acción desconocida: ' + body.accion }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, mensaje: 'Error: ' + err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

- [ ] **Step 2: Añadir la vista `generix` al mapa de `doGet`**

En `CargasDescargas.gs`, el mapa de vistas está en las líneas 71-76:

```javascript
  const map = {
    'dashboard': ['Dashboard',  'Monitor Plataforma Málaga'],
    'tiendas':   ['Tiendas',    'Cargas Extras · Tiendas'],
    'jefe':      ['Jefe',       'Gestión · Jefe de Equipo'],
  };
```

Sustitúyelo por (se añade la línea de `generix`, el resto queda igual):

```javascript
  const map = {
    'dashboard': ['Dashboard',  'Monitor Plataforma Málaga'],
    'tiendas':   ['Tiendas',    'Cargas Extras · Tiendas'],
    'jefe':      ['Jefe',       'Gestión · Jefe de Equipo'],
    'generix':   ['Generix',    'Monitor Generix · Soportes en vivo'],
  };
```

- [ ] **Step 3: Verificación manual (tras desplegar, tarea 6) con `curl`**

No hace falta esperar a la extensión para probar `doPost` — puede probarse por sí solo desde cualquier terminal (usa el usuario Google que tenga sesión abierta en el navegador que use `curl`, o prueba con Postman si `curl` sin sesión de navegador falla por ser `access: DOMAIN`):

```bash
curl -i -X POST "<URL_EXEC_DE_PROYECTO_CARGAS>" \
  -H "Content-Type: text/plain;charset=utf-8" \
  -d '{"accion":"registrarEventoGenerix","evento":{"numSoporte":"CURL-TEST","situacion":"Cargado","referenciaPedido":"1","tienda":"E036","nombreTienda":"MALAGA","personal":"TEST"}}'
```

Expected: respuesta JSON `{"ok":true,"mensaje":"Registrado."}` (o un 302 a una pantalla de login de Google si no hay sesión — en ese caso, confirma primero que hay una sesión de Google activa en el mismo cliente HTTP; si usas `curl` puro sin cookies, esto es normal, la prueba real de autenticación es desde la extensión en Task 7). Borra la fila `CURL-TEST` de `GENERIX_EVENTOS` después.

---

### Task 3: Vista de solo lectura `?view=generix`

**Files:**
- Create: `C:\Users\30081048\Desktop\Proyectos\proyecto_cargas\src\Generix.html`

- [ ] **Step 1: Crear la vista**

Reutiliza la paleta de colores y estructura visual de `Jefe.html` (mismo tema oscuro/claro) pero es una pantalla nueva e independiente — sin pestañas, sin escritura, solo lectura con refresco automático.

```html
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<base target="_top">
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<style>
:root{--bg:#080a10;--surface:#0f1220;--surface2:#161b2e;--red:#e30613;--cyan:#00c2ff;--gold:#f0b429;--green:#22c55e;--blue:#3498db;--text:#f0f4ff;--muted:#6b7899;--border:rgba(255,255,255,0.07);}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;min-height:100vh;padding-bottom:40px;}
.wrap{max-width:960px;margin:0 auto;padding:20px 16px 40px;}
.header{text-align:center;margin-bottom:22px;}
.header-title{font-family:'Bebas Neue';font-size:2rem;letter-spacing:3px;color:var(--text);}
.header-sub{color:var(--muted);font-size:.85rem;margin-top:4px;}
.divider{width:50px;height:3px;background:var(--blue);border-radius:2px;margin:10px auto 0;}
.grupos{display:flex;flex-direction:column;gap:16px;}
.grupo{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:16px;}
.grupo-titulo{font-family:'Bebas Neue';font-size:1.2rem;letter-spacing:1px;color:var(--blue);margin-bottom:10px;}
.soporte{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:10px;background:var(--surface2);margin-bottom:6px;position:relative;overflow:hidden;}
.soporte::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;}
.soporte.cargado::before{background:var(--green);}
.soporte.pendiente::before{background:var(--gold);}
.soporte-num{font-family:'Bebas Neue';font-size:1rem;letter-spacing:1px;min-width:90px;}
.soporte-info{flex:1;min-width:0;font-size:12px;color:var(--muted);}
.soporte-sit{font-size:11px;font-weight:700;text-transform:uppercase;padding:3px 9px;border-radius:50px;}
.sit-cargado{background:rgba(34,197,94,.15);color:var(--green);}
.sit-pendiente{background:rgba(240,180,41,.15);color:var(--gold);}
.vacio{text-align:center;color:var(--muted);padding:50px 20px;}
.vacio i{font-size:32px;opacity:.3;display:block;margin-bottom:14px;}
.actualizado{text-align:center;color:var(--muted);font-size:11px;margin-top:18px;}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="header-title">MONITOR GENERIX</div>
    <div class="header-sub">Soportes en vivo · Plataforma Málaga</div>
    <div class="divider"></div>
  </div>
  <div class="grupos" id="grupos"><div class="vacio"><i class="fa-solid fa-spinner fa-spin"></i>Cargando...</div></div>
  <div class="actualizado" id="actualizado"></div>
</div>

<script>
function cargar(){
  google.script.run.withSuccessHandler(render).withFailureHandler(function(e){
    document.getElementById('grupos').innerHTML='<div class="vacio"><i class="fa-solid fa-triangle-exclamation"></i>Error: '+e.message+'</div>';
  }).obtenerEventosGenerixAgrupados();
}

function esCargado(situacion){
  return /cargad/i.test(situacion||'');
}

function render(grupos){
  grupos=grupos||{};
  const claves=Object.keys(grupos);
  const cont=document.getElementById('grupos');
  if(!claves.length){
    cont.innerHTML='<div class="vacio"><i class="fa-solid fa-box-open"></i>Sin soportes reportados todavía. Abre la pantalla de carga en Generix con la extensión activa.</div>';
  } else {
    cont.innerHTML=claves.map(function(clave){
      const soportes=grupos[clave];
      const filas=soportes.map(function(s){
        const cargado=esCargado(s.situacion);
        const clsFila=cargado?'cargado':'pendiente';
        const clsSit=cargado?'sit-cargado':'sit-pendiente';
        return '<div class="soporte '+clsFila+'">'+
          '<div class="soporte-num">'+s.numSoporte+'</div>'+
          '<div class="soporte-info">Pedido '+(s.referenciaPedido||'—')+' · '+(s.personal||'—')+' · '+s.ultimaActualizacion+'</div>'+
          '<div class="soporte-sit '+clsSit+'">'+(s.situacion||'—')+'</div>'+
        '</div>';
      }).join('');
      return '<div class="grupo"><div class="grupo-titulo">'+clave+' · '+soportes.length+' soportes</div>'+filas+'</div>';
    }).join('');
  }
  document.getElementById('actualizado').textContent='Actualizado: '+new Date().toLocaleTimeString('es-ES');
}

cargar();
setInterval(cargar, 6000);
</script>
</body>
</html>
```

- [ ] **Step 2: Verificación manual**

Tras desplegar (Task 6), abre `<URL_EXEC>?view=generix`. Con las filas de prueba de `probarGenerixEventos` todavía en la hoja (vuelve a ejecutarla si las borraste), la pantalla debe mostrar un grupo `E036 · MALAGA` con 2 soportes, uno en verde (`Cargado`) y otro en ámbar (`Soporte validado (en muelle)`). Borra las filas de prueba después.

---

### Task 4: Enlace desde la pantalla del jefe de equipo

**Files:**
- Modify: `C:\Users\30081048\Desktop\Proyectos\proyecto_cargas\src\Jefe.html:132-134`

- [ ] **Step 1: Añadir el enlace bajo el divisor del header**

Líneas actuales (132-134):

```html
    <div class="divider"></div>
  </div>

```

Sustituir por (se añade el enlace entre el divider y el cierre del `.header`):

```html
    <div class="divider"></div>
    <a href="?view=generix" style="display:inline-flex;align-items:center;gap:7px;margin-top:12px;padding:8px 16px;background:var(--surface2);border:1px solid var(--border);border-radius:50px;color:var(--cyan);font-size:12px;font-weight:700;text-decoration:none;">
      <i class="fa-solid fa-boxes-packing"></i> Monitor Generix
    </a>
  </div>

```

(El `<base target="_top">` ya presente en la línea 6 de `Jefe.html` hace que este enlace navegue la pestaña completa, no un iframe, así que no hace falta añadir `target` a mano.)

- [ ] **Step 2: Verificación manual**

Tras desplegar, abre `?view=jefe`, comprueba que aparece el botón "Monitor Generix" bajo el título y que al pulsarlo navega a `?view=generix`.

---

### Task 5: Lógica pura de la extensión — parseo y diff (con tests)

**Files:**
- Create: `C:\Users\30081048\Desktop\Proyectos\generix-monitor-extension\src\parser.js`
- Test: `C:\Users\30081048\Desktop\Proyectos\generix-monitor-extension\test\parser.test.js`

Esta es la única parte del proyecto que puede seguir TDD real (Node local, sin navegador). Los datos de ejemplo son los capturados en vivo con Pedro el 2026-07-17.

- [ ] **Step 1: Escribir el test (falla porque `parser.js` no existe todavía)**

```javascript
// test/parser.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRowDatas, diffSituaciones } = require('../src/parser.js');

const FILA_EJEMPLO = [
  '55566663', '', 'Soporte homogéneo', 'Soporte validado (en muelle)', '999',
  'ULMAGPDPER', '14/07/2026', '13:33:24', 'E036', 'MALAGA', '20260714', '13:33:24',
  '270866', '1,00', '1,00', '842401900600882697', '999', '26046778', '', '0,00'
];

test('parseRowDatas extrae los campos correctos por posición', () => {
  const soportes = parseRowDatas([FILA_EJEMPLO]);
  assert.equal(soportes.length, 1);
  assert.deepEqual(soportes[0], {
    numSoporte: '55566663',
    situacion: 'Soporte validado (en muelle)',
    tienda: 'E036',
    nombreTienda: 'MALAGA',
    personal: 'ULMAGPDPER',
    referenciaPedido: '270866'
  });
});

test('parseRowDatas ignora filas vacías', () => {
  assert.deepEqual(parseRowDatas([]), []);
});

test('diffSituaciones marca como evento un soporte nuevo (no visto antes)', () => {
  const soportes = parseRowDatas([FILA_EJEMPLO]);
  const eventos = diffSituaciones({}, soportes);
  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].numSoporte, '55566663');
  assert.equal(eventos[0].situacionAnterior, null);
});

test('diffSituaciones NO marca un soporte cuya situación no cambió', () => {
  const soportes = parseRowDatas([FILA_EJEMPLO]);
  const previo = { '55566663': 'Soporte validado (en muelle)' };
  const eventos = diffSituaciones(previo, soportes);
  assert.equal(eventos.length, 0);
});

test('diffSituaciones SÍ marca un soporte cuya situación cambió (p.ej. a Cargado)', () => {
  const filaCargada = FILA_EJEMPLO.slice();
  filaCargada[3] = 'Cargado';
  const soportes = parseRowDatas([filaCargada]);
  const previo = { '55566663': 'Soporte validado (en muelle)' };
  const eventos = diffSituaciones(previo, soportes);
  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].situacion, 'Cargado');
  assert.equal(eventos[0].situacionAnterior, 'Soporte validado (en muelle)');
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd C:\Users\30081048\Desktop\Proyectos\generix-monitor-extension
node --test test/parser.test.js
```

Expected: FAIL — `Cannot find module '../src/parser.js'`.

- [ ] **Step 3: Escribir `parser.js`**

```javascript
// src/parser.js
// Lógica pura: nada de DOM, fetch ni chrome.* aquí, para poder testear con Node.
// Índices confirmados en vivo el 2026-07-17 sobre la respuesta real de
// POST /idesign/api/rpc/ (method: paginationWithProgramRefresh) de la
// pantalla "Repertorio general de soportes de una expedición".
const IDX = {
  numSoporte: 0,
  situacion: 3,
  tienda: 8,
  nombreTienda: 9,
  personal: 5,
  referenciaPedido: 12
};

function parseRowDatas(rowDatas) {
  if (!Array.isArray(rowDatas)) return [];
  return rowDatas
    .filter(function (fila) { return Array.isArray(fila) && fila[IDX.numSoporte]; })
    .map(function (fila) {
      return {
        numSoporte: String(fila[IDX.numSoporte]),
        situacion: String(fila[IDX.situacion] || ''),
        tienda: String(fila[IDX.tienda] || ''),
        nombreTienda: String(fila[IDX.nombreTienda] || ''),
        personal: String(fila[IDX.personal] || ''),
        referenciaPedido: String(fila[IDX.referenciaPedido] || '')
      };
    });
}

// previo: { numSoporte: situacionAnterior }. Devuelve solo los soportes
// nuevos o cuya situación cambió desde el último snapshot en memoria.
function diffSituaciones(previo, soportes) {
  previo = previo || {};
  return soportes
    .filter(function (s) { return !(s.numSoporte in previo) || previo[s.numSoporte] !== s.situacion; })
    .map(function (s) {
      return Object.assign({}, s, {
        situacionAnterior: (s.numSoporte in previo) ? previo[s.numSoporte] : null
      });
    });
}

const api = { parseRowDatas, diffSituaciones };
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else {
  (typeof window !== 'undefined' ? window : globalThis).GenerixParser = api;
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

```bash
cd C:\Users\30081048\Desktop\Proyectos\generix-monitor-extension
node --test test/parser.test.js
```

Expected: PASS — 5 tests, 0 fallos.

_No hay "Step: commit" — la carpeta no es un repositorio git (se puede inicializar uno aparte si Pedro lo pide más adelante, fuera de alcance aquí)._

---

### Task 6: Extensión de Chrome — captura en la página y envío al backend

**Files:**
- Create: `C:\Users\30081048\Desktop\Proyectos\generix-monitor-extension\manifest.json`
- Create: `C:\Users\30081048\Desktop\Proyectos\generix-monitor-extension\src\page-injected.js`
- Create: `C:\Users\30081048\Desktop\Proyectos\generix-monitor-extension\src\content-script.js`
- Create: `C:\Users\30081048\Desktop\Proyectos\generix-monitor-extension\src\config.js`

- [ ] **Step 1: `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Monitor Generix - TAISA",
  "version": "1.0.0",
  "description": "Envía a proyecto_cargas los cambios de situación de los soportes vistos en la pantalla de carga de Generix (solo lectura, no interactúa con Generix).",
  "content_scripts": [
    {
      "matches": ["https://idesign-lm-spain.generix.biz/*"],
      "js": ["src/config.js", "src/parser.js", "src/content-script.js"],
      "run_at": "document_start"
    }
  ],
  "host_permissions": [
    "https://idesign-lm-spain.generix.biz/*",
    "https://script.google.com/*"
  ],
  "web_accessible_resources": [
    {
      "resources": ["src/page-injected.js"],
      "matches": ["https://idesign-lm-spain.generix.biz/*"]
    }
  ]
}
```

- [ ] **Step 2: `src/page-injected.js`** — corre en el contexto de la página de Generix (mundo NO aislado), engancha `XMLHttpRequest` y `fetch` para leer las respuestas de `/idesign/api/rpc/` sin modificarlas

```javascript
// src/page-injected.js
// Se inyecta como <script> real en la página de Generix (no como content
// script) para tener acceso directo a window.fetch/XMLHttpRequest de la
// página. Solo LEE las respuestas, nunca las modifica ni bloquea.
(function () {
  function avisar(url, respBody) {
    try {
      window.postMessage({ __generixMonitor: true, url: url, body: respBody }, '*');
    } catch (e) { /* si postMessage falla, simplemente no se manda este evento */ }
  }

  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__gmUrl = url;
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    var xhr = this;
    xhr.addEventListener('load', function () {
      if (xhr.__gmUrl && String(xhr.__gmUrl).indexOf('/idesign/api/rpc') !== -1) {
        avisar(xhr.__gmUrl, xhr.responseText);
      }
    });
    return origSend.apply(this, arguments);
  };

  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function () {
      var args = arguments;
      return origFetch.apply(this, args).then(function (res) {
        try {
          var url = (args[0] && args[0].url) || args[0];
          if (typeof url === 'string' && url.indexOf('/idesign/api/rpc') !== -1) {
            res.clone().text().then(function (text) { avisar(url, text); });
          }
        } catch (e) { /* no interferir con la respuesta real si algo falla aquí */ }
        return res;
      });
    };
  }
})();
```

- [ ] **Step 3: `src/config.js`**

```javascript
// src/config.js
// BACKEND_URL: URL /exec del despliegue de proyecto_cargas. Se rellena
// tras desplegar (ver Task 7) — sin esto, la extensión no manda nada,
// pero tampoco rompe Generix (falla en silencio en content-script.js).
var GENERIX_MONITOR_CONFIG = {
  BACKEND_URL: ''
};
```

- [ ] **Step 4: `src/content-script.js`** — inyecta `page-injected.js`, recibe sus mensajes, calcula el diff con `parser.js` y manda cada cambio al backend

```javascript
// src/content-script.js
(function () {
  // 1) Inyectar page-injected.js como script REAL de la página (mundo no aislado)
  var script = document.createElement('script');
  script.src = chrome.runtime.getURL('src/page-injected.js');
  script.onload = function () { script.remove(); };
  (document.head || document.documentElement).appendChild(script);

  // 2) Recibir los mensajes de page-injected.js y calcular el diff
  var previo = {};
  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    if (!event.data || event.data.__generixMonitor !== true) return;
    procesarRespuesta(event.data.body);
  });

  function procesarRespuesta(text) {
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return; // respuesta no es JSON (p.ej. saveUserPreference con cuerpo vacío) -> ignorar
    }
    if (!parsed || !parsed.result || !Array.isArray(parsed.result.rowDatas)) return;

    var soportes = GenerixParser.parseRowDatas(parsed.result.rowDatas);
    var eventos = GenerixParser.diffSituaciones(previo, soportes);

    soportes.forEach(function (s) { previo[s.numSoporte] = s.situacion; });

    eventos.forEach(enviarEvento);
  }

  function enviarEvento(evento) {
    if (!GENERIX_MONITOR_CONFIG.BACKEND_URL) return; // sin URL configurada todavía
    fetch(GENERIX_MONITOR_CONFIG.BACKEND_URL, {
      method: 'POST',
      credentials: 'include', // necesario: el Web App es "access: DOMAIN", requiere la cookie de sesión Google
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita el preflight OPTIONS que Apps Script no gestiona
      body: JSON.stringify({ accion: 'registrarEventoGenerix', evento: evento })
    }).catch(function () { /* fallo de red: se reintentará solo si Generix vuelve a refrescar y el soporte sigue "cambiado" */ });
  }
})();
```

- [ ] **Step 5: Verificación manual (sin backend real todavía)**

1. Abre `chrome://extensions`, activa "Modo de desarrollador", "Cargar descomprimida" y selecciona `C:\Users\30081048\Desktop\Proyectos\generix-monitor-extension`.
2. Abre Generix, ve a la pantalla "Repertorio general de soportes de una expedición", abre DevTools → Console.
3. Refresca la tabla (botón ⟳). No debe haber ningún error nuevo en consola causado por la extensión (búscalo por "content-script.js" o "page-injected.js" en el origen del error).
4. Añade temporalmente `console.log(evento)` dentro de `enviarEvento` (o pon un breakpoint) para confirmar que se generan eventos con los campos esperados (`numSoporte`, `situacion`, `referenciaPedido`, `tienda`, `nombreTienda`, `personal`). Quítalo antes de seguir.

---

### Task 7: Conectar extensión y backend, verificación end-to-end

**Files:** ninguno nuevo — despliegue y configuración final.

- [ ] **Step 1: Desplegar `proyecto_cargas`**

Sigue el flujo ya establecido del proyecto (ver `docs/DESPLIEGUE.md` si existe, o el patrón habitual):

```bash
cd C:\Users\30081048\Desktop\Proyectos\proyecto_cargas
clasp push --force
clasp version "Monitor Generix: doPost + GENERIX_EVENTOS + vista generix"
clasp deploy --deploymentId "<DEPLOYMENT_ID_DE_PRODUCCIÓN>" --versionNumber <N> --description "Monitor Generix"
```

Usa el mismo `deploymentId` de producción que ya usa Pedro para mantener la misma URL (confírmalo con él si no está documentado en este repo — el otro proyecto, `proyecto_cargas`, no tenía la URL en el código, a diferencia de `lm_produccion`).

- [ ] **Step 2: Rellenar `BACKEND_URL` en la extensión**

Copia la URL `/exec` del despliegue del Paso 1 y pégala en `C:\Users\30081048\Desktop\Proyectos\generix-monitor-extension\src\config.js`:

```javascript
var GENERIX_MONITOR_CONFIG = {
  BACKEND_URL: 'https://script.google.com/macros/s/TU_DEPLOYMENT_ID/exec'
};
```

En `chrome://extensions`, pulsa el botón de recargar (⟳) sobre la extensión para que tome el cambio.

- [ ] **Step 3: Prueba end-to-end real**

1. En Chrome, con la extensión activa, abre Generix y navega a la pantalla de carga en vivo (la misma que Pedro usó el 2026-07-17).
2. Escanea o refresca para que Generix pida datos nuevos.
3. Abre el Spreadsheet de `proyecto_cargas`, pestaña `GENERIX_EVENTOS` — deben aparecer filas con los soportes reales.
4. Abre `<URL_EXEC>?view=generix` — debe mostrar esos mismos soportes agrupados por tienda, actualizándose solo cada 6 segundos.
5. **Si no llega nada a `GENERIX_EVENTOS`:** abrir DevTools → Network en la pestaña de Generix, filtrar por el dominio de `script.google.com`, y mirar si la petición POST se está bloqueando por CORS o devolviendo una redirección de login de Google (sería el problema de `credentials: 'include'` + `access: DOMAIN` ya anticipado en la spec). Si pasa esto, es un ajuste de configuración (no de arquitectura) a resolver en el momento — no está pre-resuelto en este plan porque depende de cómo reaccione Apps Script en la práctica.

- [ ] **Step 4: Confirmar con Pedro si hay restricciones de instalación**

Pedro dijo que no sabe si hay restricciones para instalar extensiones de Chrome en los PCs del muelle ("vamos a probar a ver qué pasa"). Si `chrome://extensions` con "Modo de desarrollador" está bloqueado por política de empresa en esos PCs, avisa — no hay plan B predefinido para eso, se decide con Pedro en ese momento (podría ser empaquetar la extensión y pedir a IT que la instale como forzada por política, pero eso está fuera de alcance de este plan).

---

## Fuera de alcance (recordatorio de la spec)

- Fase 2 (reglas de aviso de soportes faltantes).
- Cualquier cruce automático con `EnCurso`/`Registros`.
- Cualquier interacción de la extensión con Generix más allá de leer sus respuestas de red.
