/**
 * B2B.gs
 * Rellena automáticamente la fila correspondiente del documento B2B
 * (Google Sheet en Drive, con hojas por meses) cuando se cierra una operación.
 *
 * Se llama desde finalizarOperacion() en CargasDescargas.gs
 *
 * EMPAREJAMIENTO de la fila:
 *   Fecha (A) + Tipo operación (B) + Origen (C) + hora:
 *     - Recepción (descarga): casa con col E (Hora cita)
 *     - Expedición (carga):   casa con col G (Hora posicionamiento)
 *
 * RELLENA:  H (comienzo), I (finalización), J (flujos), K (nº soportes)
 *           AF (nº palets SIE) -> solo descargas con flujo SIE
 */

// ===================== CONFIGURACIÓN B2B =====================
const CONFIG_B2B = {
  SHEET_ID: '1HIYNp2SSpXbIvwfRpFcHI7y4rqZqcrEUu8d-_4WTpeY',   // ID del Google Sheet del B2B
  HOJA: 'AUTO',                           // 'AUTO' = "Mes Año" del día actual
  PRIMERA_FILA_DATOS: 3,                  // fila 1 y 2 son cabeceras
  TOLERANCIA_HORA_MIN: 2                  // margen al casar horas (minutos)
};

// Columnas del B2B (1 = A)
const COL_B2B = {
  FECHA: 1, TIPO: 2, ORIGEN: 3, DESTINO: 4,
  HORA_CITA: 5, HORA_LLEGADA: 6, HORA_POSIC: 7,
  HORA_COMIENZO: 8, HORA_FIN: 9, FLUJO: 10, PALETS: 11,
  PALETS_RECEP: 28, // AB = Nº Palets en recepciones (descargas)
  SIE_RECEP: 32, // AF = Nº Palets SIE recepcionados
  ESTADO_JEFE: 46 // AT = marca del jefe: 'Anulado' / 'Añadido' (columna libre, fuera de datos)
};

// Mapa de destinos/orígenes de la app -> nomenclatura del B2B.
// Normalmente el mismo nombre sirve para carga (col Destino) y descarga (col Origen).
// Torija es la excepción: el YMS usa un nombre distinto según la dirección
// -> objeto {carga, descarga} en vez de un string simple. Ver _lugarB2B().
const MAPA_B2B = {
  'Málaga':   'LM Málaga',
  'Marbella': 'LM Marbella',
  'Mijas':    'LM Mijas',
  'Granada':  'LM Granada',
  'Valencia':  'Plataforma Valencia',
  'Torija':    { carga: 'CL TORIJA', descarga: 'Plataforma Torija' },
  'Meco':      'Plataforma Meco',
  'Antequera': 'Plataforma Antequera',
  'Remansur':             'Remansur',
  'Correcaminos Granada': 'Correcaminos Granada'
};

// Resuelve el nombre B2B de un destino/origen de la app según la dirección
// (carga = col Destino, descarga = col Origen). Soporta tanto un string simple
// como un objeto {carga, descarga} para los casos (Torija) que difieren.
function _lugarB2B(destinoApp, esCarga) {
  const m = MAPA_B2B[destinoApp];
  if (m && typeof m === 'object') return (esCarga ? m.carga : m.descarga) || destinoApp;
  return m || destinoApp;
}
const PLATAFORMA_PROPIA = 'Plataforma Málaga';

// La marca de anulado ahora lleva fecha/hora ("Anulado 21/08 14:32") para poder
// distinguir a simple vista una cancelación real de hoy de una marca vieja
// arrastrada por copiar/pegar la fila de un día anterior como plantilla. Las
// filas antiguas siguen teniendo el texto plano "Anulado" sin fecha: por eso
// se comprueba el PREFIJO, no la igualdad exacta.
function _esAnulado(marcaJefe) {
  return String(marcaJefe || '').trim().indexOf('Anulado') === 0;
}

// ── Traducción de flujos de la app a los valores EXACTOS del B2B ──
// La columna J del B2B tiene validación estricta. Solo se permiten:
//   Arrastre, Inversa, Inversa+SIE, PC, PC+Inversa, PC+SIE, PC+SIE+Inversa,
//   SIE, Carga, Carga + SIE, Carga + PC
// Equivalencia base: LS->Carga, CC->PC, SIE->SIE, Inversa->Inversa
// Regla: descarga de plataforma = 'Arrastre' (ignora el resto)
function _flujoB2B(flujosApp, esCarga, categoria) {
  // Descarga (recepción) de plataforma -> siempre Arrastre
  if (!esCarga && categoria === 'plataforma') return 'Arrastre';

  // Traducir cada flujo de la app a su equivalente B2B
  var set = {};
  (flujosApp || []).forEach(function(f) {
    var x = String(f).toUpperCase().trim();
    if (x === 'LS') set['Carga'] = true;
    else if (x === 'CC') set['PC'] = true;
    else if (x === 'SIE') set['SIE'] = true;
    else if (x === 'INVERSA') set['Inversa'] = true;
  });
  var tieneCarga = set['Carga'], tienePC = set['PC'], tieneSIE = set['SIE'], tieneInv = set['Inversa'];

  // Mapear la combinación al valor EXACTO permitido en el B2B
  // Combinaciones con Carga (LS)
  if (tieneCarga && tieneSIE) return 'Carga + SIE';
  if (tieneCarga && tienePC)  return 'Carga + PC';
  if (tieneCarga)             return 'Carga';
  // Combinaciones con PC (CC)
  if (tienePC && tieneSIE && tieneInv) return 'PC+SIE+Inversa';
  if (tienePC && tieneSIE)             return 'PC+SIE';
  if (tienePC && tieneInv)             return 'PC+Inversa';
  if (tienePC)                         return 'PC';
  // Combinaciones con Inversa
  if (tieneInv && tieneSIE) return 'Inversa+SIE';
  if (tieneInv)             return 'Inversa';
  // Solo SIE
  if (tieneSIE) return 'SIE';
  // Si nada casa, devolver vacío (no escribe nada y evita el error de validación)
  return '';
}

// ── 'HH:mm' -> fracción de día (0.25 = 06:00) ────────────────────
function _horaAFraccion(horaStr) {
  if (!horaStr) return '';
  const p = String(horaStr).split(':');
  if (p.length < 2) return '';
  return ((Number(p[0]) || 0) * 60 + (Number(p[1]) || 0)) / 1440;
}

// ── Cualquier valor de hora del B2B -> minutos del día ───────────
// Acepta number (fracción), Date, o string "HH:mm"
function _aMinutos(v, tz) {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'number') return Math.round(v * 1440);
  if (v instanceof Date) return v.getHours() * 60 + v.getMinutes();
  const p = String(v).split(':');
  if (p.length >= 2) return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0);
  return null;
}

// ── Nombre de la hoja del mes actual ─────────────────────────────
function _nombreHojaB2B() {
  if (CONFIG_B2B.HOJA !== 'AUTO') return CONFIG_B2B.HOJA;
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const n = new Date();
  return meses[n.getMonth()] + ' ' + n.getFullYear();
}

/**
 * Rellena la fila del B2B correspondiente a una operación cerrada.
 * @param op     fila de EnCurso [id,muelle,cargador,tipo,cat,destino,horaEntrega,inicioISO]
 * @param inicio Date comienzo
 * @param fin    Date finalización
 * @param datos  {flujos:[], soportes, matricula, siePalets}
 */
