# Contexto Completo — App Cargas/Descargas Plataforma Málaga

## Resumen Ejecutivo
Sistema de gestión de cargas/descargas para TAISA (operador logístico de Leroy Merlin Málaga). Hecho en **Google Apps Script + Google Sheets**. **EN PRODUCCIÓN**, uso diario en 11 muelles.

**URLs actuales (2026-06-25):**
```
Terminal:  https://script.google.com/a/macros/ext.leroymerlin.es/s/AKfycby54-q25pbCrtpEUhVSNK033iE6NPEKnq3qhd-OK4Vb7VLw1oVDB6BO_leHdk9_Fx4YJA/exec
Dashboard: https://script.google.com/a/macros/ext.leroymerlin.es/s/AKfycby54-q25pbCrtpEUhVSNK033iE6NPEKnq3qhd-OK4Vb7VLw1oVDB6BO_leHdk9_Fx4YJA/exec?view=dashboard
Tiendas:   https://script.google.com/a/macros/ext.leroymerlin.es/s/AKfycby54-q25pbCrtpEUhVSNK033iE6NPEKnq3qhd-OK4Vb7VLw1oVDB6BO_leHdk9_Fx4YJA/exec?view=tiendas
Jefe:      https://script.google.com/a/macros/ext.leroymerlin.es/s/AKfycby54-q25pbCrtpEUhVSNK033iE6NPEKnq3qhd-OK4Vb7VLw1oVDB6BO_leHdk9_Fx4YJA/exec?view=jefe
```

---

## Arquitectura

### Stack
- **Backend:** Google Apps Script (GAS) + Google Sheets
- **Frontend:** HTML5 + CSS + Vanilla JS (sin frameworks)
- **Persistencia:** Google Sheets (hojas EnCurso + Registros) + Drive (fotos)
- **Integración externa:** Google Sheet B2B (documento compartido, datos de transportes)
- **Notificaciones:** Google Chat (webhooks)

### Archivos principales

| Archivo | Descripción |
|---------|---|
| `CargasDescargas.gs` | Núcleo: routing (`doGet`), FASE 1 (iniciar), FASE 2 (finalizar), foto a Drive, formato de hoja |
| `B2B.gs` | Integración con documento B2B: leer plan, casar filas, rellenar datos |
| `GestionJefe.gs` | Correos a administración y correo Mijas 6:30; funciones de prueba |
| `Programacion.gs` | Solicitudes de carga extra desde tiendas |
| `cargas.html` | Terminal de muelles (operarios, 2 fases, modal de horas) |
| `Dashboard.html` | Monitor TV 16:9, refresco 30s, KPIs |
| `Tiendas.html` | Formulario solicitud carga extra |
| `Jefe.html` | 2 tabs: Seguimiento (semáforo) + Gestionar (añadir/anular transportes) |
| `appsscript.json` | Manifiesto (timezone, scopes, webapp) |

---

## Configuración Clave

### IDs y constantes (CargasDescargas.gs)

```javascript
const CONFIG_CARGAS = {
  SPREADSHEET_ID: '',                 // '' = hoja activa (Sheet del script)
  HOJA_REG: 'Registros',              // operaciones completadas
  HOJA_CURSO: 'EnCurso',              // operaciones abiertas (en vivo)
  CARPETA_RAIZ_NOMBRE: 'Cargas y Descargas Plataforma',
  ZONA_HORARIA: 'Europe/Madrid'
};

const OPERARIOS_CARGAS = ['Manuel Rosas', 'Sergio Sánchez', 'Ángel Alcázar', 'Antonio Sánchez'];

// Destinos con horas de entrega/recepción (modal del usuario)
const DESTINOS_CARGAS = {
  tiendas: { 'Málaga': ['6:00', '7:00', '18:00', '00:00'], 'Marbella': [...], 'Mijas': [...], 'Granada': [] },
  plataformas: { 'Valencia': [...], 'Torija': [...], 'Meco': [...], 'Antequera': [] },
  agencias: ['Remansur', 'Correcaminos Granada'],
  soloDescarga: ['Granada']  // solo se descargan, nunca se cargan
};

const MUELLES_CARGAS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const FLUJOS_CARGAS = ['LS', 'CC', 'SIE', 'Inversa'];
```

