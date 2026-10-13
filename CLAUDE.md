# CLAUDE.md — App Cargas/Descargas · Plataforma Málaga (TAISA / Leroy Merlin)

> Este archivo da contexto a Claude Code sobre el proyecto. Léelo entero antes de tocar nada.
> **El sistema está EN PRODUCCIÓN y en uso diario.** Cuidado con cambios que rompan el flujo.

---

## QUÉ ES

Aplicación de gestión de cargas y descargas para la plataforma logística de **TAISA** que opera **Leroy Merlin Málaga**. Hecha en **Google Apps Script + Google Sheets**, desplegada como Web App. Gestiona la operativa de muelles: qué se carga/descarga, en qué muelle, por quién, con foto, y vuelca todo a un documento externo (el **B2B**) y a una hoja de **Registros** propia.

El autor (Pedro) NO programa: define necesidades, valida y mantiene el mapa mental del sistema. **Entregar archivos completos listos para pegar, no fragmentos.** Comunicación en español, directa, sin rodeos.

---

## ARQUITECTURA

Una sola Web App con routing por parámetro `?view=`:

| Vista | URL | HTML | Quién la usa |
|-------|-----|------|--------------|
| Terminal cargadores | `/exec` | `cargas.html` | Operarios en los muelles |
| Dashboard TV | `/exec?view=dashboard` | `Dashboard.html` | Monitor en pared/TV |
| App tiendas | `/exec?view=tiendas` | `Tiendas.html` | Tiendas (piden cargas extra) |
| Pantalla jefe | `/exec?view=jefe` | `Jefe.html` | Jefe de equipo |

### Archivos backend (.gs)
- **CargasDescargas.gs** — núcleo: `doGet` (routing), iniciar/finalizar operación, hoja Registros y EnCurso, foto a Drive, menú de formato del Sheet, correo Mijas (disparo).
- **B2B.gs** — toda la integración con el documento B2B externo: leer plan del día, casar y rellenar filas, cargas/descargas pendientes, funciones del jefe (añadir/anular).
- **GestionJefe.gs** — correos a administración (añadir/anular transporte) y correo Mijas 6:30 (cuerpo). Funciones de prueba de correo. (Aquí vive el único `CONFIG_CORREO` y `enviarCorreoMijas0630`.)
- **Programacion.gs** — solicitudes de carga extra desde tiendas (`anadirCargaExtra`).

> ⚠️ NO crear un `Jefe.gs`. Existía un `Jefe.gs` que duplicaba `GestionJefe.gs` (mismo `const CONFIG_CORREO` y mismas funciones) → en Apps Script eso es un error de compilación y tumba TODO el proyecto. Se eliminó. El backend del Jefe (añadir/anular) vive en **B2B.gs** (`jefeAnadirAlB2B`, `jefeAnularEnB2B`).

### Archivos frontend (.html)
- **cargas.html** — terminal de muelles (lo más complejo del front).
- **Dashboard.html** — monitor TV, refresco 30s, KPIs, previsión con colores.
- **Tiendas.html** — formulario de solicitud de carga extra.
- **Jefe.html** — 2 pestañas: Seguimiento (semáforo) y Gestionar (añadir/anular).

---

## REGLAS DE CÓDIGO (IMPORTANTES)

1. **Backend GAS: NO usar template literals** (backticks). Usar concatenación con `+`. (Sí se usan en algún HTML del front, pero en .gs evitarlos.)
2. **Front → backend: usar `google.script.run`**, nunca fetch.
3. **Leer Sheets en bloque** con `getValues()`, no celda a celda en bucles.
4. **Diseño**: dark mode, rojo TAISA `#e30613`, fuentes Bebas Neue + DM Sans, Font Awesome. Logo TAISA en base64.
5. **Al desplegar**: usar "Gestionar implementaciones → editar (lápiz) → Nueva versión" para NO cambiar la URL.
6. **Verificar balance de llaves/paréntesis** tras cada edición.
7. **Fechas y horas**: Sheets convierte texto tipo `"18/06/2026"` a Date. Forzar texto plano con `setNumberFormat('@')` ANTES de escribir + `flush()`, y al leer reconvertir si viene como Date. (Ver sección "Bug fechas".)

---

## CONFIGURACIÓN CLAVE (IDs y constantes)