function escribirEnB2B(op, inicio, fin, datos) {
  try {
    if (!CONFIG_B2B.SHEET_ID || CONFIG_B2B.SHEET_ID.indexOf('PEGA_AQUI') === 0) {
      return { ok: false, mensaje: 'B2B sin configurar (falta SHEET_ID).' };
    }
    const ss = SpreadsheetApp.openById(CONFIG_B2B.SHEET_ID);

    const tz = CONFIG_CARGAS.ZONA_HORARIA;
    const tipo    = op[3];               // Carga / Descarga
    const destino = op[5];               // destino/origen de la app
    const esCarga = (tipo === 'Carga');
    const tipoB2B = esCarga ? 'Expedición' : 'Recepción';

    // Fecha objetivo: si la carga se adelantó, usar datos.fechaCarga (dd/MM/yyyy); si no, hoy
    var fechaObjetivo;
    Logger.log('[B2B] datos.fechaCarga=' + String(datos.fechaCarga || '') + ' | tipo=' + tipo + ' | destino=' + destino);
    if (datos.fechaCarga && /^\d{2}\/\d{2}\/\d{4}$/.test(datos.fechaCarga)) {
      const pf = datos.fechaCarga.split('/');
      fechaObjetivo = new Date(Number(pf[2]), Number(pf[1]) - 1, Number(pf[0]));
      Logger.log('[B2B] fechaObjetivo calculada: ' + Utilities.formatDate(fechaObjetivo, tz, 'dd/MM/yyyy'));
    } else {
      fechaObjetivo = fin;
      Logger.log('[B2B] fechaCarga vacía/inválida, usando fin (hoy): ' + Utilities.formatDate(fin, tz, 'dd/MM/yyyy'));
    }

    // Abrir la hoja del MES de la fecha objetivo (no siempre el mes actual)
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const nombreHojaObj = meses[fechaObjetivo.getMonth()] + ' ' + fechaObjetivo.getFullYear();
    const hoja = ss.getSheetByName(nombreHojaObj);
    if (!hoja) return { ok: false, mensaje: 'No existe la hoja "' + nombreHojaObj + '" en el B2B.' };

    // Lugar (tienda/agencia) con el que casar la fila. En CARGA (expedición) la tienda
    // está en DESTINO (col D); en DESCARGA (recepción) está en ORIGEN (col C).
    // Casamos SOLO por este lugar, igual que el modal del terminal (getCargasPendientesB2B).
    const lugarObjetivo = _lugarB2B(destino, esCarga);

    // Hora con la que casar y minutos objetivo
    // Recepción -> col E (hora cita) | Expedición -> col G (posicionamiento)
    const colHoraMatch = esCarga ? COL_B2B.HORA_POSIC : COL_B2B.HORA_CITA;
    const minObjetivo  = _aMinutos(_horaAFraccion(op[6]), tz); // hora elegida al iniciar

    const fechaHoy = Utilities.formatDate(fechaObjetivo, tz, 'dd/MM/yyyy');
    const hoyDia = fechaObjetivo.getDate(), hoyMes = fechaObjetivo.getMonth(), hoyAnio = fechaObjetivo.getFullYear();

    // Leer todo el rango de datos para buscar la fila
    const ultima = hoja.getLastRow();
    if (ultima < CONFIG_B2B.PRIMERA_FILA_DATOS) {
      return { ok: false, mensaje: 'El B2B no tiene filas de datos en ' + _nombreHojaB2B() + '.' };
    }
    const nFilas = ultima - CONFIG_B2B.PRIMERA_FILA_DATOS + 1;
    // Leemos hasta la columna ESTADO_JEFE (AT) para poder saltar filas anuladas.
    const datosHoja = hoja.getRange(CONFIG_B2B.PRIMERA_FILA_DATOS, 1, nFilas, COL_B2B.ESTADO_JEFE).getValues();

    let filaEncontrada = -1;
    for (let i = 0; i < datosHoja.length; i++) {
      const f = datosHoja[i];
      // Fecha: comparar como Date real (día/mes/año), sin depender del formato de celda
      const celdaFecha = f[COL_B2B.FECHA - 1];
      let coincideFecha = false;
      if (celdaFecha instanceof Date) {
        coincideFecha = (celdaFecha.getDate() === hoyDia &&
                         celdaFecha.getMonth() === hoyMes &&
                         celdaFecha.getFullYear() === hoyAnio);
      } else {
        coincideFecha = (String(celdaFecha).trim() === fechaHoy);
      }
      if (!coincideFecha) continue;
      // Tipo
      if (String(f[COL_B2B.TIPO - 1]).trim() !== tipoB2B) continue;
      // Lugar: CARGA -> tienda en DESTINO (col D); DESCARGA -> tienda en ORIGEN (col C).
      // NO exigimos el origen "Plataforma Málaga" en las cargas: las filas de días
      // futuros suelen tener ese campo vacío o escrito distinto, y por eso la carga
      // adelantada (p.ej. Mijas de mañana) no encontraba su fila aunque sí aparecía
      // en el terminal. Usamos el MISMO criterio que getCargasPendientesB2B.
      const lugarFila = esCarga ? String(f[COL_B2B.DESTINO - 1]).trim() : String(f[COL_B2B.ORIGEN - 1]).trim();
      if (lugarFila !== lugarObjetivo) continue;
      // Saltar filas anuladas por el jefe
      if (_esAnulado(f[COL_B2B.ESTADO_JEFE - 1])) continue;
      // Hora
      const minFila = _aMinutos(f[colHoraMatch - 1], tz);
      if (minObjetivo === null || minFila === null) continue;
      if (Math.abs(minFila - minObjetivo) > CONFIG_B2B.TOLERANCIA_HORA_MIN) continue;
      // ¿ya rellena? (si col H ya tiene hora comienzo, saltar para no pisar)
      if (f[COL_B2B.HORA_COMIENZO - 1] !== '' && f[COL_B2B.HORA_COMIENZO - 1] !== null) continue;

      filaEncontrada = CONFIG_B2B.PRIMERA_FILA_DATOS + i;
      break;
    }

    if (filaEncontrada === -1) {
      Logger.log('[B2B] No encontrada fila para: tipo=' + tipoB2B + ' lugar=' + lugarObjetivo + ' fecha=' + fechaHoy + ' hora=' + op[6]);
      return { ok: false, mensaje: 'No se encontró fila libre en B2B para ' + tipoB2B + ' ' + lugarObjetivo + ' ' + (op[6] || '') + '.' };
    }
    Logger.log('[B2B] Fila encontrada: ' + filaEncontrada);

    // Rellenar las casillas
    const flujoTxt = _flujoB2B(datos.flujos, esCarga, op[4]); // op[4] = categoria
    const soportes = Number(datos.soportes) || 0;

    hoja.getRange(filaEncontrada, COL_B2B.HORA_COMIENZO).setValue(_horaAFraccion(Utilities.formatDate(inicio, tz, 'HH:mm'))).setNumberFormat('hh:mm');
    hoja.getRange(filaEncontrada, COL_B2B.HORA_FIN).setValue(_horaAFraccion(Utilities.formatDate(fin, tz, 'HH:mm'))).setNumberFormat('hh:mm');
    if (flujoTxt) hoja.getRange(filaEncontrada, COL_B2B.FLUJO).setValue(flujoTxt);
    // Cargas (expedición) -> col K. En DESCARGAS (recepción) NO se escribe nada de
    // palets: ni AB (PALETS_RECEP) ni AF (SIE_RECEP) — petición de Pedro (2026-09-21),
    // esas columnas las rellena otro equipo. H, I y J sí se siguen escribiendo.
    if (esCarga) hoja.getRange(filaEncontrada, COL_B2B.PALETS).setValue(soportes);

    // Leer la hora del YMS (columna F) de esta fila, para copiarla a Registros
    var horaYMS = '';
    try {
      const celdaYMS = hoja.getRange(filaEncontrada, COL_B2B.HORA_LLEGADA).getValue();
      if (celdaYMS instanceof Date) horaYMS = Utilities.formatDate(celdaYMS, tz, 'HH:mm');
      else if (celdaYMS !== '' && celdaYMS !== null) horaYMS = String(celdaYMS);
    } catch (eY) { horaYMS = ''; }

    return { ok: true, fila: filaEncontrada, horaYMS: horaYMS };
  } catch (e) {
    return { ok: false, mensaje: 'Error B2B: ' + e.message };
  }
}