### B2B (B2B.gs)

```javascript
const CONFIG_B2B = {
  SHEET_ID: '1HIYNp2SSpXbIvwfRpFcHI7y4rqZqcrEUu8d-_4WTpeY',  // documento B2B externo
  HOJA: 'AUTO',   // auto-detecta mes actual (ej. "Junio 2026")
  PRIMERA_FILA_DATOS: 3
};

// Mapeo: app -> B2B
const MAPA_B2B = {
  'Málaga': 'LM Málaga',
  'Marbella': 'LM Marbella',
  'Mijas': 'LM Mijas',
  'Granada': 'LM Granada',
  'Valencia': 'Plataforma Valencia',
  'Torija': 'Plataforma Torija',
  'Meco': 'Plataforma Meco',
  'Antequera': 'Plataforma Antequera',
  'Remansur': 'Remansur',
  'Correcaminos Granada': 'Correcaminos Granada'
};
```

### Correos (GestionJefe.gs)

```javascript
const CONFIG_CORREO = {
  ADMINISTRACION: [
    'pedro.gil@ext.leroymerlin.es',
    'david.delcampo@ext.leroymerlin.es',
    'jose-manuel.lachambre@leroymerlin.es',
    'jose-antonio.alcaide@ext.leroymerlin.es',
    'administracion.alm-malaga@leroymerlin.es',
    'daniel.simo@ext.leroymerlin.es',
    'daniel.arrastio@ext.leroymerlin.es',
    'francisco-javier.camara@ext.leroymerlin.es',
    'sebastian.gelvis@ext.leroymerlin.es'
  ],
  MIJAS_0630: [
    'manuel.gueto@leroymerlin.es',
    'salvador.gonzalez2@leroymerlin.es',
    'hector.andres@leroymerlin.es',
    'carlos.fuentes@leroymerlin.es',
    'vicente.amador@leroymerlin.es',
    'javier-jesus.roman@leroymerlin.es'
  ],
  REMITENTE_NOMBRE: 'Plataforma Málaga - TAISA'
};
```

---

## Estructura de Datos

### Hoja EnCurso (10 columnas)
```
ID | Muelle | Cargador | Tipo | Categoría | Destino/Origen | Hora entrega/recepción | Hora comienzo (ISO) | Foto descarga | Fecha carga
```
- **Uso:** operaciones abiertas (FASE 1 completa, esperando FASE 2)
- **Ciclo:** crear al iniciar → borrar al finalizar

### Hoja Registros (17 columnas)
```
ID | Fecha | Muelle | Cargador | Tipo | Categoría | Destino/Origen |
Hora comienzo | Hora fin | Duración (min) | Hora entrega/recepción | Fecha entrega/recepción |
Hora YMS | Flujo | Nº soportes | Matrícula | Enlace foto
```
- **Uso:** histórico completo de operaciones (auditoría + KPIs)
- **Cambio reciente (2026-06-25):** columna 12 "Fecha entrega/recepción" añadida
  - Cargas: fecha elegida en modal (puede ser mañana si se adelanta)
  - Descargas: fecha del día (hoy)
  - Migración: función `migrarFechaEntrega()` en menú 📦 App Cargas

### B2B (documento externo)
- **Origen:** sistema YMS externo
- **Hojas:** por mes (`"Junio 2026"`, `"Julio 2026"`, etc.)
- **Casado:** por fecha + tipo (Carga/Descarga) + destino/origen + hora
  - Cargas: casa por col G (Hora posicionamiento)
  - Descargas: casa por col E (Hora cita)