### B2B (en B2B.gs → CONFIG_B2B)
- **SHEET_ID**: `1HIYNp2SSpXbIvwfRpFcHI7y4rqZqcrEUu8d-_4WTpeY`
- **PRIMERA_FILA_DATOS**: 3 (filas 1-2 son cabeceras)
- **Hojas por meses**: nombre `"Junio 2026"`, `"Julio 2026"`, etc. (mes capitalizado + año)
- **PLATAFORMA_PROPIA**: `'Plataforma Málaga'`

### Columnas del B2B (COL_B2B, 1-indexed)
| Campo | Col | Nº |
|-------|-----|-----|
| Fecha | A | 1 |
| Tipo (Expedición/Recepción) | B | 2 |
| Origen | C | 3 |
| Destino | D | 4 |
| Hora cita (recepción) | E | 5 |
| Hora llegada YMS | F | 6 |
| Hora posicionamiento (expedición) | G | 7 |
| Hora comienzo | H | 8 |
| Hora fin | I | 9 |
| Flujo | J | 10 |
| Nº Palets | K | 11 |
| Nº Palets SIE | AF | 32 |
| ESTADO_JEFE | AT | 46 |

- **Casar carga (Expedición)** → por col **G** (posicionamiento)
- **Casar descarga (Recepción)** → por col **E** (cita)
- **Hora YMS** se LEE de col **F** y se copia a Registros (la rellena el sistema YMS externo, no la app)

### MAPA_B2B (destino app → nombre en B2B)
- `Málaga` → `LM Málaga`
- `Marbella` → `LM Marbella`
- `Mijas` → `LM Mijas`
- `Granada` → `LM Granada`
- Plataformas → `Plataforma Valencia/Torija/Meco/Antequera`
- Agencias → `Remansur`, `Correcaminos Granada`

### App propia (CargasDescargas.gs → CONFIG_CARGAS)
- **SPREADSHEET_ID**: `''` (vacío = usa la hoja activa, el Sheet contenedor del script)
- **HOJA_REG**: `Registros` (operaciones completadas)
- **HOJA_CURSO**: `EnCurso` (operaciones abiertas, estado en vivo)
- Carpeta de fotos en Drive: ver `guardarFoto_` en CargasDescargas.gs

### Operarios fijos (OPERARIOS_CARGAS)
Manuel Rosas, Sergio Sánchez, Ángel Alcázar, Antonio Sánchez. (Más campo libre para escribir otro.)
**En el Dashboard TV se muestran solo INICIALES** por privacidad (ej. "M.R."). En Registros se guarda el nombre completo.

### Destinos (DESTINOS_CARGAS en CargasDescargas.gs)
- **tiendas**: Málaga, Marbella, Mijas (con horas fijas), **Granada (solo descarga)**.
- **plataformas**: Valencia, Torija, Meco, Antequera.
- **agencias**: Remansur, Correcaminos Granada.
- **soloDescarga**: `['Granada']` — tiendas que solo se descargan, nunca se cargan.

### Correos (GestionJefe.gs → CONFIG_CORREO)
- **ADMINISTRACION** (9): Pedro.gil, david.delcampo, jose-manuel.lachambre, jose-antonio.alcaide, administracion.alm-malaga, daniel.simo, daniel.arrastio, francisco-javier.camara, sebastian.gelvis (todos @ext.leroymerlin.es salvo lachambre y administracion que son @leroymerlin.es).
- **MIJAS_0630** (6): manuel.gueto, salvador.gonzalez2, hector.andres, carlos.fuentes, vicente.amador, javier-jesus.roman (todos @leroymerlin.es).
- **REMITENTE_NOMBRE**: `'Plataforma Málaga - TAISA'`

---

## FLUJOS PRINCIPALES

### Iniciar operación (terminal)
1. Operario elige muelle (2-12), cargador, tipo (Carga/Descarga), destino/origen.
2. **Carga a tienda** o **cualquier descarga** → modal lee del B2B los transportes pendientes de ese destino con navegación de días (botones "Día ant./sig."). Permite ADELANTAR cargas (cargar hoy algo de mañana).
3. **Descarga** → foto al INICIAR (camión cargado que llega). **Carga** → foto al FINALIZAR.
4. Validaciones: un muelle no puede estar doble-ocupado; un cargador no puede operar dos muelles.
5. Se guarda en hoja **EnCurso** (incluye `fechaCarga` = fecha real elegida del B2B).

