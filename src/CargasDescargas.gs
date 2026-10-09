/**
 * CargasDescargas.gs
 * App de registro de cargas/descargas en DOS FASES — Leroy Merlín Málaga
 * Terminal único compartido · varias operaciones simultáneas (1 por muelle)
 *
 * FASE 1 (Inicio): muelle, cargador, tipo, destino  -> guarda hora de comienzo
 * FASE 2 (Fin):     flujo, soportes, foto, matrícula, hora salida -> calcula duración
 *
 * Estado en vivo -> hoja 'EnCurso' | Completadas -> hoja 'Registros' | Fotos -> Drive
 */

// ===================== CONFIGURACIÓN =====================
const CONFIG_CARGAS = {
  SPREADSHEET_ID: '',                 // '' = hoja activa
  HOJA_REG: 'Registros',              // operaciones completadas
  HOJA_CURSO: 'EnCurso',              // operaciones abiertas (estado en vivo)
  CARPETA_RAIZ_ID: '',                // '' = se crea por nombre
  CARPETA_RAIZ_NOMBRE: 'Cargas y Descargas Plataforma',
  ZONA_HORARIA: 'Europe/Madrid'
};

const OPERARIOS_CARGAS = ['Manuel Rosas', 'Sergio Sánchez', 'Antonio Sánchez', 'Juanlu'];

// Cargadores auxiliares: no salen como chip fijo, se despliegan con el botón
// "+ más cargadores" del modal Iniciar cuando hace falta elegir a alguien de fuera
// del equipo habitual (sustituye al antiguo campo de texto libre, ya retirado).
const CARGADORES_AUX = [
  'Alberto', 'Daniel.Arrastio', 'Daniel.Simo', 'Sebas', 'Fran P', 'Rafa Perez',
  'David Planas', 'Brunelli', 'Francisco', 'Jesus Seco', 'JM Bonamigo', 'Campana',
  'Carlos Gutierrez', 'Salva', 'Carlos. Osuna', 'Alex. Rios', 'Jose Antonio',
  'Luciano', 'Pablo', 'Daniel Cano', 'Paqui', 'Alejandro Giner', 'Pedro Serrano',
  'Edson', 'Antonio M.', 'Oscar'
];

// Destinos en 3 grupos. Tiendas y plataformas con HORA DE ENTREGA/RECEPCIÓN.
// Agencias sin horas. Array vacío [] = sin horas.
const DESTINOS_CARGAS = {
  tiendas: {
    'Málaga':   ['6:00', '7:00', '18:00', '00:00'],
    'Marbella': ['16:00', '17:30', '19:00', '22:00'],
    'Mijas':    ['6:30', '8:00', '10:00', '13:00'],
    'Granada':  []
  },
  plataformas: {
    'Valencia':  ['6:00', '7:00', '8:00', '9:00', '10:00'],
    'Torija':    ['9:00', '10:00', '11:00'],
    'Meco':      ['6:00', '7:00'],
    'Antequera': []
  },
  agencias: ['Remansur', 'Correcaminos Granada'],
  // Tiendas que solo se descargan (no se pueden cargar)
  soloDescarga: ['Granada']
};

const MUELLES_CARGAS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const FLUJOS_CARGAS = ['LS', 'CC', 'SIE', 'Inversa'];

const CAB_REG = [
  'ID', 'Fecha', 'Muelle', 'Cargador', 'Tipo', 'Categoría', 'Destino/Origen',
  'Hora comienzo', 'Hora fin', 'Duración (min)', 'Hora entrega/recepción', 'Fecha entrega/recepción', 'Hora YMS',
  'Flujo', 'Nº soportes', 'Matrícula', 'Enlace foto'
];
const CAB_CURSO = [
  'ID', 'Muelle', 'Cargador', 'Tipo', 'Categoría', 'Destino/Origen', 'Hora entrega/recepción', 'Hora comienzo (ISO)', 'Foto descarga', 'Fecha carga'
];

// ===================== WEB APP =====================
// URL normal -> terminal de registro.
// URL + '?view=dashboard' -> monitor de la plataforma (solo lectura, pantalla completa).
//
// ID_DEPLOY_SOLO_DASHBOARD: despliegue SEPARADO (acceso ampliado a todo Adeo, más amplio
// que el despliegue normal restringido a leroymerlin.es). Por seguridad, ese despliegue
// SIEMPRE muestra el Dashboard, sin importar qué ?view= se pida: así nunca puede llegar a
// enseñar Terminal/Jefe/Tiendas/Generix (que sí escriben datos reales o mandan correos).
//
// OJO: ScriptApp.getService().getUrl() devuelve la URL con OTRO formato que la del navegador
// (script.google.com/a/DOMINIO/macros/s/ID/exec frente a script.google.com/a/macros/DOMINIO/s/ID/exec),
// así que NO se puede comparar la URL entera: se busca solo el ID del despliegue (medido el
// 2026-10-09; getUrl() sí devuelve un ID distinto en cada despliegue).
const ID_DEPLOY_SOLO_DASHBOARD = 'AKfycbxkUX97zEWjzYJ48OFDqZUHGJKWaKj1gE9XGJkdkOj-nUoucUPNfEtxO68kI76KTfK3hg';

