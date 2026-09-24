# Diseño: monitor en vivo de soportes cargando en Generix

## Contexto

Pedro quiere una nueva pantalla dentro de **proyecto_cargas** (App Cargas/Descargas Plataforma Málaga) que muestre en tiempo real los soportes/pedidos que se están cargando en **Generix** (`idesign-lm-spain.generix.biz`), el WMS externo que usan en Chrome para el proceso de carga. Es una app distinta de proyecto_cargas — no hay integración hoy entre ambas.

Fase 2 (futura, fuera de alcance de este diseño): avisar cuando falten soportes por cargar según reglas fijas ("todo pedido con flujo X lleva N soportes", etc.). Las reglas concretas aún no están definidas — se diseñarán en un documento aparte cuando Pedro las tenga claras. Este diseño deja `GENERIX_EVENTOS` lista para que esa fase se apoye en ella sin rediseño.

## Investigación previa (verificada en vivo con Pedro, 2026-07-17)

**Sobre Generix:**
- `idesign-lm-spain.generix.biz` es una SPA con login propio (usuario/contraseña), **no** está detrás de Citrix — descartado el enfoque de automatización por teclas que usa `robot-flujostra-citrix` (ese es un sistema distinto, "Generix Infolog", accedido por Citrix).
- La pantalla relevante es **"Repertorio general de soportes de una expedición"**, que Pedro tiene abierta mientras se carga un camión. Se actualiza en vivo — es la pantalla de trabajo real, no un informe aparte.
- Esa pantalla llama a una **API JSON real**: `POST https://idesign-lm-spain.generix.biz/idesign/api/rpc/` con `{"method":"paginationWithProgramRefresh","params":[...]}`. La respuesta trae `result.rowDatas`: un array de filas (arrays de strings), una por soporte.
- Columnas confirmadas por posición en `rowDatas` (índice → columna visible): Nº Soporte(0), Tipo(2), **Situación**(3) (cambia de "Soporte validado (en muelle)" a un estado de "cargado" cuando el soporte se escanea como cargado — confirmado por Pedro), Muelle(4) — numeración interna de Generix (999, 36, 362...), **no** corresponde a los muelles físicos 2-12 de proyecto_cargas —, Personal(5) (usuario Generix, ej. `ULMAGPUG13`), fecha/hora fin preparación(6,7), **Cliente**(8) (código tienda, ej. `E036`), Nombre cliente(9) (ej. `MALAGA`), fecha/hora inicio preparación(10,11), **Referencia Pedido**(12).
- La llamada solo se dispara cuando esa pantalla concreta está abierta y se refresca (botón ⟳ o filtro). No hay "push" del servidor — es petición explícita del cliente.

**Sobre proyecto_cargas (leído el código real, `src/CargasDescargas.gs` y `src/GestionJefe.gs`):**
- **No existe ninguna tabla de pedidos ni de soportes individuales.** El modelo de datos es por **operación de muelle**: hoja `EnCurso` (operaciones abiertas, una fila por muelle 2-12 ocupado) y hoja `Registros` (operaciones cerradas). El nº de soportes es **un total introducido a mano** al cerrar la operación (`datos.soportes`, columna `Nº soportes` de `CAB_REG`), no hay desglose por soporte.
- Por eso **no existe ningún cruce fiable** entre la `Referencia Pedido` de Generix y una operación concreta de `EnCurso`/`Registros`. El campo Muelle tampoco sirve para cruzar (numeración distinta entre sistemas).
- **Decisión de Pedro:** no intentar cruzar automáticamente. La nueva pantalla `?vista=generix` muestra lo que reporta Generix **agrupado por su propio Cliente/tienda** (ej. `E036 · MALAGA`), como vista independiente — sin intentar unirla a una fila concreta de `EnCurso`.
- `doGet(e)` (línea 66) es el único punto de entrada HTTP; rutea por `e.parameter.view` a un mapa de `{vista: [archivo, título]}` (línea 71-76) que sirve el `.html` correspondiente con `HtmlService.createHtmlOutputFromFile`. **No existe `doPost` en todo el proyecto** — hay que crearlo desde cero para que la extensión de Chrome pueda mandar eventos (no se puede usar `google.script.run`, que solo funciona dentro de una página servida por el propio Apps Script).
- Patrón de hoja ya establecido en `_hoja(nombre, cabeceras, color)` (línea 101): crea la pestaña si no existe, con cabecera en negrita/color y fila congelada. Se reutiliza tal cual para `GENERIX_EVENTOS`.
- Vistas existentes: `dashboard`, `tiendas`, `jefe` (`Jefe.html` + `GestionJefe.gs`), y la vista por defecto `cargas.html` (terminal). Cada vista es un `.html` independiente — no hay un sistema de "modos" compartiendo un único `Index.html` (eso es del otro proyecto, `lm_produccion`).