### Finalizar operación
1. Operario indica flujo(s), nº soportes, matrícula (carga), nº palets SIE (descarga SIE), foto (carga).
2. Se vuelca al **B2B**: localiza la fila por fecha+tipo+origen+hora y rellena H (comienzo), I (fin), J (flujo), K (palets), AF (SIE). **Lee la hora YMS de col F.**
3. Se escribe en hoja **Registros** (con la hora YMS, coloreada verde carga / ámbar descarga).
4. Si es carga Mijas 6:30 → correo automático a MIJAS_0630 con foto.

### Adelantar cargas (CASO IMPORTANTE)
Para Málaga y Mijas se adelantan cargas: hoy se carga un camión cuya ENTREGA es mañana. La app debe casar la fila de **mañana** en el B2B (incluso de otro mes), no la de hoy. La fecha real se elige en el modal (botón "Día sig.") y viaja como `fechaCarga` (formato dd/MM/yyyy) por EnCurso → finalizarOperacion → escribirEnB2B.

### Pantalla jefe — 2 pestañas
- **Seguimiento** (por defecto, izquierda): dos columnas semáforo (Cargas verde | Descargas ámbar) con contadores Pendientes/En curso/Hechas y lista por estado. Selector de fecha.
- **Gestionar** (derecha): añadir transporte (solo tienda destino + fecha + hora; siempre Carga/Expedición desde Plataforma Málaga) y anular. **Solo muestra transportes ACTIVOS** (pendientes/en curso) para anular. Inserción inteligente (debajo de la última fila de esa tienda). Anular = marca AT='Anulado', tacha la fila, envía correo.

### Correos a administración
- Jefe añade transporte → ADMINISTRACION (9).
- Jefe anula transporte → ADMINISTRACION (9).
- Tienda pide carga extra → ADMINISTRACION (9).
- Cada correo muestra **dos fechas**: "Fecha del transporte" (día del camión) y "Registrado el" (cuándo se hizo la acción).

### Correo Mijas 6:30
- Se dispara al cerrar una carga de Mijas a las 6:30 (comparación normaliza '6:30' y '06:30').
- Muestra: destino LM Mijas, **fecha de entrega en tienda** (= siguiente día laborable: viernes→lunes), **hora de descarga en tienda** 06:30, soportes, flujo, "Cargado el". Foto adjunta desde Drive.
- Funciones de prueba: `probarCorreoMijas()` (datos ficticios) y `reenviarCorreoMijasUltimo()` (usa la última carga de Mijas real de Registros).

---

## HOJAS DEL GOOGLE SHEET (contenedor del script)

### EnCurso (operaciones abiertas) — CAB_CURSO
`ID, Muelle, Cargador, Tipo, Categoría, Destino/Origen, Hora entrega/recepción, Hora comienzo (ISO), Foto descarga, Fecha carga`
(10 columnas; índices op[0]..op[9])

### Registros (completadas) — CAB_REG
`ID, Fecha, Muelle, Cargador, Tipo, Categoría, Destino/Origen, Hora comienzo, Hora fin, Duración (min), Hora entrega/recepción, Hora YMS, Flujo, Nº soportes, Matrícula, Enlace foto`
(16 columnas; "Hora YMS" va justo tras "Hora entrega/recepción")

### Menú del Sheet "📦 App Cargas" (onOpen en CargasDescargas.gs)
- Dar formato a Registros (cabecera roja, filtros, colores por tipo)
- Ver solo registros de HOY (filtra col B = Fecha por hoy)
- Quitar filtro (ver todos)
- Al abrir el Sheet se aplica auto el filtro de hoy.

---

## COLORES POR DESTINO (Dashboard TV)
Málaga verde `#22c55e`, Marbella azul `#3498db`, Mijas morado `#9b59b6`, Torija rojo `#e30613`, Valencia amarillo `#f0b429`, Inversa rosa `#ff5fa2`. Inversa tiene prioridad sobre el destino.

---

## BUG FECHAS (resuelto, no reintroducir)
Google Sheets convierte texto `"18/06/2026"` guardado con `appendRow` a un objeto **Date con hora**. Al leerlo, la validación regex `/^\d{2}\/\d{2}\/\d{4}$/` fallaba y se usaba la fecha de hoy → las cargas adelantadas se escribían en la fila equivocada del B2B.
**Solución actual**: en `iniciarOperacion` se pre-formatea la celda de fecha (col 10) como texto `@` antes de escribir + `flush()`, y en `finalizarOperacion` se reconvierte `op[9]` con `Utilities.formatDate` si llega como Date. El mensaje de cierre muestra `✓ B2B actualizado (fecha ...)` o `⚠ Aviso B2B: ...` para diagnóstico en pantalla.