- **Rellena:** cols H-K (comienzo, fin, flujo, soportes), AF (SIE), AT (Anulado/Añadido)

---

## Flujos Principales

### 1. Terminal Operario (cargas.html)

**FASE 1 - Iniciar:**
1. Seleccionar muelle (2-12) — valida que no esté ya ocupado
2. Seleccionar cargador (4 fijos o texto libre) — valida que no esté en otro muelle
3. Tipo: Carga o Descarga
4. Destino/Origen (tienda/plataforma/agencia)
5. **Modal de horas:** lista desde B2B (transportes pendientes ese día + navegación de días)
   - Descarga: foto AHORA (camión lleno que llega)
   - Carga: foto DESPUÉS (al cerrar)
6. **Fecha carga (solo cargas):** para adelantar (hoy/mañana/próximos días)

**FASE 2 - Finalizar:**
1. Flujos: checkbox (LS, CC, SIE, Inversa)
2. Nº soportes (número)
3. Matrícula (solo cargas)
4. Foto (solo cargas, ahora)
5. Botón "Cerrar" → cálculo de duración → escribe en Registros + B2B + Drive

**Validaciones:**
- Un muelle no puede estar ocupado 2 veces simultáneamente
- Un cargador no puede operar 2 muelles a la vez
- La hora elegida se bloquea (no se puede repetir ese día para ese destino)

### 2. Dashboard TV (Dashboard.html)
- **Modo mañana** (< 14:00): estado de la extracción en curso, siluetas restantes
- **Modo tarde** (≥ 14:00): KPIs grandes, círculos de progreso por flujo
- **Refresco:** cada 30s vía `obtenerDashboard()`
- **No editable:** solo lectura

### 3. Pantalla Jefe (Jefe.html)

**Tab Seguimiento:**
- Semáforo: dos columnas (Cargas verde | Descargas ámbar)
- Contadores: Pendientes | En curso | Hechas
- Lista completa por estado
- Selector de fecha (para histórico)

**Tab Gestionar:**
- **Añadir:** tienda destino + fecha + hora (automático: Carga/Expedición desde Plataforma Málaga)
  - Inserción inteligente debajo de la última fila de esa tienda
  - Correo a ADMINISTRACION
- **Anular:** marca col AT = "Anulado", tacha la fila, correo a ADMINISTRACION
  - Solo muestra transportes ACTIVOS (pendientes/en curso)

### 4. Tiendas (Tiendas.html)
- Formulario: tienda + destino + fecha + hora + comentarios
- Envía correo a ADMINISTRACION con solicitud de carga extra

---

## Flujos Especiales

### Adelantar cargas
Permite cargar **hoy** un pedido cuya **entrega es mañana** (Málaga, Mijas).
- Modal presenta los transportes del día SIGUIENTE
- Usuario elige uno → guarda `fechaCarga = "dd/MM/yyyy"` (mañana)
- Al cerrar, `escribirEnB2B()` casa la fila de mañana en el B2B (puede estar en otro mes)

### Correo Mijas 6:30
- **Dispara cuando:** carga a Mijas con hora 6:30 (normaliza `'6:30'` y `'06:30'`)
- **Destinatarios:** 6 personas de tienda Mijas
- **Contenido:** destino, fecha de entrega (día siguiente laborable si es viernes), hora 06:30, soportes, flujo, foto adjunta
- **Funciones de prueba:**
  - `probarCorreoMijas()` — datos ficticios
  - `reenviarCorreoMijasUltimo()` — última carga de Mijas real de Registros

### Correos administración
- Jefe añade transporte → ADMINISTRACION (9 personas)
- Jefe anula transporte → ADMINISTRACION (9 personas)
- Tienda pide carga extra → ADMINISTRACION (9 personas)
- **Cada correo muestra:** "Fecha del transporte" (día del camión) y "Registrado el" (cuándo se hizo)

---

## Bugs Resueltos (no reintroducir)

