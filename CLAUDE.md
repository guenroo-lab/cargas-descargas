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