## BUG CARGA ADELANTADA NO RELLENA B2B (resuelto, no reintroducir)
La carga de un día futuro (p.ej. Mijas 10:00 de mañana) aparecía en el terminal pero al cerrarla NO se rellenaba en el B2B. **Causa**: el terminal (`getCargasPendientesB2B`) ofrecía la fila casando solo por la columna que toca (DESTINO col D en cargas), pero `escribirEnB2B` exigía ADEMÁS que la columna ORIGEN (col C) fuera exactamente `"Plataforma Málaga"`. Las filas de días futuros suelen tener ese origen vacío/distinto → no casaba. Las de hoy sí lo tienen, por eso hoy funcionaba.
**Solución actual**: `escribirEnB2B` casa por el MISMO criterio que el terminal — por DESTINO (col D) en cargas y por ORIGEN (col C) en descargas, sin exigir el origen redundante. Además salta filas marcadas `Anulado` (col AT).

---

## ESTADO ACTUAL / PENDIENTE
- **Resuelto**: TODA carga (también plataformas como Torija y agencias como Remansur / Correcaminos Granada) abre ahora el modal del B2B para elegir el transporte pendiente con su hora (col G). Antes esas cargas no pedían hora → `escribirEnB2B` no tenía con qué cotejar y no rellenaba. Cambio en `cargas.html` (`requiereHora` y `abrirModalHora`). Los arrays de horas fijas de `DESTINOS_CARGAS` ya no se usan para elegir (todo sale del B2B).
- **Resuelto** el casado de cargas adelantadas (ver "BUG CARGA ADELANTADA" arriba) y el bug cross-mes del Jefe: `jefeAnadirAlB2B` / `jefeAnularEnB2B` ahora abren la hoja del mes de la fecha elegida, no siempre la del mes actual (`jefeAnularEnB2B` recibe la fecha desde `Jefe.html`).
- Siguen activos los logs `[B2B]` y `[Mijas check]` para diagnóstico. Al confirmar varios cierres reales correctos (hoy y adelantados), se pueden **retirar los Logger.log de diagnóstico**.

---

## CÓMO DESPLEGAR (clasp)
```bash
# Instalar clasp si no lo tienes
npm install -g @google/clasp

# Login (abre navegador, usar la cuenta del dominio)
clasp login

# El .clasp.json ya apunta al scriptId. Para subir cambios:
clasp push

# Tras subir, crear versión nueva del despliegue web SIN cambiar la URL:
# hazlo desde el editor: Implementar → Gestionar implementaciones → lápiz → Nueva versión
```
Si `clasp` da problemas con el dominio corporativo (el Gmail gestionado bloquea OAuth de terceros), la alternativa es seguir pegando los archivos a mano en el editor de Apps Script, usando esta carpeta como fuente de verdad.

## SCRIPT ID
Pega aquí el Script ID cuando lo tengas (Apps Script → Configuración del proyecto → "ID de la secuencia de comandos"):
```
SCRIPT_ID = 1p0aGMqsRbOSoPSVtMCvyRVliXNrAqXweA35btljVJ24vzXfjdCIb8qg0
```

---

## LOGO Y MOVIMIENTO (v62, 2026-10-09)

- **Logo de Leroy Merlin** en las 5 pantallas (`.lm-logo`, PNG con paleta de 4,7 KB incrustado en el CSS de cada página, transparente) dentro de la
  insignia blanca, a la izquierda del de Taisa y a su misma altura (`--logo-h`). En `cargas.html` y `Tiendas.html` el logo de Taisa salía a tamaño
  natural (enorme y cortado en el móvil): ahora los dos van a 54/40/32 px según el ancho. Generix no tenía logo: lleva los dos.