## Arquitectura

```
Generix (pestaña Chrome, PC del muelle)
   → Extensión Chrome nueva (content script + página inyectada)
       - engancha fetch/XHR en la página de Generix
       - filtra llamadas a /idesign/api/rpc/ con method=paginationWithProgramRefresh
       - parsea rowDatas, detecta CAMBIOS de Situación por Nº Soporte
       - POST de cada cambio a proyecto_cargas (texto plano, sin credenciales propias)
   → proyecto_cargas: nuevo doPost en CargasDescargas.gs
       - enruta por acción a GenerixEventos.gs
       - guarda/actualiza fila en la pestaña de Sheet GENERIX_EVENTOS (clave: nº soporte)
   → Nueva vista ?view=generix (Generix.html + funciones en GenerixEventos.gs)
       - agrupa por Cliente/tienda (campo de Generix, no de proyecto_cargas)
       - polling simple con google.script.run, igual que el resto de vistas
```

## Componentes

### 1. Extensión de Chrome (proyecto nuevo, `generix-monitor-extension/`)

- Manifest V3, content script inyectado solo en `https://idesign-lm-spain.generix.biz/*`.
- El content script inyecta un `<script>` en el contexto de la página (mundo no aislado) para poder sobrescribir `window.fetch`/`XMLHttpRequest.prototype.send` — necesario porque el content script de una extensión corre en un mundo aislado sin acceso directo a las llamadas JS de la página.
- Comunicación página → content script vía `window.postMessage`; el content script hace el `fetch` hacia el backend (los content scripts sí pueden hacer peticiones cross-origin con el permiso `host_permissions` del manifest).
- Lógica de parseo/diff (pura, testable con Node): `parseRowDatas(rowDatas)` → array de objetos soporte; `diffSituaciones(previo, actual)` → array de solo los soportes cuya Situación cambió desde el último snapshot en memoria.
- Cada evento enviado: `{numSoporte, situacion, situacionAnterior, referenciaPedido, tienda, nombreTienda, personal, timestamp}`.
- Sin credenciales propias: usa la sesión que el operario ya tiene abierta en Generix. No hace login ni entra en Generix por su cuenta, no interactúa con la página (solo lee llamadas de red ya en curso).

### 2. Backend en proyecto_cargas

- **`doPost(e)` nuevo en `CargasDescargas.gs`** (no existe ninguno hoy): lee `e.postData.contents` como JSON `{accion, evento}`, enruta `'registrarEventoGenerix'` a la función homónima. Devuelve `ContentService.createTextOutput(JSON.stringify({ok:true}))`.
- **Nuevo archivo `GenerixEventos.gs`** (no se toca `CargasDescargas.gs` más que para añadir el `doPost`, para no arriesgar el código de producción existente):
  - `registrarEventoGenerix(evento)`: valida campos mínimos, usa `_hoja('GENERIX_EVENTOS', CAB_GENERIX, '#3498db')` (reutilizando el helper `_hoja` ya existente) y escribe/actualiza la fila por `numSoporte` (busca la fila existente; si no está, añade).
  - `CAB_GENERIX = ['Nº Soporte', 'Situación', 'Referencia Pedido', 'Tienda', 'Nombre tienda', 'Personal', 'Primera vez visto', 'Última actualización']`.
  - `obtenerEventosGenerixAgrupados()`: lee `GENERIX_EVENTOS`, agrupa por `Tienda`+`Nombre tienda`, ordena por `Última actualización` descendente dentro de cada grupo. Es la función que consume la nueva vista vía `google.script.run`.
