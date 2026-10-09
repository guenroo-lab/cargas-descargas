/**
 * Programacion.gs
 * Módulo de programación diaria de camiones
 * Se añade al proyecto Apps Script junto a CargasDescargas.gs
 *
 * Hoja 'Programacion': programación fija + extras de tiendas
 * Las tiendas acceden via ?view=tiendas
 * El Dashboard lee getProgramacionHoy()
 */

const CAB_PROG = [
  'ID', 'Fecha', 'Hora', 'Tipo', 'Origen/Destino', 'Flujo',
  'Soportes est.', 'Extra', 'Añadido por', 'Estado', 'Muelle asignado', 'Notas'
];

// ── Devuelve la hoja Programacion, creándola si no existe ──────────
function hojaProgr_() {
  const ss = _ss(); // reutiliza la función de CargasDescargas.gs
  let h = ss.getSheetByName('Programacion');
  if (!h) {
    h = ss.insertSheet('Programacion');
    h.appendRow(CAB_PROG);
    const rng = h.getRange(1, 1, 1, CAB_PROG.length);
    rng.setFontWeight('bold').setBackground('#3498db').setFontColor('#FFFFFF');
    h.setFrozenRows(1);
    // Formato de fecha en col B y hora en col C
    h.getRange('B:B').setNumberFormat('dd/MM/yyyy');
    h.getRange('C:C').setNumberFormat('HH:mm');
  }
  return h;
}

// ── Programación del día actual (para el Dashboard) ───────────────
function getProgramacionHoy() {
  const tz  = CONFIG_CARGAS.ZONA_HORARIA;
  const hoy = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy');
  const h   = hojaProgr_();
  const vals = h.getDataRange().getValues();
  const resultado = [];

  for (let i = 1; i < vals.length; i++) {
    const f = vals[i];
    if (!f[0]) continue;
    const fechaFila = f[1] instanceof Date
      ? Utilities.formatDate(f[1], tz, 'dd/MM/yyyy')
      : String(f[1]);
    if (fechaFila !== hoy) continue;

    const hora = f[2] instanceof Date
      ? Utilities.formatDate(f[2], tz, 'HH:mm')
      : String(f[2]);

    resultado.push({
      id:         f[0],
      fecha:      fechaFila,
      hora:       hora,
      tipo:       f[3],
      destino:    f[4],
      flujo:      f[5],
      soportes:   f[6],
      extra:      f[7],
      anadidoPor: f[8],
      estado:     f[9] || 'Pendiente',
      muelle:     f[10] || '',
      notas:      f[11] || ''
    });
  }

  // Ordenar por hora
  resultado.sort((a, b) => a.hora.localeCompare(b.hora));
  return resultado;
}

// ── Las tiendas añaden una carga extra ────────────────────────────
function anadirCargaExtra(datos) {
  exigirNoSoloDashboard_();
  try {
    const h   = hojaProgr_();
    const tz  = CONFIG_CARGAS.ZONA_HORARIA;
    const id  = 'EXT' + new Date().getTime();
    const hoy = new Date();

    // Parsear fecha enviada (dd/MM/yyyy)
    let fecha = datos.fecha;
    // Parsear hora (HH:mm) como objeto Date para que Sheets la formatee bien
    const [hh, mm] = (datos.hora || '00:00').split(':').map(Number);
    const horaDate = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), hh, mm);

    h.appendRow([
      id,
      fecha,
      horaDate,
      'Descarga',          // las tiendas siempre envían descarga hacia plataforma
      datos.tienda,
      (datos.flujos || []).join(', '),
      datos.soportes || '',
      'Sí',
      datos.tienda,
      'Pendiente',
      '',
      datos.notas || ''
    ]);

    // Correo automático a administración
    try {
      _enviarCorreoSolicitudExtra({
        tienda: datos.tienda,
        fecha: fecha,
        hora: datos.hora,
        flujos: (datos.flujos || []).join(', ') || '-',
        notas: datos.notas || '-'
      });
    } catch(eC){}

    return { ok: true, mensaje: '✅ Carga extra registrada correctamente.' };
  } catch (e) {
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}

// ── Slots ya ocupados para una fecha dada ─────────────────────────
// Devuelve array de strings "HH:mm" que ya tienen entrada en Programacion ese día
function getSlotsOcupados(fecha) {
  // fecha llega en formato dd/MM/yyyy
  const h    = hojaProgr_();
  const vals = h.getDataRange().getValues();
  const tz   = CONFIG_CARGAS.ZONA_HORARIA;
  const ocup = [];

  for (let i = 1; i < vals.length; i++) {
    const f = vals[i];
    if (!f[0]) continue;
    const fechaFila = f[1] instanceof Date
      ? Utilities.formatDate(f[1], tz, 'dd/MM/yyyy')
      : String(f[1]);
    if (fechaFila !== fecha) continue;
    const hora = f[2] instanceof Date
      ? Utilities.formatDate(f[2], tz, 'HH:mm')
      : String(f[2]).substring(0, 5);
    if (hora) ocup.push(hora);
  }
  return ocup;
}
function anadirProgramacionFija(datos) {
  exigirNoSoloDashboard_();
  try {
    const h  = hojaProgr_();
    const id = 'PRG' + new Date().getTime();
    const [hh, mm] = (datos.hora || '00:00').split(':').map(Number);
    const [dd, mo, aa] = (datos.fecha || '').split('/').map(Number);
    const horaDate = new Date(aa, mo - 1, dd, hh, mm);

    h.appendRow([
      id, datos.fecha, horaDate, datos.tipo, datos.destino,
      (datos.flujos || []).join(', '), datos.soportes || '',
      'No', 'Plataforma', 'Pendiente', datos.muelle || '', datos.notas || ''
    ]);
    return { ok: true, mensaje: 'Programación añadida.' };
  } catch (e) {
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}

// ── Actualizar estado de una entrada programada ───────────────────
function actualizarEstadoProg(id, nuevoEstado) {
  exigirNoSoloDashboard_();
  try {
    const h    = hojaProgr_();
    const vals = h.getDataRange().getValues();
    for (let i = 1; i < vals.length; i++) {
      if (vals[i][0] === id) {
        h.getRange(i + 1, 10).setValue(nuevoEstado); // col J = Estado
        return { ok: true };
      }
    }
    return { ok: false, mensaje: 'No encontrado.' };
  } catch (e) {
    return { ok: false, mensaje: e.message };
  }
}