- **Movimiento** (mismo lenguaje que Última Milla): la barra superior de cada operación en curso «fluye»; según el tiempo (45 / 50 / 60 min, los
  tramos de siempre) la tarjeta respira más rápido, gira una luz por el borde (urgente/alerta) y a los 60 min lleva franjas de peligro.
  En la TV, además: alarma «N operaciones llevan más de 60 min» (banner + marco rojo de pantalla, nivel 2 a los 90 min), KPI que destellan al
  cambiar, programación del día con «EN n MIN» (≤15 min para la hora) y «+n MIN» (pendiente con la hora pasada ≥15 min), ranking que brilla.
  Jefe: lo «En curso» late y lo pendiente de HOY con la hora pasada avisa «+n MIN». Tiendas: fichas que saltan, botón de enviar que late con el
  formulario completo y un camión que cruza el aviso al enviar. Generix: «En vivo» con onda, pendientes que laten y destello verde cuando un soporte
  cambia de situación.
- **Reglas:** animar solo transform/opacity/box-shadow/background-position y a menos de 1 Hz; los repintados periódicos NO deben tocar el DOM si los datos
  no cambiaron (`ponerSiCambia`, `firmaTablero`, `_firmaGen`), si no las animaciones se reinician en cada refresco; sin sondeos nuevos al servidor.
- **SIN MOVIMIENTO POR DEFECTO desde la v70 (2026-10-13, a petición de Pedro: «quita esas mejoras visuales de movimiento, está sobrecargando el PC»).**
  Todo lo de arriba sigue escrito en el código, pero las 5 pantallas arrancan con `html.calma` (`animation:none!important;transition:none!important`, puesto
  en el `<head>` antes de pintar) y NO hay selector ni se lee ninguna elección guardada. Los avisos (alarma de +60 min, «EN n MIN»/«+n MIN», colores por tramo)
  siguen, pero FIJOS. Solo para diagnóstico: `?mov=pleno` (todas las pantallas) devuelve las animaciones de la v62 y `?mov=ligero` (solo la TV) el parpadeo por
  metrónomo. **No volver a poner movimiento por defecto sin hablarlo con Pedro.** `?diag=1` (solo TV) saca un cuadro de diagnóstico (perfil, movimiento
  reducido, ventana oculta, fps, animaciones en marcha, aceleración, navegador).
- Lo decorativo que sin animación quedaría congelado a medias se oculta con `html.calma …::after{display:none}`: anillo de luz de los muelles urgente/alerta y
  `.live-dot` (terminal), brillo de la cabecera (Jefe), camión del aviso (Tiendas), onda de «En vivo» (Generix). En la TV lo cubre el aspecto estático del bloque
  «MOVIMIENTO LIGERO» (`html.mov-ligero` sin `data-f`: bordes de color fijo por tramo y marco rojo en 4 tiras finas).

## PERFIL DE MOVIMIENTO DE LA TV: pleno | ligero | calma (v69, 2026-10-13) — DESDE LA v70 SIEMPRE «CALMA» POR DEFECTO

- **Estado actual (v70, mismo día 13/10):** Pedro pidió quitar el movimiento de la app (PC sobrecargado), así que `lmMov` resuelve **calma** salvo que la URL diga
  `?mov=pleno|ligero` (solo diagnóstico). Calma = `html.calma` + `html.mov-ligero` (aspecto estático) y NINGÚN metrónomo. Se quitaron la fila «Movim.» del panel,
  la lectura de `taisa_mov_pick`/`sessionStorage`, el vigilante de fps y `sincronizarMov_`. Medido (Chrome sin GPU, 8 operaciones + alarma): hilo principal 1 %
  (pleno 19 %, ligero 1,7 %), 0 animaciones, la pantalla cambia ~1,3 veces por segundo (solo el reloj y los cronómetros). **EN PRODUCCIÓN el 13/10 en los DOS
  deployments (v70); rollback = `--versionNumber 69`** (vuelve al perfil Auto/ligero; NUNCA ≤62: quitaría el bloqueo de «solo dashboard»). Comprobado en
  producción leyendo el HTML servido de las 5 vistas (no se pudo ver con ojos: la pestaña de Chrome de la sesión no pinta). Lo que sigue describe la v69 y cómo se
  llegó aquí.
- **Problema (queja de Pedro, 13/10, en Citrix):** con las animaciones ya visibles (v62), en Citrix se veían «a fotogramas lentos», nada fluidas. Causa: en una
  sesión remota la pantalla llega como «actualizaciones» y cada animación CSS continua obliga a mandar fotogramas sin parar (más la CPU de Chrome sin GPU).
  Medido con un banco de pruebas (Chrome sin GPU, 8 operaciones + alarma): **pleno = 185 % de CPU, 57 animaciones y la pantalla cambia ~54 veces por segundo**
  (incluso con 2 operaciones: 87 %); **ligero = 13 % de CPU, 0 animaciones y ~3 cambios por segundo**.