// ===================== DIAGNÓSTICO =====================
// Ejecuta esta función manualmente desde el editor para ver qué lee del B2B.
// Mira el resultado en Ver -> Registro de ejecución.
function diagnosticarB2B() {
  try {
    Logger.log('SHEET_ID: ' + CONFIG_B2B.SHEET_ID);
    const ss = SpreadsheetApp.openById(CONFIG_B2B.SHEET_ID);
    Logger.log('Documento abierto: ' + ss.getName());

    const hojas = ss.getSheets().map(function(h){ return h.getName(); });
    Logger.log('Pestañas existentes: ' + hojas.join(' | '));

    const nombreHoja = _nombreHojaB2B();
    Logger.log('Buscando hoja del mes: "' + nombreHoja + '"');

    const hoja = ss.getSheetByName(nombreHoja);
    if (!hoja) {
      Logger.log('>>> ERROR: no existe una pestaña llamada exactamente "' + nombreHoja + '"');
      Logger.log('>>> Revisa que el nombre coincida (mayúscula inicial, espacio, año).');
      return;
    }
    Logger.log('Hoja encontrada. Última fila con datos: ' + hoja.getLastRow());

    // Mostrar las primeras 5 filas de datos para ver el formato
    const desde = CONFIG_B2B.PRIMERA_FILA_DATOS;
    const n = Math.min(5, hoja.getLastRow() - desde + 1);
    if (n > 0) {
      const muestra = hoja.getRange(desde, 1, n, 11).getValues();
      const tz = CONFIG_CARGAS.ZONA_HORARIA;
      for (let i = 0; i < muestra.length; i++) {
        const f = muestra[i];
        const fecha = f[0] instanceof Date ? Utilities.formatDate(f[0], tz, 'dd/MM/yyyy') : f[0];
        const horaE = f[4] instanceof Date ? Utilities.formatDate(f[4], tz, 'HH:mm') : f[4];
        const horaG = f[6] instanceof Date ? Utilities.formatDate(f[6], tz, 'HH:mm') : f[6];
        Logger.log('Fila ' + (desde+i) + ': Fecha=[' + fecha + '] Tipo=[' + f[1] + '] Origen=[' + f[2] + '] Destino=[' + f[3] + '] HoraE(cita)=[' + horaE + '] HoraG(posic)=[' + horaG + ']');
      }
    } else {
      Logger.log('>>> La hoja no tiene filas de datos a partir de la fila ' + desde);
    }
  } catch (e) {
    Logger.log('>>> ERROR: ' + e.message);
  }
}


// ===================== PRUEBA DE ESCRITURA =====================
// Simula el cierre de una operación para comprobar que encuentra y rellena la fila.
// EDITA los valores de abajo con un caso REAL que exista hoy en tu B2B y ejecútala.
function probarEscrituraB2B() {
  // <<< EDITA ESTOS VALORES según una fila real de hoy en tu B2B >>>
  const PRUEBA = {
    tipo:    'Carga',         // 'Carga' (Expedición) o 'Descarga' (Recepción)
    destino: 'Marbella',      // nombre tal como aparece en la APP
    hora:    '17:30',         // hora que casará (col E si descarga, col G si carga)
    flujos:  ['LS'],          // LS->Carga
    soportes: 16,
    siePalets: ''
  };

  // Detectar categoría según el destino
  var cat = 'agencia';
  if (DESTINOS_CARGAS.tiendas[PRUEBA.destino]) cat = 'tienda';
  else if (DESTINOS_CARGAS.plataformas[PRUEBA.destino]) cat = 'plataforma';

  // Construir un "op" simulado como el que llega de EnCurso
  const ahora = new Date();
  const inicio = new Date(ahora.getTime() - 30 * 60000); // empezó hace 30 min
  const op = ['OPTEST', '5', 'Operario Prueba', PRUEBA.tipo, cat, PRUEBA.destino, PRUEBA.hora, inicio.toISOString()];

  const r = escribirEnB2B(op, inicio, ahora, {
    flujos: PRUEBA.flujos, soportes: PRUEBA.soportes,
    matricula: '', siePalets: PRUEBA.siePalets
  });
  Logger.log('Resultado: ' + JSON.stringify(r));
  if (r.ok) Logger.log('>>> ÉXITO: escrito en la fila ' + r.fila + ' del B2B. Compruébalo en el documento.');
  else Logger.log('>>> NO escribió: ' + r.mensaje);
}


// ===================== DIAGNÓSTICO DE HORAS =====================
// Muestra el valor CRUDO de las horas para entender por qué no casan.
function diagnosticarHoras() {
  const ss = SpreadsheetApp.openById(CONFIG_B2B.SHEET_ID);
  const hoja = ss.getSheetByName(_nombreHojaB2B());
  const tz = CONFIG_CARGAS.ZONA_HORARIA;
  const muestra = hoja.getRange(CONFIG_B2B.PRIMERA_FILA_DATOS, 1, 6, 11).getValues();
  for (let i = 0; i < muestra.length; i++) {
    const f = muestra[i];
    const celdaE = f[4]; // col E
    let tipoDato = (celdaE instanceof Date) ? 'Date' : typeof celdaE;
    let minutos = _aMinutos(celdaE, tz);
    Logger.log('Fila ' + (CONFIG_B2B.PRIMERA_FILA_DATOS+i) +
      ' | col E cruda=[' + celdaE + '] tipo=' + tipoDato +
      ' | _aMinutos devuelve=' + minutos +
      ' | objetivo 06:00 = ' + _aMinutos(_horaAFraccion('06:00'), tz));
  }
}


// ===================== DIAGNÓSTICO COLUMNA H (comienzo) =====================
function diagnosticarColumnaH() {
  const ss = SpreadsheetApp.openById(CONFIG_B2B.SHEET_ID);
  const hoja = ss.getSheetByName(_nombreHojaB2B());
  const muestra = hoja.getRange(CONFIG_B2B.PRIMERA_FILA_DATOS, 1, 10, 11).getValues();
  for (let i = 0; i < muestra.length; i++) {
    const f = muestra[i];
    const h = f[COL_B2B.HORA_COMIENZO - 1]; // col H
    const vacia = (h === '' || h === null || h === undefined);
    Logger.log('Fila ' + (CONFIG_B2B.PRIMERA_FILA_DATOS+i) +
      ' | Origen=[' + f[2] + '] HoraE=[' + (f[4] instanceof Date ? Utilities.formatDate(f[4],CONFIG_CARGAS.ZONA_HORARIA,'HH:mm') : f[4]) + ']' +
      ' | col H (comienzo) cruda=[' + h + '] -> ' + (vacia ? 'VACÍA (disponible)' : 'OCUPADA'));
  }
}