function esDeploySoloDashboard_() {
  try {
    return String(ScriptApp.getService().getUrl() || '').indexOf(ID_DEPLOY_SOLO_DASHBOARD) !== -1;
  } catch (eU) {
    return false;
  }
}

function doGet(e) {
  let vista = (e && e.parameter && e.parameter.view) || '';
  if (esDeploySoloDashboard_()) vista = 'dashboard';
  const map = {
    'dashboard': ['Dashboard',  'Monitor Plataforma Málaga'],
    'tiendas':   ['Tiendas',    'Cargas Extras · Tiendas'],
    'jefe':      ['Jefe',       'Gestión · Jefe de Equipo'],
    'generix':   ['Generix',    'Monitor Generix · Soportes en vivo'],
  };
  const [archivo, titulo] = map[vista] || ['cargas', 'Cargas/Descargas · Plataforma Málaga'];
  return HtmlService.createHtmlOutputFromFile(archivo)
    .setTitle(titulo)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function obtenerConfig() {
  return {
    operarios: OPERARIOS_CARGAS,
    cargadoresAux: CARGADORES_AUX,
    tiendas: DESTINOS_CARGAS.tiendas,
    plataformas: DESTINOS_CARGAS.plataformas,
    agencias: DESTINOS_CARGAS.agencias,
    soloDescarga: DESTINOS_CARGAS.soloDescarga,
    muelles: MUELLES_CARGAS,
    flujos: FLUJOS_CARGAS
  };
}

// ===================== HOJAS =====================
function _ss() {
  return CONFIG_CARGAS.SPREADSHEET_ID
    ? SpreadsheetApp.openById(CONFIG_CARGAS.SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}
function _hoja(nombre, cabeceras, color) {
  const ss = _ss();
  let h = ss.getSheetByName(nombre);
  if (!h) {
    h = ss.insertSheet(nombre);
    h.appendRow(cabeceras);
    h.getRange(1, 1, 1, cabeceras.length)
      .setFontWeight('bold').setBackground(color || '#e30613').setFontColor('#FFFFFF');
    h.setFrozenRows(1);
  }
  return h;
}

// Borra una fila evitando el error de Sheets "No se pueden eliminar todas las
// filas que no estén inmovilizadas": si la fila a borrar es la ÚNICA fila de
// datos (justo debajo de la cabecera fija), Sheets no deja borrarla porque
// dejaría el sheet sin ninguna fila no inmovilizada. Pasa exactamente cuando
// esa es la única operación activa en todo el muelle. Solución: si es el caso,
// añadir primero una fila en blanco de relleno (se ignora al leer, ya que el
// resto del código salta filas con la col ID vacía) y entonces sí borrar.
function _eliminarFilaSegura_(hoja, fila) {
  const frozen = hoja.getFrozenRows();
  if (hoja.getLastRow() === fila && fila <= frozen + 1) {
    hoja.insertRowAfter(fila);
  }
  hoja.deleteRow(fila);
}

// ── Horas ya usadas hoy para un destino concreto ─────────────────
// Busca en Registros + EnCurso las operaciones del día con ese destino
// para bloquear el slot en el modal de horas del terminal
function getHorasUsadasHoy(destino) {
  const tz  = CONFIG_CARGAS.ZONA_HORARIA;
  const hoy = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy');
  const ss  = _ss();
  const usadas = [];

  // Revisar hoja Registros (operaciones completadas hoy)
  const hReg = ss.getSheetByName(CONFIG_CARGAS.HOJA_REG);
  if (hReg) {
    const vals = hReg.getDataRange().getValues();
    for (let i = 1; i < vals.length; i++) {
      if (String(vals[i][1]) === hoy && String(vals[i][6]) === destino) {
        const h = String(vals[i][10] || '').trim(); // col K = Hora entrega/recepción
        if (h) usadas.push(h);
      }
    }
  }

  // Revisar hoja EnCurso (operaciones abiertas ahora)
  const hCurso = ss.getSheetByName(CONFIG_CARGAS.HOJA_CURSO);
  if (hCurso) {
    const vals = hCurso.getDataRange().getValues();
    for (let i = 1; i < vals.length; i++) {
      if (String(vals[i][5]) === destino) {
        const h = String(vals[i][6] || '').trim(); // col G = Hora entrega/recepción
        if (h) usadas.push(h);
      }
    }
  }

  return usadas;
}
// Devuelve operaciones en curso + KPIs del día (para el tablero/dashboard)
// Devuelve estado (operaciones en curso + KPIs) y plan del día en UNA sola llamada.
// El dashboard usa esto para reducir la latencia a la mitad.
function obtenerDashboard() {
  return {
    estado: obtenerEstado(),
    plan: getPlanDelDiaB2B()
  };
}

function obtenerEstado() {
  const tz = CONFIG_CARGAS.ZONA_HORARIA;
  const hCurso = _hoja(CONFIG_CARGAS.HOJA_CURSO, CAB_CURSO, '#f0b429');
  const hReg = _hoja(CONFIG_CARGAS.HOJA_REG, CAB_REG, '#e30613');

  // En curso
  const enCurso = {};
  const datosCurso = hCurso.getDataRange().getValues();
  for (let i = 1; i < datosCurso.length; i++) {
    const f = datosCurso[i];
    if (!f[0]) continue;
    enCurso[f[1]] = { // clave = muelle
      id: String(f[0]), muelle: String(f[1]), cargador: String(f[2]), tipo: String(f[3]),
      categoria: String(f[4]), destino: String(f[5]),
      horaEntrega: (f[6] instanceof Date) ? Utilities.formatDate(f[6], tz, 'HH:mm') : String(f[6] || ''),
      inicioISO: (f[7] instanceof Date) ? f[7].toISOString() : String(f[7])
    };
  }

  // KPIs del día (de Registros completados)
  const hoy = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy');
  const ahoraD = new Date();
  const hoyDia = ahoraD.getDate(), hoyMes = ahoraD.getMonth(), hoyAnio = ahoraD.getFullYear();
  const datosReg = hReg.getDataRange().getValues();
  // Una operación con 2 cargadores ahora escribe 2 filas en Registros (una por
  // persona, con soportes y duración ya partidos a la mitad cada una — ver
  // finalizarOperacion). Para los KPIs globales (Completadas hoy, Media min/op)
  // hay que agrupar por ID: cada operación cuenta UNA vez y su duración/soportes
  // reales son la SUMA de sus filas partidas, si no "Completadas hoy" saldría el
  // doble y "Media min/op" saldría a la mitad de lo real.
  const porId = {};
  for (let i = 1; i < datosReg.length; i++) {
    const f = datosReg[i];
    if (!f[1] || !f[0]) continue;
    let esHoy = false;
    if (f[1] instanceof Date) {
      esHoy = (f[1].getDate() === hoyDia && f[1].getMonth() === hoyMes && f[1].getFullYear() === hoyAnio);
    } else {
      esHoy = (String(f[1]).indexOf(hoy) !== -1);
    }
    if (!esHoy) continue;
    const id = String(f[0]);
    if (!porId[id]) porId[id] = { filas: [], dur: 0, soportes: 0 };
    porId[id].filas.push(f);
    porId[id].dur += Number(f[9]) || 0;       // suma de filas partidas = duración real de la operación
    porId[id].soportes += Number(f[14]) || 0; // suma de filas partidas = soportes reales (col 15, índice 14)
  }
  const idsHoy = Object.keys(porId);
  const completadasHoy = idsHoy.length;
  let soportesHoy = 0, sumaDur = 0, nDur = 0;
  const porCargador = {};
  idsHoy.forEach(function(id) {
    soportesHoy += porId[id].soportes;
    if (porId[id].dur > 0) { sumaDur += porId[id].dur; nDur++; }
    // Ranking por cargador: cada fila ya trae el nombre individual y su parte de
    // soportes/duración (o el 100% si la operación fue de una sola persona).
    porId[id].filas.forEach(function(f) {
      const c = String(f[3] || '—').trim();
      if (!porCargador[c]) porCargador[c] = { ops: 0, soportes: 0, min: 0 };
      porCargador[c].ops += 1;
      porCargador[c].soportes += Number(f[14]) || 0;
      porCargador[c].min += Number(f[9]) || 0;
    });
  });

  return {
    enCurso: enCurso,
    kpi: {
      enCursoNum: Object.keys(enCurso).length,
      completadasHoy: completadasHoy,
      soportesHoy: soportesHoy,
      mediaDur: nDur ? Math.round(sumaDur / nDur) : 0
    },
    porCargador: porCargador,
    muelles: MUELLES_CARGAS
  };
}

// ===================== RANKING (pantalla rotativa del Dashboard) =====================
// Convierte la col. Fecha de Registros ('dd/MM/yyyy' o, si Sheets la autoconvirtió, Date) a un Date a medianoche, para comparar por rango.
function _fechaRegADate_(v) {
  if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  const m = String(v || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
}

// Rango de fechas (inclusive) para cada período. Semana = lunes a domingo de la semana actual.
function _rangoPeriodo_(periodo) {
  const ahora = new Date();
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  if (periodo === 'semana') {
    const offsetLunes = (hoy.getDay() === 0) ? 6 : hoy.getDay() - 1;
    const desde = new Date(hoy); desde.setDate(hoy.getDate() - offsetLunes);
    const hasta = new Date(desde); hasta.setDate(desde.getDate() + 6);
    return { desde: desde, hasta: hasta };
  }
  if (periodo === 'mes') {
    return { desde: new Date(hoy.getFullYear(), hoy.getMonth(), 1), hasta: new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0) };
  }
  return { desde: hoy, hasta: hoy }; // 'dia'
}

// Ranking de cargadores (día/semana/mes) para la pantalla rotativa del Dashboard.
// Lee Registros UNA sola vez y calcula los 3 períodos a la vez (se llama 1×/hora, pero
// Registros crece cada mes y no tiene sentido releer la hoja 3 veces).
function obtenerRankingCompleto() {
  const tz = CONFIG_CARGAS.ZONA_HORARIA;
  const periodos = ['dia', 'semana', 'mes'];
  const rangos = {}, acc = {};
  periodos.forEach(function(p) {
    rangos[p] = _rangoPeriodo_(p);
    acc[p] = { porCargador: {}, totalOps: 0, totalSoportes: 0, record: null, recordSoportes: null };
  });

  const hReg = _ss().getSheetByName(CONFIG_CARGAS.HOJA_REG);
  if (hReg && hReg.getLastRow() > 1) {
    const datos = hReg.getRange(2, 1, hReg.getLastRow() - 1, CAB_REG.length).getValues();
    for (let i = 0; i < datos.length; i++) {
      const f = datos[i];
      if (!f[0] || !f[3]) continue;
      const fecha = _fechaRegADate_(f[1]);
      if (!fecha) continue;
      const nombre = String(f[3]).trim();
      const tipo = String(f[4] || '');
      const destino = String(f[6] || '');
      const dur = Number(f[9]) || 0;
      const sop = Number(f[14]) || 0;

      periodos.forEach(function(p) {
        const r = rangos[p];
        if (fecha < r.desde || fecha > r.hasta) return;
        const a = acc[p];
        if (!a.porCargador[nombre]) a.porCargador[nombre] = { nombre: nombre, cargas: 0, descargas: 0, total: 0, soportes: 0, sumaMin: 0, nMin: 0, mejorMin: null };
        const c = a.porCargador[nombre];
        c.total++;
        if (tipo === 'Carga') c.cargas++; else if (tipo === 'Descarga') c.descargas++;
        c.soportes += sop;
        a.totalOps++; a.totalSoportes += sop;
        if (dur > 0) {
          c.sumaMin += dur; c.nMin++;
          if (c.mejorMin === null || dur < c.mejorMin) c.mejorMin = dur;
          if (!a.record || dur < a.record.min) a.record = { nombre: nombre, min: dur, tipo: tipo, destino: destino };
        }
        if (sop > 0 && (!a.recordSoportes || sop > a.recordSoportes.soportes)) {
          a.recordSoportes = { nombre: nombre, soportes: sop, tipo: tipo, destino: destino };
        }
      });
    }
  }

  const resultado = {};
  periodos.forEach(function(p) {
    const a = acc[p], r = rangos[p];
    resultado[p] = {
      desde: Utilities.formatDate(r.desde, tz, 'dd/MM/yyyy'),
      hasta: Utilities.formatDate(r.hasta, tz, 'dd/MM/yyyy'),
      totalOps: a.totalOps,
      totalSoportes: Math.round(a.totalSoportes * 10) / 10,
      recordVelocidad: a.record,
      recordSoportes: a.recordSoportes,
      cargadores: Object.keys(a.porCargador).map(function(k) {
        const c = a.porCargador[k];
        return {
          nombre: c.nombre, cargas: c.cargas, descargas: c.descargas, total: c.total,
          soportes: Math.round(c.soportes * 10) / 10,
          mediaMin: c.nMin ? Math.round(c.sumaMin / c.nMin) : 0, mejorMin: c.mejorMin
        };
      }).sort(function(x, y) { return y.total - x.total; })
    };
  });
  return resultado;
}

// ===================== FASE 1: INICIAR =====================
function iniciarOperacion(datos) {
  try {
    // datos.cargadores: array de 1 o 2 nombres (máx. 2 por operación, cada uno se
    // lleva 0,5 del crédito en el ranking si son 2). Se guarda como texto unido por
    // comas en la misma columna Cargador de siempre (ej. "Juanlu, Alberto").
    const cargadores = (datos.cargadores && datos.cargadores.length) ? datos.cargadores : [datos.cargador];
    const cargadorTxt = cargadores.join(', ');

    const hCurso = _hoja(CONFIG_CARGAS.HOJA_CURSO, CAB_CURSO, '#f0b429');
    // ¿muelle ya ocupado? ¿algún cargador seleccionado ya ocupado en otro muelle?
    const vals = hCurso.getDataRange().getValues();
    for (let i = 1; i < vals.length; i++) {
      if (String(vals[i][1]) === String(datos.muelle)) {
        return { ok: false, mensaje: 'El muelle ' + datos.muelle + ' ya tiene una operación en curso.' };
      }
      const nombresFila = String(vals[i][2]).split(',').map(function(s){ return s.trim().toLowerCase(); });
      for (let c = 0; c < cargadores.length; c++) {
        if (nombresFila.indexOf(String(cargadores[c]).trim().toLowerCase()) > -1) {
          return { ok: false, mensaje: cargadores[c] + ' ya está operando en el muelle ' + vals[i][1] + '. Un cargador no puede estar en dos muelles a la vez.' };
        }
      }
    }
    const id = 'OP' + new Date().getTime();
    const ahoraIni = new Date();
    // Si es descarga con foto, guardarla en Drive ahora (camión cargado que llega)
    var enlaceFotoIni = '';
    if (datos.tipo === 'Descarga' && datos.foto) {
      var opTemp = [id, datos.muelle, cargadorTxt, datos.tipo, datos.categoria, datos.destino, datos.horaEntrega || ''];
      try { enlaceFotoIni = guardarFoto_(datos.foto, ahoraIni, opTemp); } catch (eF) { enlaceFotoIni = ''; }
    }
    const filaCurso = hCurso.getLastRow() + 1;
    // Pre-formatear como texto las columnas de hora (7) y fecha de carga (10) ANTES de escribir,
    // para que Sheets no las convierta a Date
    hCurso.getRange(filaCurso, 7).setNumberFormat('@');
    hCurso.getRange(filaCurso, 10).setNumberFormat('@');
    SpreadsheetApp.flush();
    hCurso.appendRow([
      id, datos.muelle, cargadorTxt, datos.tipo,
      datos.categoria, datos.destino, datos.horaEntrega || '', ahoraIni.toISOString(), enlaceFotoIni, datos.fechaCarga || ''
    ]);
    // Re-forzar texto plano por seguridad
    hCurso.getRange(filaCurso, 7).setNumberFormat('@').setValue(datos.horaEntrega || '');
    hCurso.getRange(filaCurso, 10).setNumberFormat('@').setValue(datos.fechaCarga || '');
    SpreadsheetApp.flush();
    return { ok: true, mensaje: 'Operación iniciada en muelle ' + datos.muelle + '.', id: id };
  } catch (e) {
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}

// ===================== FASE 2: FINALIZAR =====================
function finalizarOperacion(datos) {
  try {
    const tz = CONFIG_CARGAS.ZONA_HORARIA;
    const hCurso = _hoja(CONFIG_CARGAS.HOJA_CURSO, CAB_CURSO, '#f0b429');
    const hReg = _hoja(CONFIG_CARGAS.HOJA_REG, CAB_REG, '#e30613');

    // Localizar la operación en curso por ID
    const vals = hCurso.getDataRange().getValues();
    let fila = -1, op = null;
    for (let i = 1; i < vals.length; i++) {
      if (vals[i][0] === datos.id) { fila = i + 1; op = vals[i]; break; }
    }
    if (!op) return { ok: false, mensaje: 'No se encontró la operación (¿ya cerrada?).' };

    const inicio = new Date(op[7]);
    const fin = new Date();
    const durMin = Math.max(0, Math.round((fin - inicio) / 60000));

    // Foto: en descargas se hizo al iniciar (col 9 de EnCurso); en cargas se hace ahora
    let enlaceFoto = '';
    if (op[3] === 'Descarga') {
      enlaceFoto = op[8] || ''; // enlace guardado al iniciar
    } else if (datos.foto && datos.foto.base64) {
      enlaceFoto = guardarFoto_(datos.foto, fin, op);
    }

    const matricula = op[3] === 'Carga' ? (datos.matricula || '').toUpperCase() : '';
    const flujoTexto = (datos.flujos && datos.flujos.length) ? datos.flujos.join(', ') : '';

    // Volcar primero al B2B (devuelve la hora del YMS de la columna F si está rellena)
    // Si la carga se adelantó, op[9] tiene la fecha real para casar la fila correcta.
    // Puede venir como texto "dd/MM/yyyy" o como Date (si Sheets lo convirtió): normalizar.
    var fechaCargaStr = '';
    if (op[9] instanceof Date) {
      fechaCargaStr = Utilities.formatDate(op[9], tz, 'dd/MM/yyyy');
    } else if (op[9]) {
      fechaCargaStr = String(op[9]).trim();
    }
    datos.fechaCarga = fechaCargaStr;
    var b2b = { ok: false };
    try { b2b = escribirEnB2B(op, inicio, fin, datos); } catch (eB2B) { b2b = { ok: false, mensaje: eB2B.message }; }
    try { _invalidarCachePlan(); } catch (eIC) {}
    Logger.log('[B2B] op=' + JSON.stringify(op) + ' datos=' + JSON.stringify(datos) + ' -> resultado=' + JSON.stringify(b2b));
    var horaYMS = (b2b && b2b.horaYMS) ? b2b.horaYMS : '';

    // Fecha de entrega en tienda/plataforma: en cargas es la fecha elegida (puede ser mañana),
    // en descargas siempre es hoy (el día que llega el camión).
    var fechaEntrega = (op[3] === 'Carga')
      ? (fechaCargaStr || Utilities.formatDate(fin, tz, 'dd/MM/yyyy'))
      : Utilities.formatDate(fin, tz, 'dd/MM/yyyy');

    // Si la operación tuvo 2 cargadores ("Juanlu, Alberto"), se escribe UNA FILA
    // POR PERSONA en Registros (registro individual, a petición de Pedro), con la
    // duración y los soportes partidos a la mitad en cada fila. Con 1 cargador,
    // comportamiento idéntico al de siempre (fila única, valores completos).
    const nombresCargador = String(op[2] || '').split(',').map(function(s){ return s.trim(); }).filter(Boolean);
    const nCargadores = nombresCargador.length || 1;
    const nombresAEscribir = nCargadores > 1 ? nombresCargador : [op[2]];
    const durMinFila = nCargadores > 1 ? (durMin / nCargadores) : durMin;
    const soportesFila = nCargadores > 1 ? ((Number(datos.soportes) || 0) / nCargadores) : (datos.soportes || '');
    var colorFila = (op[3] === 'Carga') ? '#eafbf0' : '#fff8e8';

    nombresAEscribir.forEach(function(nombreCargador) {
      hReg.appendRow([
        op[0],                                                   // ID
        Utilities.formatDate(fin, tz, 'dd/MM/yyyy'),             // Fecha
        op[1], nombreCargador, op[3], op[4], op[5],              // muelle, cargador, tipo, cat, destino
        Utilities.formatDate(inicio, tz, 'HH:mm:ss'),            // comienzo
        Utilities.formatDate(fin, tz, 'HH:mm:ss'),               // fin
        durMinFila,                                              // duración (partida si hay 2 cargadores)
        op[6] || '',                                             // hora entrega/recepción
        fechaEntrega,                                            // fecha entrega/recepción
        horaYMS,                                                 // hora YMS (col F del B2B)
        flujoTexto, soportesFila, matricula, enlaceFoto
      ]);
      // Colorear la fila recién añadida según tipo (carga=verde, descarga=ámbar)
      var filaReg = hReg.getLastRow();
      hReg.getRange(filaReg, 1, 1, CAB_REG.length).setBackground(colorFila)
          .setBorder(true, true, true, true, true, true, '#e8ecf0', SpreadsheetApp.BorderStyle.SOLID);
    });

    _eliminarFilaSegura_(hCurso, fila); // liberar muelle

    // Correo automático carga Mijas 6:30 (acepta '6:30' y '06:30')
    var horaOp = String(op[6] || '').trim().replace(/^0/, ''); // quita cero inicial
    Logger.log('[Mijas check] tipo=' + op[3] + ' destino=' + op[5] + ' hora=' + op[6] + ' horaOp=' + horaOp);
    if (op[3] === 'Carga' && op[5] === 'Mijas' && horaOp === '6:30') {
      Logger.log('[Mijas] Condición cumplida, enviando correo...');
      try { enviarCorreoMijas0630(op, datos, enlaceFoto); Logger.log('[Mijas] Correo enviado OK'); } catch (eMij) { Logger.log('[Mijas] ERROR: ' + eMij.message); }
    }

    var msg = 'Operación cerrada. Duración: ' + durMin + ' min.';
    if (b2b.ok) {
      msg += ' ✓ B2B actualizado (fecha ' + (datos.fechaCarga || Utilities.formatDate(fin, tz, 'dd/MM/yyyy')) + ').';
    } else if (b2b.mensaje) {
      msg += ' ⚠ Aviso B2B: ' + b2b.mensaje;
    }
    return { ok: true, mensaje: msg, duracion: durMin, b2b: b2b.ok };
  } catch (e) {
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}

// Cancelar una operación abierta sin registrarla
function cancelarOperacion(id) {
  try {
    const hCurso = _hoja(CONFIG_CARGAS.HOJA_CURSO, CAB_CURSO, '#f0b429');
    const vals = hCurso.getDataRange().getValues();
    for (let i = 1; i < vals.length; i++) {
      if (vals[i][0] === id) { _eliminarFilaSegura_(hCurso, i + 1); return { ok: true, mensaje: 'Operación cancelada.' }; }
    }
    return { ok: false, mensaje: 'No se encontró la operación.' };
  } catch (e) {
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}

// ===================== FOTOS EN DRIVE =====================
function guardarFoto_(foto, fecha, op) {
  const raiz = obtenerCarpetaRaiz_();
  const tz = CONFIG_CARGAS.ZONA_HORARIA;
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const nombreMes = Utilities.formatDate(fecha, tz, 'yyyy-MM') + ' ' + meses[fecha.getMonth()];
  const nombreDia = Utilities.formatDate(fecha, tz, 'yyyy-MM-dd');
  const carpetaMes = obtenerOCrearSubcarpeta_(raiz, nombreMes);
  const carpetaDia = obtenerOCrearSubcarpeta_(carpetaMes, nombreDia);

  const datosFoto = foto.base64.indexOf(',') > -1 ? foto.base64.split(',')[1] : foto.base64;
  const hora = Utilities.formatDate(fecha, tz, 'HHmmss');
  const nombre = [hora, 'M' + op[1], (op[3] || '').substring(0, 4),
                  (op[5] || '').replace(/\s+/g, '')].filter(Boolean).join('_') + '.jpg';
  const blob = Utilities.newBlob(Utilities.base64Decode(datosFoto), foto.tipo || 'image/jpeg', nombre);
  return carpetaDia.createFile(blob).getUrl();
}

function obtenerCarpetaRaiz_() {
  if (CONFIG_CARGAS.CARPETA_RAIZ_ID) return DriveApp.getFolderById(CONFIG_CARGAS.CARPETA_RAIZ_ID);
  const ex = DriveApp.getFoldersByName(CONFIG_CARGAS.CARPETA_RAIZ_NOMBRE);
  return ex.hasNext() ? ex.next() : DriveApp.createFolder(CONFIG_CARGAS.CARPETA_RAIZ_NOMBRE);
}
function obtenerOCrearSubcarpeta_(padre, nombre) {
  const it = padre.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : padre.createFolder(nombre);
}


// ===================== FORMATO HOJA REGISTROS (para administración) =====================
// Menú en la hoja para lanzar el formateo cuando se quiera.
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📦 App Cargas')
    .addItem('Dar formato a Registros', 'formatearRegistros')
    .addItem('Migrar: añadir columna Fecha entrega', 'migrarFechaEntrega')
    .addItem('Ver solo registros de HOY', 'filtrarHoy')
    .addItem('Quitar filtro (ver todos)', 'quitarFiltro')
    .addItem('🔍 Auditar "Anulado" en B2B (hoy)', 'auditarAnuladosB2B')
    .addToUi();

  // Aplicar automáticamente el filtro de hoy al abrir
  try { filtrarHoy(); } catch(e) {}
}

// Filtra la hoja Registros para mostrar solo las operaciones de hoy
function filtrarHoy() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const h = ss.getSheetByName(CONFIG_CARGAS.HOJA_REG);
  if (!h || h.getLastRow() < 2) return;
  // Asegurar que hay filtro
  if (!h.getFilter()) {
    h.getRange(1, 1, h.getLastRow(), CAB_REG.length).createFilter();
  }
  const hoy = Utilities.formatDate(new Date(), CONFIG_CARGAS.ZONA_HORARIA, 'dd/MM/yyyy');
  const criterio = SpreadsheetApp.newFilterCriteria()
    .whenTextContains(hoy)
    .build();
  h.getFilter().setColumnFilterCriteria(2, criterio); // col B = Fecha
}

// Quita todos los filtros para ver el histórico completo
function quitarFiltro() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const h = ss.getSheetByName(CONFIG_CARGAS.HOJA_REG);
  if (h && h.getFilter()) h.getFilter().remove();
  // Recrear filtro vacío para que queden los embudos disponibles
  if (h && h.getLastRow() > 0) {
    h.getRange(1, 1, h.getLastRow(), CAB_REG.length).createFilter();
  }
}

// Migración: insertar columna "Fecha entrega/recepción" (col 12) si no existe
function migrarFechaEntrega() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const h = ss.getSheetByName(CONFIG_CARGAS.HOJA_REG);
  if (!h) { SpreadsheetApp.getUi().alert('No existe la hoja Registros.'); return; }

  const cabecera = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0];
  // Buscar la columna "Hora entrega/recepción" (debe estar en col 11)
  let colHora = -1;
  for (let i = 0; i < cabecera.length; i++) {
    if (String(cabecera[i]).trim() === 'Hora entrega/recepción') {
      colHora = i + 1;
      break;
    }
  }

  if (colHora === -1) {
    SpreadsheetApp.getUi().alert('No se encontró la columna "Hora entrega/recepción".');
    return;
  }

  // Si la siguiente columna ya es "Fecha entrega/recepción", no hacer nada
  if (colHora + 1 <= cabecera.length && String(cabecera[colHora]).trim() === 'Fecha entrega/recepción') {
    SpreadsheetApp.getUi().alert('La columna "Fecha entrega/recepción" ya existe.');
    return;
  }

  // Insertar columna a la derecha de "Hora entrega/recepción"
  h.insertColumns(colHora + 1, 1);

  // Poner el nombre en la cabecera (col 12)
  h.getRange(1, colHora + 1).setValue('Fecha entrega/recepción');

  // Rellenar con la fecha del día (col 2 = Fecha, copiar a la nueva col)
  const ultimaFila = h.getLastRow();
  if (ultimaFila > 1) {
    const fechas = h.getRange(2, 2, ultimaFila - 1, 1).getValues(); // col B = Fecha
    for (let i = 0; i < fechas.length; i++) {
      h.getRange(2 + i, colHora + 1).setValue(fechas[i][0]);
    }
  }

  SpreadsheetApp.getUi().alert('✓ Migración completada. Se añadió la columna "Fecha entrega/recepción".');
}