- **Pleno** = las animaciones de siempre (v62). **Ligero** = NINGUNA animación CSS (`html.mov-ligero *{animation:none!important;transition:none!important}`):
  un metrónomo JS (cada 800 ms, bloque `lmMov` del `<head>`) cambia `html[data-f]` entre `0` (fuerte) y `1` (atenuado) y todo parpadea a la vez: borde de las
  tarjetas por tramos (45/50/60 min), cronómetros y mensajes de alarma, banner, lámpara, programación «EN n MIN»/«+n MIN», y el marco rojo, que pasa de ser
  una capa a pantalla completa con un resplandor de 90 px a **4 tiras finas** (`.marco-alarma`: así solo cambian esos píxeles). **Calma** = nada.
- **Elección en la v69 (YA NO EXISTE):** `?mov=` en la URL > panel «Tema», fila «Movim.» (Auto / Pleno / Ligero / Quieto, guardada en `taisa_mov_pick`) > **Auto**:
  ligero si el sistema pide movimiento reducido (lo que hace Citrix) o si la página iba lenta (vigilante <26 fps dos veces), pleno en el resto. En la v70 solo
  queda `?mov=pleno|ligero` en la URL.
- **Si algún día Pedro pide volver a tener movimiento:** hacerlo opt-in (nunca por defecto), con la versión ligera en el bloque «MOVIMIENTO LIGERO» del CSS de
  `Dashboard.html`. En ligero solo cabe parpadear con `html[data-f="1"]` (opacity / border-color): nada de degradados, sombras ni transform que se muevan, y
  NINGUNA capa a pantalla completa que cambie. Las animaciones de cualquier pantalla nueva deben ir apagadas por `html.calma`.
- Los repintados periódicos siguen sin tocar el DOM si no cambió nada; el cronómetro de 1 s ya solo reescribe `className` si cambia el tramo.
- **Parámetros de la URL en Apps Script:** la página va en un iframe cuya URL NO lleva la query de fuera (`location.search` vacío): se piden con
  `google.script.url.getLocation` (ver el bloque `lmParams` del `<head>`). Probar siempre en producción, no solo en local.
- **Despliegue:** hay DOS deployments que deben ir a la misma versión: producción `AKfycby54-q25pbCrtpEUhVSNK033iE6NPEKnq3qhd-OK4Vb7VLw1oVDB6BO_leHdk9_Fx4YJA`
  y «solo dashboard» `AKfycbxkUX97zEWjzYJ48OFDqZUHGJKWaKj1gE9XGJkdkOj-nUoucUPNfEtxO68kI76KTfK3hg`. Tras `clasp deploy` la URL tarda ~20 s en servir la nueva.

---

## BLOQUEO DEL DEPLOYMENT «SOLO DASHBOARD» (v65, 2026-10-09)

- El deployment «solo dashboard» (acceso ampliado a todo Adeo) sirve **siempre** el Dashboard, sea cual sea `?view=`. Lo decide `esDeploySoloDashboard_()`
  en `CargasDescargas.gs`: busca el ID del deployment (`ID_DEPLOY_SOLO_DASHBOARD`) dentro de `ScriptApp.getService().getUrl()`.
- **Por qué fallaba antes (v1–v64):** comparaba la URL entera con la del navegador, pero `getUrl()` devuelve el mismo enlace con otro orden
  (`/a/DOMINIO/macros/s/ID/exec` en vez de `/a/macros/DOMINIO/s/ID/exec`), así que nunca coincidía y esa URL servía también terminal, Jefe y Tiendas.
  `getUrl()` sí devuelve un ID distinto en cada deployment: por eso se compara solo el ID.
- **Si se crea otro deployment ampliado, o se recrea este, hay que cambiar `ID_DEPLOY_SOLO_DASHBOARD`**; si no, se queda sin bloqueo.
- Prueba (con fetch desde Chrome ya autenticado): por la URL ampliada, sin `view` y con `view=jefe|tiendas|generix|terminal|cargas` debe salir solo el Dashboard;
  por la de producción deben seguir saliendo las 5 vistas. Marcadores en el HTML: `muellesGrid` (terminal), `alertaOps` (dashboard), `Cargas Extras` (tiendas),
  `vista-gestionar` (jefe), `grupos` (generix).