// ===================== DIAGNÓSTICO FECHA =====================
function diagnosticarFecha() {
  const ss = SpreadsheetApp.openById(CONFIG_B2B.SHEET_ID);
  const hoja = ss.getSheetByName(_nombreHojaB2B());
  const fin = new Date();
  Logger.log('HOY (servidor): dia=' + fin.getDate() + ' mes=' + fin.getMonth() + ' anio=' + fin.getFullYear());
  const muestra = hoja.getRange(CONFIG_B2B.PRIMERA_FILA_DATOS, 1, 6, 5).getValues();
  for (let i = 0; i < muestra.length; i++) {
    const celdaFecha = muestra[i][0];
    if (celdaFecha instanceof Date) {
      Logger.log('Fila ' + (CONFIG_B2B.PRIMERA_FILA_DATOS+i) +
        ' | Date crudo=[' + celdaFecha + ']' +
        ' | dia=' + celdaFecha.getDate() + ' mes=' + celdaFecha.getMonth() + ' anio=' + celdaFecha.getFullYear() +
        ' | ¿coincide con hoy? ' + (celdaFecha.getDate()===fin.getDate() && celdaFecha.getMonth()===fin.getMonth() && celdaFecha.getFullYear()===fin.getFullYear()));
    } else {
      Logger.log('Fila ' + (CONFIG_B2B.PRIMERA_FILA_DATOS+i) + ' | NO es Date, es: ' + typeof celdaFecha + ' valor=[' + celdaFecha + ']');
    }
  }
}


// ===================== DIAGNÓSTICO EXPEDICIONES =====================
// Muestra las filas de tipo Expedición de hoy para ver origen, destino y col G.
function diagnosticarExpediciones() {
  const ss = SpreadsheetApp.openById(CONFIG_B2B.SHEET_ID);
  const hoja = ss.getSheetByName(_nombreHojaB2B());
  const tz = CONFIG_CARGAS.ZONA_HORARIA;
  const fin = new Date();
  const ultima = hoja.getLastRow();
  const n = ultima - CONFIG_B2B.PRIMERA_FILA_DATOS + 1;
  const datos = hoja.getRange(CONFIG_B2B.PRIMERA_FILA_DATOS, 1, n, 11).getValues();
  Logger.log('HOY: dia=' + fin.getDate() + ' mes=' + fin.getMonth() + ' anio=' + fin.getFullYear());
  let mostradas = 0;
  for (let i = 0; i < datos.length && mostradas < 15; i++) {
    const f = datos[i];
    if (String(f[1]).trim() !== 'Expedición') continue;
    const fecha = f[0] instanceof Date ? (f[0].getDate()+'/'+(f[0].getMonth()+1)+'/'+f[0].getFullYear()) : f[0];
    const esHoy = f[0] instanceof Date && f[0].getDate()===fin.getDate() && f[0].getMonth()===fin.getMonth() && f[0].getFullYear()===fin.getFullYear();
    const horaG = f[6] instanceof Date ? Utilities.formatDate(f[6],tz,'HH:mm') : f[6];
    const horaE = f[4] instanceof Date ? Utilities.formatDate(f[4],tz,'HH:mm') : f[4];
    const hH = f[7];
    Logger.log('Fila ' + (CONFIG_B2B.PRIMERA_FILA_DATOS+i) +
      ' | Fecha=[' + fecha + '] hoy?' + esHoy +
      ' | Origen=[' + f[2] + '] Destino=[' + f[3] + ']' +
      ' | HoraE=[' + horaE + '] HoraG=[' + horaG + ']' +
      ' | H=' + (hH===''||hH==null?'VACÍA':'OCUPADA'));
    mostradas++;
  }
  if (mostradas === 0) Logger.log('>>> No hay filas de tipo "Expedición" en la hoja.');
}


// ===================== AUDITAR "ANULADO" EN B2B =====================
// Lista TODAS las filas marcadas 'Anulado' (col AT) en la hoja del mes actual,
// para comprobar de un vistazo si hay transportes marcados como anulados que
// nadie anuló realmente desde la pantalla del Jefe. Menú "📦 App Cargas".
function auditarAnuladosB2B() {
  const ss = SpreadsheetApp.openById(CONFIG_B2B.SHEET_ID);
  const hoja = ss.getSheetByName(_nombreHojaB2B());
  if (!hoja) { SpreadsheetApp.getUi().alert('No existe la hoja "' + _nombreHojaB2B() + '" en el B2B.'); return; }
  const tz = CONFIG_CARGAS.ZONA_HORARIA;
  const ultima = hoja.getLastRow();
  if (ultima < CONFIG_B2B.PRIMERA_FILA_DATOS) { SpreadsheetApp.getUi().alert('La hoja no tiene filas de datos.'); return; }
  const nFilas = ultima - CONFIG_B2B.PRIMERA_FILA_DATOS + 1;
  const datos = hoja.getRange(CONFIG_B2B.PRIMERA_FILA_DATOS, 1, nFilas, COL_B2B.ESTADO_JEFE).getValues();

  const filas = [];
  for (let i = 0; i < datos.length; i++) {
    const f = datos[i];
    if (!_esAnulado(f[COL_B2B.ESTADO_JEFE - 1])) continue;
    const fila = CONFIG_B2B.PRIMERA_FILA_DATOS + i;
    const cf = f[COL_B2B.FECHA - 1];
    const fecha = cf instanceof Date ? Utilities.formatDate(cf, tz, 'dd/MM/yyyy') : String(cf || '');
    const tipoB2B = String(f[COL_B2B.TIPO - 1] || '').trim();
    const esRecepcion = (tipoB2B === 'Recepción');
    const lugar = esRecepcion ? String(f[COL_B2B.ORIGEN - 1] || '') : String(f[COL_B2B.DESTINO - 1] || '');
    const celdaHora = esRecepcion ? f[COL_B2B.HORA_CITA - 1] : f[COL_B2B.HORA_POSIC - 1];
    const hora = celdaHora instanceof Date ? Utilities.formatDate(celdaHora, tz, 'HH:mm') : String(celdaHora || '');
    const marca = String(f[COL_B2B.ESTADO_JEFE - 1] || '').trim();
    filas.push('Fila ' + fila + ' | ' + fecha + ' | ' + tipoB2B + ' | ' + lugar + ' | ' + hora + ' | [' + marca + ']');
  }

  Logger.log('Auditoría Anulados B2B (' + _nombreHojaB2B() + '): ' + filas.length + ' filas.\n' + filas.join('\n'));

  if (!filas.length) {
    SpreadsheetApp.getUi().alert('No hay ninguna fila marcada "Anulado" en ' + _nombreHojaB2B() + '.');
    return;
  }
  const texto = filas.length + ' fila(s) marcadas "Anulado" en ' + _nombreHojaB2B() + ':\n\n' +
    filas.slice(0, 25).join('\n') +
    (filas.length > 25 ? '\n\n... y ' + (filas.length - 25) + ' más (lista completa en Ver > Registro de ejecución).' : '');
  SpreadsheetApp.getUi().alert(texto);
}