// Aplica formato visual a la hoja Registros: cabecera de color, filtros,
// fila congelada, colores por tipo (carga verde / descarga ámbar), anchos.
function formatearRegistros() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const h = ss.getSheetByName(CONFIG_CARGAS.HOJA_REG);
  if (!h) { SpreadsheetApp.getUi().alert('No existe la hoja Registros todavía.'); return; }

  const ultimaFila = h.getLastRow();
  const numCols = CAB_REG.length;

  // Cabecera
  const cab = h.getRange(1, 1, 1, numCols);
  cab.setBackground('#e30613').setFontColor('#FFFFFF').setFontWeight('bold')
     .setFontSize(11).setHorizontalAlignment('center').setVerticalAlignment('middle');
  h.setRowHeight(1, 34);
  h.setFrozenRows(1);

  // Filtro automático (quitar el anterior si existe)
  if (h.getFilter()) h.getFilter().remove();
  h.getRange(1, 1, Math.max(ultimaFila, 1), numCols).createFilter();

  if (ultimaFila > 1) {
    const datos = h.getRange(2, 1, ultimaFila - 1, numCols);
    // Reset de fondo
    datos.setBackground('#FFFFFF').setFontColor('#1b2733');
    // Bordes suaves
    datos.setBorder(true, true, true, true, true, true, '#e8ecf0', SpreadsheetApp.BorderStyle.SOLID);

    // Colorear por tipo (col 5 = Tipo)
    const tipos = h.getRange(2, 5, ultimaFila - 1, 1).getValues();
    for (let i = 0; i < tipos.length; i++) {
      const fila = h.getRange(2 + i, 1, 1, numCols);
      if (tipos[i][0] === 'Carga') fila.setBackground('#eafbf0');       // verde muy suave
      else if (tipos[i][0] === 'Descarga') fila.setBackground('#fff8e8'); // ámbar muy suave
    }
  }

  // Anchos de columna razonables (17 cols; col 12 = Fecha entrega/recepción)
  const anchos = [150, 90, 60, 130, 90, 95, 140, 95, 90, 80, 110, 90, 90, 70, 90, 110, 120];
  for (let c = 0; c < anchos.length && c < numCols; c++) h.setColumnWidth(c + 1, anchos[c]);

  // Alineación centrada para columnas de horas/fechas/números (cols 8-13)
  h.getRange(1, 8, Math.max(ultimaFila, 1), 6).setHorizontalAlignment('center');

  SpreadsheetApp.getUi().alert('Hoja Registros formateada correctamente.');
}