- Los 28 deployments antiguos (versiones 1–28), que llevaban el `doGet` viejo sin ningún bloqueo, se **borraron el 2026-10-09** (`clasp undeploy`, a petición de Pedro; sus
  enlaces dan 404). Las versiones siguen existiendo, pero ya no cuelgan de ninguna URL. Quedan 3 deployments: producción, «solo dashboard» y el `@HEAD` de pruebas del editor.
  El riesgo de llamar desde la consola a funciones del servidor que escriben (`executeAs` = `USER_DEPLOYING`) se cerró con v68 (ver «CIERRE DE LAS FUNCIONES QUE ESCRIBEN»).

---

## DIÁLOGOS PROPIOS, NUNCA NATIVOS (v66, 2026-10-09)

- **Regla de Pedro (2026-10-05): nunca `alert()` / `confirm()` / `prompt()` del navegador, en ninguna app.** Siempre un cuadro dentro de la página.
  Búsqueda de control: `\b(alert|confirm|prompt)\s*\(` en `src/*.html` debe dar 0 (los `SpreadsheetApp.getUi().alert(...)` de los `.gs` son avisos del menú del
  Sheet, no del navegador, y se quedan).
- **Dónde:** `Jefe.html` (anular transporte + avisos de error / lista desactualizada) y `cargas.html` (cancelar operación). Tiendas, Dashboard y Generix no usaban.
- **Cómo:** `#modalAviso` (HTML) + helpers `mostrarAviso` / `avisar(texto,titulo)` (un botón «Entendido») / `confirmarModal(...)` (dos botones; el foco empieza en el
  seguro: Cancelar / Volver). Escape y pulsar fuera = descartar (no ejecuta la acción); Tab no sale del cuadro. Su clic-fuera tiene manejador propio y se excluye del
  genérico de `.modal-bg` con `:not(#modalAviso)`. Texto siempre con `textContent` (nada de `innerHTML`). En `cargas.html` el aviso lleva z-index 80 para quedar por
  encima de «Finalizar». **La acción de anular no cambió** (mismos argumentos a `jefeAnularEnB2B`, mismo refresco).
- **Si añades otra pantalla con avisos o confirmaciones: copiar este bloque**, no volver a los nativos. Cada página lleva su copia (no hay `include`).
- `Jefe.html` en móvil estrecho (≤480 px): la barra fecha + «Añadir transporte» pasa a dos líneas (antes ensanchaba la página a 402 px y descentraba los cuadros).
- **Prueba hecha (Chrome real + puppeteer-core, `google.script.run` simulado):** cancelar/Escape/fuera no llaman al servidor; confirmar sí, con los argumentos exactos;
  el error del servidor y el fallo de red salen en el cuadro; 0 diálogos nativos y 0 errores de JS. No se pulsó «Anular» en producción (anularía un transporte real).
- **Despliegue:** v66 en los DOS deployments. Rollback = `--versionNumber 65` (no 62: quitaría el bloqueo de «solo dashboard»).

---

## CIERRE DE LAS FUNCIONES QUE ESCRIBEN (v68, 2026-10-09; EN PRODUCCIÓN en los DOS deployments)

- **Problema:** en Apps Script cualquier función global cuyo nombre **no termina en `_`** se puede llamar desde la consola del navegador con
  `google.script.run`. Quien entre por el deployment «solo dashboard» (todo Adeo) ve solo el Dashboard, pero desde su consola podría llamar a
  `iniciarOperacion`, `jefeAnularEnB2B`, `anadirCargaExtra`, `probarCorreo`, `instalarTriggerInformeSemanal`… (se ejecutan como el dueño del script).
  Ojo: **un `_` al principio NO las hace privadas** (`_hoja`, `_enviarCorreoGestion`… eran públicas); lo que cuenta es el `_` final.
- **Qué hace el cierre:** `exigirNoSoloDashboard_();` como **primera línea** de las 22 funciones que escriben hojas, mandan correo o tocan disparadores
  (lista `CERRADAS` de `comprobar_cierre.js`). Bloquea con `Acción no disponible desde esta dirección.` (antes de tocar nada) **solo si** la llamada llega por
  el deployment «solo dashboard» **y** quien llama no es el dueño del script (`EMAIL_DUENO_SCRIPT`). Por producción nunca bloquea. `_hoja` → `hoja_` y
  `_hojaProgr` → `hojaProgr_` (privadas: las usan también las lecturas del Dashboard, que no pueden cerrarse).