// ===================== DIAGNÓSTICO DE COLUMNAS LIBRES =====================
// Muestra las cabeceras (fila 1 y 2) y el ancho real de la hoja,
// para decidir qué columna usar como marca de 'Anulado' / 'ID jefe'.
function diagnosticarColumnas() {
  const ss = SpreadsheetApp.openById(CONFIG_B2B.SHEET_ID);
  const hoja = ss.getSheetByName(_nombreHojaB2B());
  const maxCol = hoja.getMaxColumns();
  Logger.log('La hoja "' + _nombreHojaB2B() + '" tiene ' + maxCol + ' columnas en total.');
  const fila1 = hoja.getRange(1, 1, 1, maxCol).getValues()[0];
  const fila2 = hoja.getRange(2, 1, 1, maxCol).getValues()[0];
  for (let c = 0; c < maxCol; c++) {
    const letra = _letraCol(c + 1);
    const h1 = String(fila1[c] || '').trim();
    const h2 = String(fila2[c] || '').trim();
    if (h1 || h2 || c >= 31) { // mostrar todas las que tengan cabecera, y de la AF en adelante
      Logger.log('Col ' + (c+1) + ' (' + letra + '): fila1=[' + h1 + '] fila2=[' + h2 + ']');
    }
  }
}
function _letraCol(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}


// ===================== PLAN DEL DÍA (lee del B2B) =====================
// Devuelve los transportes de HOY leídos del B2B, para Dashboard y pantalla Jefe.
function getPlanDelDiaB2B(fechaStr) {
  // fechaStr opcional: 'dd/MM/yyyy'. Si no se pasa, usa hoy.
  // Caché solo para hoy (no cachear otros días)
  const esHoy = !fechaStr;
  try {
    if (esHoy) {
      const cache = CacheService.getScriptCache();
      const cacheKey = 'plan_dia_' + Utilities.formatDate(new Date(), CONFIG_CARGAS.ZONA_HORARIA, 'yyyyMMdd');
      const cached = cache.get(cacheKey);
      if (cached) return JSON.parse(cached);
      const plan = _leerPlanDelDiaB2B(null);
      try { cache.put(cacheKey, JSON.stringify(plan), 60); } catch (eC) {}
      return plan;
    }
    return _leerPlanDelDiaB2B(fechaStr);
  } catch (e) {
    return _leerPlanDelDiaB2B(fechaStr);
  }
}

// Invalida la caché del plan (se llama tras añadir/anular para ver el cambio al instante)
function _invalidarCachePlan() {
  try {
    const cache = CacheService.getScriptCache();
    cache.remove('plan_dia_' + Utilities.formatDate(new Date(), CONFIG_CARGAS.ZONA_HORARIA, 'yyyyMMdd'));
  } catch (e) {}
}

function _leerPlanDelDiaB2B(fechaStr) {
  try {
    if (!CONFIG_B2B.SHEET_ID || CONFIG_B2B.SHEET_ID.indexOf('PEGA_AQUI') === 0) return [];
    const ss = SpreadsheetApp.openById(CONFIG_B2B.SHEET_ID);

    // Determinar qué hoja leer según la fecha pedida
    var fechaObj;
    if (fechaStr) {
      // fechaStr en formato dd/MM/yyyy
      const p = fechaStr.split('/');
      fechaObj = new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]));
    } else {
      fechaObj = new Date();
    }

    // Nombre de hoja según el mes de la fecha pedida
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const nombreHoja = meses[fechaObj.getMonth()] + ' ' + fechaObj.getFullYear();
    const hoja = ss.getSheetByName(nombreHoja);
    if (!hoja) return [];

    const tz = CONFIG_CARGAS.ZONA_HORARIA;
    const filtroDia = fechaObj.getDate();
    const filtroMes = fechaObj.getMonth();
    const filtroAnio = fechaObj.getFullYear();

    const ultima = hoja.getLastRow();
    if (ultima < CONFIG_B2B.PRIMERA_FILA_DATOS) return [];
    const nFilas = ultima - CONFIG_B2B.PRIMERA_FILA_DATOS + 1;
    // Leer hasta la columna de estado del jefe
    const datos = hoja.getRange(CONFIG_B2B.PRIMERA_FILA_DATOS, 1, nFilas, COL_B2B.ESTADO_JEFE).getValues();

    const plan = [];
    for (let i = 0; i < datos.length; i++) {
      const f = datos[i];
      const celdaFecha = f[COL_B2B.FECHA - 1];
      let esHoy = false;
      if (celdaFecha instanceof Date) {
        esHoy = (celdaFecha.getDate() === filtroDia && celdaFecha.getMonth() === filtroMes && celdaFecha.getFullYear() === filtroAnio);
      }
      if (!esHoy) continue;

      const tipoB2B = String(f[COL_B2B.TIPO - 1]).trim(); // Recepción / Expedición
      if (!tipoB2B) continue;
      const esRecepcion = (tipoB2B === 'Recepción');

      // Hora: recepción -> col E (cita) | expedición -> col G (posicionamiento)
      const celdaHora = esRecepcion ? f[COL_B2B.HORA_CITA - 1] : f[COL_B2B.HORA_POSIC - 1];
      const hora = celdaHora instanceof Date ? Utilities.formatDate(celdaHora, tz, 'HH:mm') : String(celdaHora || '');

      // Estado: si col H (comienzo) tiene valor -> en curso/hecho; si AT = Anulado -> anulado
      const marcaJefe = String(f[COL_B2B.ESTADO_JEFE - 1] || '').trim();
      const tieneComienzo = (f[COL_B2B.HORA_COMIENZO - 1] !== '' && f[COL_B2B.HORA_COMIENZO - 1] !== null);
      const tieneFin = (f[COL_B2B.HORA_FIN - 1] !== '' && f[COL_B2B.HORA_FIN - 1] !== null);
      let estado = 'Pendiente';
      if (_esAnulado(marcaJefe)) estado = 'Anulado';
      else if (tieneFin) estado = 'Completado';
      else if (tieneComienzo) estado = 'En curso';

      plan.push({
        fila: CONFIG_B2B.PRIMERA_FILA_DATOS + i,
        tipo: esRecepcion ? 'Descarga' : 'Carga',
        tipoB2B: tipoB2B,
        origen: String(f[COL_B2B.ORIGEN - 1] || ''),
        destino: String(f[COL_B2B.DESTINO - 1] || ''),
        hora: hora,
        flujo: String(f[COL_B2B.FLUJO - 1] || ''),
        soportes: f[COL_B2B.PALETS - 1] || '',
        estado: estado,
        anadido: (marcaJefe === 'Añadido')
      });
    }
    // Ordenar por hora
    plan.sort(function(a, b){ return (a.hora || '').localeCompare(b.hora || ''); });
    return plan;
  } catch (e) {
    return [];
  }
}