### Bug fechas (RESUELTO)
**Problema:** Google Sheets convertía `"18/06/2026"` a Date con hora. Validación regex fallaba → cargas adelantadas se escribían en fila equivocada.
**Solución:** Pre-formatear columna como texto `@` ANTES de escribir + `flush()`. Al leer, reconvertir con `Utilities.formatDate` si viene como Date.

### Bug carga adelantada no rellena B2B (RESUELTO)
**Problema:** `escribirEnB2B()` casaba solo por DESTINO (cargas) pero exigía ADEMÁS col ORIGEN = "Plataforma Málaga". Filas futuras suelen tener origen vacío → no casaban.
**Solución:** `escribirEnB2B()` casa solo por DESTINO (cargas) o ORIGEN (descargas), sin exigir redundancia. Salta filas marcadas `Anulado` (col AT).

---

## Cambios Recientes (2026-06-25)

### Columna "Fecha entrega/recepción" en Registros
- **Qué:** nueva columna 12 entre "Hora entrega/recepción" y "Hora YMS"
- **Valor:**
  - **Cargas:** fecha elegida en modal (puede ser mañana si se adelanta)
  - **Descargas:** hoy (fecha de la operación)
- **Cómo aplicar a hojas existentes:** menú 📦 App Cargas → "Migrar: añadir columna Fecha entrega"
- **Código:** función `migrarFechaEntrega()` en `CargasDescargas.gs`, línea ~428

---

## Reglas de Código

1. **Backend GAS:** NO template literals (backticks). Usar concatenación `+`.
2. **Front → Backend:** SIEMPRE `google.script.run`, nunca fetch.
3. **Leer Sheets:** usar `getValues()` en bloque, nunca celda a celda en loops.
4. **Diseño:** dark mode, rojo TAISA `#e30613`, fuentes Bebas Neue + DM Sans, Font Awesome.
5. **Despliegue:** crear "Nueva versión" (NO nueva implementación) para mantener URL.
6. **Formato de fechas:** pre-formateado `@` (texto) para evitar conversiones de Sheets.
7. **Verificar:** balance de llaves/paréntesis tras cada edición.

---

## Cómo Desplegar (clasp)

```bash
# Instalar clasp
npm install -g @google/clasp

# Login (abre navegador, dominio corporativo)
clasp login

# Subir cambios
clasp push

# IMPORTANTE: En el editor de Apps Script:
# Implementar → Gestionar implementaciones → lápiz → Nueva versión
# (NO crear nueva implementación, que cambia la URL)
```

---

## Estado Actual

- ✅ Operativo en producción (muelles, tiendas, jefe, dashboard)
- ✅ Integración B2B funcional (casado, adelantos, cross-mes)
- ✅ Correos automáticos (admin, Mijas 6:30)
- ✅ Foto a Drive (descarga al iniciar, carga al finalizar)
- ✅ Dashboard TV con refresco 30s
- ✅ Columna "Fecha entrega/recepción" recién añadida (migración manual disponible)
- 🔍 Logs `[B2B]` y `[Mijas check]` activos (para diagnóstico; se pueden retirar tras confirmar varios cierres reales)

---

## Contactos Clave

- **Admin sistema:** Pedro Gil (define requisitos, valida, mantiene mapa mental)
- **Operarios:** Manuel Rosas, Sergio Sánchez, Ángel Alcázar, Antonio Sánchez
- **Destinos:** Málaga, Marbella, Mijas, Granada, Valencia, Torija, Meco, Antequera, Remansur, Correcaminos Granada
- **Correos:** 9 de administración, 6 de Mijas (ver CONFIG_CORREO)

---

## Para Iniciar Nueva Sesión

1. Lee este archivo (`CONTEXT.md`)
2. Lee `CLAUDE.md` (contexto del proyecto)
3. Pregunta qué tarea necesitas, referencia archivo/línea si es necesario
4. El código vivo está en `src/` (5 .gs + 4 .html + appsscript.json)