- **Medido el 2026-10-09 con una versión de prueba (v67, ya retirada) en el deployment «solo dashboard» y en `/dev`:**
  - Dentro de una llamada `google.script.run`, `getUrl()` devuelve la dirección del deployment que atiende la llamada (dashboard → la del dashboard; `/dev` → la
    suya, aunque el dashboard fuera el último actualizado). **Fiable.** En el dashboard una función cerrada se bloqueó y `obtenerDashboard` funcionó.
  - En un **disparador** `getUrl()` devuelve una dirección cualquiera: una vez la del dashboard y otra la de un despliegue antiguo (`AKfycbyHk-0i8Y…`). **No fiable.**
    Editor y menú del Sheet se suponen iguales. Por eso el dueño queda exento: sus herramientas manuales (`probar*`, `formatearRegistros`…) no se rompen.
  - Solo se pudo comprobar el caso «dueño» en vivo (quien probó era el dueño); el caso «visitante bloqueado» se prueba con la simulación de `comprobar_cierre.js`.
  - Cuidado al probar: Apps Script solo admite **20 deployments versionados**. Con ~31 no se podía crear ninguno nuevo (por eso la prueba se hizo con una versión temporal en un
    deployment existente, restaurándolo después y restaurando también el HEAD); desde el 2026-10-09 hay solo 2 versionados, así que ya se pueden crear deployments de prueba
    nuevos (con `clasp deploy` sin `--deploymentId`) y borrarlos con `clasp undeploy <id>`. Un deployment de prueba lleva el código completo con el mismo acceso que producción: borrarlo al terminar.
- **Abiertas a propósito:** (1) las de la lista `LECTURAS` (plan del día del B2B, estado, configuración, eventos de Generix, diagnósticos que solo registran, y
  `filtrarHoy`/`quitarFiltro`, que solo cambian el filtro de vista y usan otros editores): revelan datos de operativa a quien abra la consola; cerrarlas es
  opcional (moverlas a `CERRADAS`). (2) `enviarInformeSemanal`, el disparador real: no se pudo comprobar a quién pertenece el disparador sin esperar a que salte,
  y cerrarlo arriesga el informe; lo peor que puede hacer un visitante es mandarlo otra vez a la lista de administración.
  Los usuarios que no sean el dueño y usen `formatearRegistros` / `migrarFechaEntrega` desde el menú del Sheet verán el mensaje de bloqueo **solo** si getUrl() da la del
  dashboard en el menú (no medido).
- **Antes de CADA despliegue, desde la raíz del proyecto: `node comprobar_cierre.js`.** Falla si hay una función pública sin clasificar, si una cerrada no empieza
  por el guard o una abierta lo lleva, si el Dashboard puede llegar a una cerrada, si el ID del deployment o el correo del dueño del código no son los reales, o si la
  simulación (cada combinación de dirección y persona) o `doGet` no dan lo esperado. Probado con 15 mutaciones del código (todas detectadas).
  **Si añades una función pública nueva: ponla en una lista** (si escribe, con el guard como primera línea).
- **Falla abierto:** si `getUrl()` lanzara error o devolviera vacío, no se bloquea nada (para no parar a los operarios).
- **Desplegado (v68):** primero «solo dashboard», comprobado con fetch (11 variantes de `?view=` + `?autoprueba=1`: siempre solo el Dashboard); después producción
  (5 pantallas + vista inventada sirven lo esperado). Además se ejecutaron las 77 funciones del código con servicios simulados: 0 referencias rotas tras el renombrado
  `_hoja`→`hoja_`. **Rollback = `--versionNumber 66`** (quita el cierre; NO volver a la 62 ni anteriores: quitaría también el bloqueo de las pantallas). **No se pudo ver
  con ojos** (las capturas de las pantallas animadas se cuelgan en el Chrome de la sesión): tras el despliegue, que Pedro abra el terminal y haga una operación normal.
  **Si otra sesión sube con `clasp push` desde la carpeta de trabajo, debe partir de una rama que ya lleve este cierre** (está en `main`); si no, lo borraría.
- Los antiguos deployments (versiones 1–28) ya no existen (borrados el 2026-10-09): el cierre protege los dos vivos, que son los únicos con URL pública.