// ===================== JEFE: AÑADIR TRANSPORTE AL B2B =====================
function jefeAnadirAlB2B(datos) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG_B2B.SHEET_ID);
    const tz = CONFIG_CARGAS.ZONA_HORARIA;

    // Fecha objetivo (la que eligió el jefe: dd/MM/yyyy)
    const partesF = (datos.fecha || '').split('/');
    const fechaObj = partesF.length === 3
      ? new Date(Number(partesF[2]), Number(partesF[1]) - 1, Number(partesF[0]))
      : new Date();

    // Abrir la hoja del MES de la fecha elegida (no siempre el mes actual),
    // para que un transporte añadido para otro mes caiga en su hoja correcta.
    const mesesAdd = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                      'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const nombreHojaAdd = mesesAdd[fechaObj.getMonth()] + ' ' + fechaObj.getFullYear();
    const hoja = ss.getSheetByName(nombreHojaAdd);
    if (!hoja) return { ok: false, mensaje: 'No existe la hoja "' + nombreHojaAdd + '" en el B2B.' };

    const esCarga = (datos.tipo === 'Carga');
    const tipoB2B = esCarga ? 'Expedición' : 'Recepción';
    const origenB2B = esCarga ? PLATAFORMA_PROPIA : _lugarB2B(datos.destino, esCarga);
    const destinoB2B = esCarga ? _lugarB2B(datos.destino, esCarga) : PLATAFORMA_PROPIA;

    // Buscar-e-insertar va bajo lock: inserta filas (insertRowAfter) y eso desplaza
    // hacia abajo cualquier fila situada por debajo. Si esto se solapara con una
    // anulación en curso (jefeAnularEnB2B), esa anulación podría acabar escribiendo
    // en la fila equivocada tras el desplazamiento. El mismo lock global en ambas
    // funciones serializa "añadir" y "anular" entre sí.
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
      return { ok: false, mensaje: 'El sistema está ocupado con otro cambio en el B2B. Inténtalo de nuevo en unos segundos.' };
    }
    var filaNueva;
    try {
      // Buscar la última fila que tenga este mismo destino (col D para carga) en esta fecha,
      // para insertar la nueva fila JUSTO DEBAJO de ella.
      const ultima = hoja.getLastRow();
      const datosHoja = hoja.getRange(CONFIG_B2B.PRIMERA_FILA_DATOS, 1, ultima - CONFIG_B2B.PRIMERA_FILA_DATOS + 1, 4).getValues();
      const colDestinoBuscar = esCarga ? COL_B2B.DESTINO : COL_B2B.ORIGEN; // dónde está la tienda
      const valorBuscar = esCarga ? destinoB2B : origenB2B;
      let filaInsertar = -1;
      for (let i = 0; i < datosHoja.length; i++) {
        const cf = datosHoja[i][COL_B2B.FECHA - 1];
        const mismaFecha = cf instanceof Date &&
          cf.getDate() === fechaObj.getDate() && cf.getMonth() === fechaObj.getMonth() && cf.getFullYear() === fechaObj.getFullYear();
        const mismoTipo = String(datosHoja[i][COL_B2B.TIPO - 1]).trim() === tipoB2B;
        const mismoDestino = String(datosHoja[i][colDestinoBuscar - 1]).trim() === valorBuscar;
        if (mismaFecha && mismoTipo && mismoDestino) {
          filaInsertar = CONFIG_B2B.PRIMERA_FILA_DATOS + i; // guardamos la última coincidencia
        }
      }

      if (filaInsertar > 0) {
        // Insertar una fila vacía justo debajo de la última coincidencia
        hoja.insertRowAfter(filaInsertar);
        filaNueva = filaInsertar + 1;
      } else {
        // No hay filas de esa tienda ese día: añadir al final
        filaNueva = hoja.getLastRow() + 1;
      }

      hoja.getRange(filaNueva, COL_B2B.FECHA).setValue(fechaObj).setNumberFormat('dd/mm/yyyy');
      hoja.getRange(filaNueva, COL_B2B.TIPO).setValue(tipoB2B);
      hoja.getRange(filaNueva, COL_B2B.ORIGEN).setValue(origenB2B);
      hoja.getRange(filaNueva, COL_B2B.DESTINO).setValue(destinoB2B);
      // Hora: recepción -> col E | expedición -> col G
      const colHora = esCarga ? COL_B2B.HORA_POSIC : COL_B2B.HORA_CITA;
      hoja.getRange(filaNueva, colHora).setValue(_horaAFraccion(datos.hora)).setNumberFormat('hh:mm');
      // Marca de añadido por el jefe
      hoja.getRange(filaNueva, COL_B2B.ESTADO_JEFE).setValue('Añadido');
    } finally {
      lock.releaseLock();
    }

    // Correo a administración (sin flujo ni soportes: se definen luego en la carga/descarga)
    _enviarCorreoGestion('AÑADIDO', {
      tipo: datos.tipo, destino: datos.destino, hora: datos.hora,
      fechaTransporte: datos.fecha,
      flujos: '(se define en la carga)', soportes: '(se define en la carga)',
      notas: datos.notas || '-', autor: datos.autor || 'Jefe de equipo'
    });

    _invalidarCachePlan();
    return { ok: true, mensaje: '✅ Transporte añadido al B2B y notificado a administración.' };
  } catch (e) {
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}