- **CORS**: la extensión hace `POST` con `Content-Type: text/plain;charset=utf-8` (evita el preflight `OPTIONS`, que Apps Script Web Apps no gestionan) y el cuerpo es un JSON serializado a mano; `doPost` lo parsea desde `e.postData.contents`. Esto se verifica en real durante la implementación (es la única pieza que no se puede probar sin desplegar).

### 3. Nueva vista `?view=generix`

- Nuevo archivo `Generix.html`, añadido al mapa de `doGet` (línea 71-76 de `CargasDescargas.gs`): `'generix': ['Generix', 'Monitor Generix · Soportes en vivo']`.
- Tarjeta por grupo Tienda (ej. "E036 · MALAGA"): lista de soportes con Situación (color según estado, mismo criterio visual que ya usa Generix: verde=cargado, naranja/ámbar=validado en muelle pendiente), Personal, hora.
- Polling cada pocos segundos con `google.script.run.obtenerEventosGenerixAgrupados()`, mismo patrón que el resto de vistas (sin necesidad de un `gas()` wrapper nuevo — no existe ese patrón en este proyecto, es de `lm_produccion`).
- Solo lectura — esta pantalla no permite editar nada, solo observar.
- Accesible añadiendo un enlace en `Jefe.html` (pantalla del jefe de equipo) hacia `?view=generix`.

## Manejo de errores / edge cases

- **Generix cambia su pantalla o su API**: la extensión deja de encontrar la llamada esperada y simplemente no envía eventos nuevos. No rompe Generix (nunca se modifica su tráfico, solo se lee) ni proyecto_cargas (sigue funcionando con lo último que tenga en `GENERIX_EVENTOS`).
- **Varias cargas simultáneas / varios PCs con Generix abierto**: cada evento se identifica por `numSoporte` (único) y se agrupa por tienda — no hay conflicto entre operarios en distintos muelles, cada uno manda sus propios eventos.
- **Extensión no instalada/inactiva en algún PC**: esa pantalla de Generix simplemente no reporta nada; el resto de proyecto_cargas sigue funcionando exactamente igual que hoy (no es una dependencia dura de nada existente, ni toca `EnCurso`/`Registros`).
- **`doPost` recibe basura o JSON inválido**: se envuelve en try/catch, devuelve `{ok:false, mensaje}` con código 200 (Apps Script no permite otros códigos HTTP fácilmente) en vez de lanzar excepción sin control.

## Testing

- Lógica pura de la extensión (`parseRowDatas`, `diffSituaciones`) con `node --test` (Node 24 ya instalado, sin dependencias nuevas) sobre datos de ejemplo capturados de la sesión real de Pedro.
- Verificación en producción: abrir directamente la pestaña `GENERIX_EVENTOS` del Sheet tras activar la extensión y refrescar la pantalla de Generix — debe aparecer/actualizarse una fila por soporte. Este proyecto no usa el patrón `?probe=` (es de `lm_produccion`), así que no se añade uno nuevo; `Logger.log` en `registrarEventoGenerix` es suficiente para depurar desde el editor de Apps Script, igual que ya hace `finalizarOperacion`.
- Verificación manual: comparar lo que muestra `?view=generix` contra lo que se ve a simple vista en la pantalla de Generix mientras se carga un pedido real.
- Verificación de la extensión: Chrome DevTools → Network en la pestaña de Generix, confirmar que el hook no interfiere con las llamadas reales (deben seguir funcionando igual para el usuario).

## Fuera de alcance (este diseño)

- Fase 2 (reglas de aviso de soportes faltantes): reglas aún no definidas por Pedro. Se diseñará aparte, apoyándose en `GENERIX_EVENTOS`.
- Cruce automático entre soportes de Generix y operaciones de muelle de `EnCurso`/`Registros`: decisión explícita de Pedro de NO hacerlo (no hay campo fiable en común). La vista `?view=generix` es independiente.
- No se automatiza ninguna acción dentro de Generix (no se hace clic, no se rellena nada) — solo lectura pasiva de lo que ya carga la página.
- No se toca `robot-flujostra-citrix` ni el sistema Citrix/Infolog — es un sistema distinto sin relación con este.
- Instalación de la extensión en los PCs del muelle (permisos de Windows/políticas de empresa): a probar directamente, sin plan B predefinido si hay restricciones — se resuelve si aparece el problema.