// ===================== JEFE: RESOLVER LA FILA REAL A ANULAR =====================
// numFilaHint es el número de fila que vio el navegador la última vez que cargó la
// lista de "Gestionar". Ese número puede haberse quedado desactualizado si, mientras
// la pantalla seguía abierta, alguien añadió un transporte (jefeAnadirAlB2B inserta
// una fila con insertRowAfter y desplaza hacia abajo todo lo que hay debajo). Por eso
// NO nos fiamos nunca del número de fila a ciegas: siempre volvemos a buscar la fila
// por su CONTENIDO real (fecha+tipo+lugar+hora) en el momento de anular, usando la
// misma lógica de "estado" que ya usa _leerPlanDelDiaB2B (la función que generó la
// lista que vio el jefe). numFilaHint solo se usa para un log de diagnóstico si hay
// drift; nunca se lee directamente de la hoja.
// esperado = { tipoB2B, lugar, hora, estado, flujo, soportes } — la "foto" del
// transporte tal como lo vio el jefe en pantalla (viene de Jefe.html).
// Devuelve { ok:true, fila:N } o { ok:false, mensaje:'...' } (nunca adivina).
function _resolverFilaAnular(hoja, numFilaHint, esperado, fechaObj, tz) {
  const filtroDia = fechaObj.getDate(), filtroMes = fechaObj.getMonth(), filtroAnio = fechaObj.getFullYear();
  const ultima = hoja.getLastRow();
  if (ultima < CONFIG_B2B.PRIMERA_FILA_DATOS) return { ok: false, mensaje: 'No hay filas de datos en el B2B.' };
  const nFilas = ultima - CONFIG_B2B.PRIMERA_FILA_DATOS + 1;
  const datos = hoja.getRange(CONFIG_B2B.PRIMERA_FILA_DATOS, 1, nFilas, COL_B2B.ESTADO_JEFE).getValues();

  const candidatas = []; // {fila, estadoActual, flujo, soportes}
  for (let i = 0; i < datos.length; i++) {
    const f = datos[i];
    const cf = f[COL_B2B.FECHA - 1];
    // Misma comparación de fecha que _leerPlanDelDiaB2B (esa función generó lo que vio el jefe)
    const esMismaFecha = cf instanceof Date &&
      cf.getDate() === filtroDia && cf.getMonth() === filtroMes && cf.getFullYear() === filtroAnio;
    if (!esMismaFecha) continue;

    const tipoB2B = String(f[COL_B2B.TIPO - 1]).trim();
    if (tipoB2B !== esperado.tipoB2B) continue;
    const esRecepcion = (tipoB2B === 'Recepción');
    const lugarFila = esRecepcion ? String(f[COL_B2B.ORIGEN - 1]).trim() : String(f[COL_B2B.DESTINO - 1]).trim();
    if (lugarFila !== String(esperado.lugar || '').trim()) continue;

    // Misma derivación de "hora" que _leerPlanDelDiaB2B: comparación exacta de texto,
    // no _aMinutos con tolerancia (aquí comparamos el mismo campo consigo mismo, no
    // dos orígenes de datos distintos como sí hace escribirEnB2B).
    const celdaHora = esRecepcion ? f[COL_B2B.HORA_CITA - 1] : f[COL_B2B.HORA_POSIC - 1];
    const horaFila = celdaHora instanceof Date ? Utilities.formatDate(celdaHora, tz, 'HH:mm') : String(celdaHora || '');
    if (horaFila !== String(esperado.hora || '')) continue;

    // Estado actual, misma lógica que _leerPlanDelDiaB2B
    const marcaJefe = String(f[COL_B2B.ESTADO_JEFE - 1] || '').trim();
    const tieneComienzo = (f[COL_B2B.HORA_COMIENZO - 1] !== '' && f[COL_B2B.HORA_COMIENZO - 1] !== null);
    const tieneFin = (f[COL_B2B.HORA_FIN - 1] !== '' && f[COL_B2B.HORA_FIN - 1] !== null);
    let estadoActual = 'Pendiente';
    if (_esAnulado(marcaJefe)) estadoActual = 'Anulado';
    else if (tieneFin) estadoActual = 'Completado';
    else if (tieneComienzo) estadoActual = 'En curso';
    // Solo son candidatas anulables las que siguen activas (mismo criterio que la lista del Jefe)
    if (estadoActual !== 'Pendiente' && estadoActual !== 'En curso') continue;

    // NOTA: "soportes" se lee SIEMPRE de COL_B2B.PALETS (col K), igual que hace
    // _leerPlanDelDiaB2B para las dos direcciones (no usa PALETS_RECEP para descargas).
    // Se replica aquí a propósito para que el desempate compare exactamente el mismo
    // valor que el cliente recibió y está mandando en "esperado.soportes".
    candidatas.push({
      fila: CONFIG_B2B.PRIMERA_FILA_DATOS + i,
      estadoActual: estadoActual,
      flujo: String(f[COL_B2B.FLUJO - 1] || ''),
      soportes: f[COL_B2B.PALETS - 1] || ''
    });
  }

  if (candidatas.length === 0) {
    return { ok: false, mensaje: 'Ese transporte ya no está disponible para anular (puede que ya lo hayan anulado o ya se haya completado). Refresca la pantalla.' };
  }
  if (candidatas.length === 1) {
    if (candidatas[0].fila !== numFilaHint) {
      Logger.log('[B2B] _resolverFilaAnular: drift detectado. hint=' + numFilaHint + ' resuelta=' + candidatas[0].fila);
    }
    return { ok: true, fila: candidatas[0].fila };
  }

  // Más de una candidata con la misma fecha+tipo+lugar+hora (p.ej. dos citas idénticas
  // el mismo día): desempatar por el estado que el jefe vio en pantalla.
  let restantes = candidatas.filter(function (c) { return c.estadoActual === esperado.estado; });
  if (restantes.length === 1) {
    Logger.log('[B2B] _resolverFilaAnular: duplicado desempatado por estado. hint=' + numFilaHint + ' resuelta=' + restantes[0].fila);
    return { ok: true, fila: restantes[0].fila };
  }
  if (restantes.length === 0) restantes = candidatas; // el estado cambió mientras tanto: seguir intentando con todas

  // Sigue ambiguo: desempate adicional con flujo/soportes (dato que YA viajaba en pantalla).
  const porFlujoSoportes = restantes.filter(function (c) {
    return c.flujo === String(esperado.flujo || '') && String(c.soportes) === String(esperado.soportes || '');
  });
  if (porFlujoSoportes.length === 1) {
    Logger.log('[B2B] _resolverFilaAnular: duplicado desempatado por flujo/soportes. hint=' + numFilaHint + ' resuelta=' + porFlujoSoportes[0].fila);
    return { ok: true, fila: porFlujoSoportes[0].fila };
  }

  // Nunca adivinar: si sigue habiendo ambigüedad real, fallar cerrado.
  return { ok: false, mensaje: 'Hay varios transportes idénticos ese día y no se puede identificar cuál anular con seguridad. Refresca la pantalla; si persiste, contacta con administración.' };
}

// ===================== JEFE: ANULAR TRANSPORTE EN EL B2B =====================
function jefeAnularEnB2B(numFila, autor, fechaStr, esperado) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG_B2B.SHEET_ID);
    const tz = CONFIG_CARGAS.ZONA_HORARIA;

    // Abrir la hoja del MES de la fecha que se está viendo. La fila 'numFila' viene de
    // getPlanDelDiaB2B(fechaStr), que lee la hoja de ESE mes; si anuláramos siempre en el
    // mes actual, al ver otro mes tacharíamos la fila equivocada. Si no llega fecha, mes actual.
    var hoja, fObjAnul;
    if (fechaStr && /^\d{2}\/\d{2}\/\d{4}$/.test(fechaStr)) {
      var pfAnul = fechaStr.split('/');
      fObjAnul = new Date(Number(pfAnul[2]), Number(pfAnul[1]) - 1, Number(pfAnul[0]));
      var mesesAnul = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                       'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
      hoja = ss.getSheetByName(mesesAnul[fObjAnul.getMonth()] + ' ' + fObjAnul.getFullYear());
    } else {
      fObjAnul = new Date();
      hoja = ss.getSheetByName(_nombreHojaB2B());
    }
    if (!hoja) return { ok: false, mensaje: 'No existe la hoja del mes en el B2B.' };

    // Una pantalla de Jefe.html en caché (versión anterior a este arreglo) no manda
    // 'esperado'. NO volver a confiar ciegamente en numFila en ese caso: eso
    // reabriría exactamente el bug que esto arregla. Pedir refrescar en su lugar.
    if (!esperado || !esperado.tipoB2B || !esperado.lugar || !esperado.hora) {
      return { ok: false, mensaje: 'La página está desactualizada. Recarga (F5) e inténtalo de nuevo.' };
    }

    // Resolver+escribir van bajo el MISMO lock global que usa jefeAnadirAlB2B, para
    // que no se pueda colar una inserción de fila entre que resolvemos la fila
    // correcta y la marcamos como Anulada (si no, el bug podría reaparecer en una
    // ventana de milisegundos en vez de entre cargas de pantalla).
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
      return { ok: false, mensaje: 'El sistema está ocupado con otro cambio en el B2B. Inténtalo de nuevo en unos segundos.' };
    }
    var filaFinal, datosFila;
    try {
      var resuelto = _resolverFilaAnular(hoja, numFila, esperado, fObjAnul, tz);
      if (!resuelto.ok) return resuelto;
      filaFinal = resuelto.fila;

      datosFila = hoja.getRange(filaFinal, 1, 1, COL_B2B.SIE_RECEP).getValues()[0];
      // Marcar como anulado, con fecha/hora real de la anulación (no la del transporte)
      // para poder distinguir a simple vista una cancelación de hoy de una marca vieja
      // arrastrada por copiar/pegar la fila de un día anterior como plantilla.
      var marcaAnulado = 'Anulado ' + Utilities.formatDate(new Date(), tz, 'dd/MM HH:mm');
      hoja.getRange(filaFinal, COL_B2B.ESTADO_JEFE).setValue(marcaAnulado);
      // Tachar visualmente la fila (A hasta AF)
      hoja.getRange(filaFinal, 1, 1, COL_B2B.SIE_RECEP).setFontLine('line-through').setFontColor('#999999');
    } finally {
      lock.releaseLock();
    }

    const tipoB2B = String(datosFila[COL_B2B.TIPO - 1]).trim();
    const esRecepcion = (tipoB2B === 'Recepción');
    const celdaHora = esRecepcion ? datosFila[COL_B2B.HORA_CITA - 1] : datosFila[COL_B2B.HORA_POSIC - 1];
    const hora = celdaHora instanceof Date ? Utilities.formatDate(celdaHora, tz, 'HH:mm') : String(celdaHora || '');
    const destinoMostrar = esRecepcion ? String(datosFila[COL_B2B.ORIGEN - 1]) : String(datosFila[COL_B2B.DESTINO - 1]);
    // Fecha del transporte (columna A)
    const celdaFecha = datosFila[COL_B2B.FECHA - 1];
    const fechaTransporte = celdaFecha instanceof Date ? Utilities.formatDate(celdaFecha, tz, 'dd/MM/yyyy') : String(celdaFecha || '');

    _enviarCorreoGestion('ANULADO', {
      tipo: esRecepcion ? 'Descarga (Recepción)' : 'Carga (Expedición)',
      destino: destinoMostrar, hora: hora,
      fechaTransporte: fechaTransporte,
      flujos: String(datosFila[COL_B2B.FLUJO - 1] || '-'), soportes: datosFila[COL_B2B.PALETS - 1] || '-',
      notas: '-', autor: autor || 'Jefe de equipo'
    });

    _invalidarCachePlan();
    return { ok: true, mensaje: '✅ Transporte anulado en el B2B y notificado a administración.' };
  } catch (e) {
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}


// ===================== DIAGNÓSTICO PLAN DEL DÍA =====================
// Ejecuta esto para ver qué devuelve el plan que alimenta el dashboard.
function diagnosticarPlanDia() {
  const plan = _leerPlanDelDiaB2B();
  Logger.log('El plan del día tiene ' + plan.length + ' transportes.');
  if (plan.length === 0) {
    Logger.log('>>> VACÍO. Revisando por qué...');
    const ss = SpreadsheetApp.openById(CONFIG_B2B.SHEET_ID);
    const hoja = ss.getSheetByName(_nombreHojaB2B());
    const fin = new Date();
    Logger.log('Hoja: ' + _nombreHojaB2B() + ' | HOY: ' + fin.getDate() + '/' + (fin.getMonth()+1) + '/' + fin.getFullYear());
    // Contar cuántas filas son de hoy
    const ultima = hoja.getLastRow();
    const datos = hoja.getRange(CONFIG_B2B.PRIMERA_FILA_DATOS, 1, ultima - CONFIG_B2B.PRIMERA_FILA_DATOS + 1, 8).getValues();
    let deHoy = 0;
    for (let i = 0; i < datos.length; i++) {
      const cf = datos[i][0];
      if (cf instanceof Date && cf.getDate()===fin.getDate() && cf.getMonth()===fin.getMonth() && cf.getFullYear()===fin.getFullYear()) deHoy++;
    }
    Logger.log('Filas con fecha de HOY en el B2B: ' + deHoy);
  } else {
    for (let i = 0; i < Math.min(plan.length, 10); i++) {
      const p = plan[i];
      Logger.log((i+1) + '. ' + p.tipo + ' | ' + p.origen + ' -> ' + p.destino + ' | ' + p.hora + ' | estado=' + p.estado);
    }
  }
}


// ===================== CARGAS PENDIENTES DE UN DESTINO (para el terminal) =====================
// Devuelve los transportes pendientes de un destino/origen para una fecha dada,
// que aún NO están iniciados (col H vacía) ni anulados.
// destinoApp: nombre de la app (Málaga, Marbella, Mijas, Granada, Remansur...)
// fechaStr: 'dd/MM/yyyy' (si no se pasa, hoy)
// tipoApp: 'Carga' o 'Descarga'
function getCargasPendientesB2B(destinoApp, fechaStr, tipoApp) {
  try {
    if (!CONFIG_B2B.SHEET_ID || CONFIG_B2B.SHEET_ID.indexOf('PEGA_AQUI') === 0) return [];
    const ss = SpreadsheetApp.openById(CONFIG_B2B.SHEET_ID);

    var fechaObj;
    if (fechaStr) {
      const p = fechaStr.split('/');
      fechaObj = new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]));
    } else {
      fechaObj = new Date();
    }
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const nombreHoja = meses[fechaObj.getMonth()] + ' ' + fechaObj.getFullYear();
    const hoja = ss.getSheetByName(nombreHoja);
    if (!hoja) return [];

    const tz = CONFIG_CARGAS.ZONA_HORARIA;
    const esCarga = (tipoApp !== 'Descarga'); // por defecto carga
    const tipoB2B = esCarga ? 'Expedición' : 'Recepción';
    const lugarB2B = _lugarB2B(destinoApp, esCarga); // p.ej. "LM Málaga" o "Remansur"
    // En carga el lugar es el DESTINO; en descarga es el ORIGEN
    const colLugar = esCarga ? COL_B2B.DESTINO : COL_B2B.ORIGEN;
    // Hora: expedición -> col G (posicionamiento) | recepción -> col E (cita)
    const colHora = esCarga ? COL_B2B.HORA_POSIC : COL_B2B.HORA_CITA;
    const fDia = fechaObj.getDate(), fMes = fechaObj.getMonth(), fAnio = fechaObj.getFullYear();
    const fechaTextoObj = Utilities.formatDate(fechaObj, tz, 'dd/MM/yyyy'); // por si la fecha viene como texto

    const ultima = hoja.getLastRow();
    if (ultima < CONFIG_B2B.PRIMERA_FILA_DATOS) return [];
    const nFilas = ultima - CONFIG_B2B.PRIMERA_FILA_DATOS + 1;
    const datos = hoja.getRange(CONFIG_B2B.PRIMERA_FILA_DATOS, 1, nFilas, COL_B2B.ESTADO_JEFE).getValues();

    const pendientes = [];
    for (let i = 0; i < datos.length; i++) {
      const f = datos[i];
      if (String(f[COL_B2B.TIPO - 1]).trim() !== tipoB2B) continue;
      if (String(f[colLugar - 1]).trim() !== lugarB2B) continue;
      const cf = f[COL_B2B.FECHA - 1];
      var coincideFechaPend;
      if (cf instanceof Date) {
        coincideFechaPend = (cf.getDate() === fDia && cf.getMonth() === fMes && cf.getFullYear() === fAnio);
      } else {
        coincideFechaPend = (String(cf).trim() === fechaTextoObj);
      }
      if (!coincideFechaPend) continue;
      if (f[COL_B2B.HORA_COMIENZO - 1] !== '' && f[COL_B2B.HORA_COMIENZO - 1] !== null) continue;
      if (_esAnulado(f[COL_B2B.ESTADO_JEFE - 1])) continue;

      const celdaHora = f[colHora - 1];
      const hora = celdaHora instanceof Date ? Utilities.formatDate(celdaHora, tz, 'HH:mm') : String(celdaHora || '');

      pendientes.push({
        fila: CONFIG_B2B.PRIMERA_FILA_DATOS + i,
        hora: hora,
        flujo: String(f[COL_B2B.FLUJO - 1] || '')
      });
    }
    pendientes.sort(function(a, b){ return (a.hora || '').localeCompare(b.hora || ''); });
    return pendientes;
  } catch (e) {
    return [];
  }
}
