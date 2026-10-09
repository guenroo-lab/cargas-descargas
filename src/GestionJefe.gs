/**
 * GestionJefe.gs
 * Pantalla de gestión para el Jefe de Equipo (?view=jefe)
 * - Añadir transporte a la programación del día
 * - Anular un transporte (lo marca 'Anulado', queda visible tachado)
 * - Cada acción envía un correo a administración (todos en copia)
 *
 * También contiene el correo automático de la carga de Mijas 6:30.
 */

// ===================== CONFIGURACIÓN DE CORREOS =====================
const CONFIG_CORREO = {
  // Destinatarios de los avisos de gestión (añadir/anular). Todos reciben el mismo correo.
  ADMINISTRACION: [
    'Pedro.gil@ext.leroymerlin.es',
    'david.delcampo@ext.leroymerlin.es',
    'jose-manuel.lachambre@leroymerlin.es',
    'jose-antonio.alcaide@ext.leroymerlin.es',
    'administracion.alm-malaga@leroymerlin.es',
    'daniel.simo@ext.leroymerlin.es',
    'daniel.arrastio@ext.leroymerlin.es',
    'francisco-javier.camara@ext.leroymerlin.es',
    'sebastian.gelvis@ext.leroymerlin.es'
  ],

  // Destinatarios del correo automático de la carga de Mijas 6:30
  // (puedes añadir más correos a esta lista cuando quieras)
  MIJAS_0630: [
    'manuel.gueto@leroymerlin.es',
    'salvador.gonzalez2@leroymerlin.es',
    'hector.andres@leroymerlin.es',
    'carlos.fuentes@leroymerlin.es',
    'javier-jesus.roman@leroymerlin.es'
  ],

  // Destinatarios del informe semanal de Cargas/Descargas (lunes 8:00, datos
  // de la semana anterior). Lista propia, distinta de ADMINISTRACION — pedido
  // explícito de Pedro, 2026-09-14.
  INFORME_SEMANAL: [
    'francisco-javier.camara@ext.leroymerlin.es',
    'daniel.arrastio@ext.leroymerlin.es',
    'david.delcampo@ext.leroymerlin.es',
    'sebastian.gelvis@ext.leroymerlin.es',
    'pedro.gil@ext.leroymerlin.es',
    'jose-antonio.alcaide@ext.leroymerlin.es',
    'daniel.simo@ext.leroymerlin.es'
  ],

  // Buzón de sugerencias / mejoras / fallos de la app (botón del tablero)
  SUGERENCIAS: 'pedro.gil@ext.leroymerlin.es',

  // Destinatarios EXTRA para los correos de "Transporte añadido"/"Transporte anulado"
  // (jefeAnadirAlB2B / jefeAnularEnB2B), añadidos por encima de ADMINISTRACION según
  // el destino/origen del transporte. Se unen sin duplicar si alguien está en las dos listas.
  EXTRA_GESTION_POR_DESTINO: {
    'Marbella': [
      'pedcliente.marbella@leroymerlin.es',
      'miguel-angel.gonzalez5@leroymerlin.es',
      'jose-maria.marandino@leroymerlin.es',
      'logistica.marbella@leroymerlin.es',
      'francisco-damian.sedeno@leroymerlin.es',
      'david.jimenez2@leroymerlin.es',
      'francisco.alvarez2@leroymerlin.es'
    ],
    'Málaga': [
      'adolfo.garcia@leroymerlin.es',
      'javier.navarro@leroymerlin.es',
      'pedcliente.malaga@leroymerlin.es',
      'logistica.malaga@leroymerlin.es',
      'ivan.perez2@leroymerlin.es',
      'samuel.guerrero@leroymerlin.es'
    ],
    'Mijas': [
      'salvador.gonzalez2@leroymerlin.es',
      'pedcliente.mijas@leroymerlin.es',
      'logistica.mijas@leroymerlin.es',
      'hector.andres@leroymerlin.es',
      'david.jimenez2@leroymerlin.es'
    ]
  },

  REMITENTE_NOMBRE: 'Plataforma Málaga - TAISA'
};

// ===================== PANTALLA JEFE: AÑADIR =====================
function jefeAnadirTransporte(datos) {
  exigirNoSoloDashboard_();
  try {
    const h  = hojaProgr_();
    const id = 'JEF' + new Date().getTime();
    const [hh, mm] = (datos.hora || '00:00').split(':').map(Number);
    const ahora = new Date();
    const horaDate = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), hh, mm);
    const fecha = datos.fecha || Utilities.formatDate(ahora, CONFIG_CARGAS.ZONA_HORARIA, 'dd/MM/yyyy');

    h.appendRow([
      id, fecha, horaDate, datos.tipo, datos.destino,
      (datos.flujos || []).join(', '), datos.soportes || '',
      'Sí', 'Jefe de equipo', 'Pendiente', datos.muelle || '', datos.notas || ''
    ]);

    // Correo a administración
    _enviarCorreoGestion('AÑADIDO', {
      tipo: datos.tipo, destino: datos.destino, hora: datos.hora,
      flujos: (datos.flujos || []).join(', '), soportes: datos.soportes || '-',
      notas: datos.notas || '-', autor: datos.autor || 'Jefe de equipo'
    });

    return { ok: true, mensaje: '✅ Transporte añadido y notificado a administración.' };
  } catch (e) {
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}

// ===================== PANTALLA JEFE: ANULAR =====================
function jefeAnularTransporte(id, autor) {
  exigirNoSoloDashboard_();
  try {
    const h = hojaProgr_();
    const vals = h.getDataRange().getValues();
    for (let i = 1; i < vals.length; i++) {
      if (vals[i][0] === id) {
        h.getRange(i + 1, 10).setValue('Anulado'); // col J = Estado
        const tz = CONFIG_CARGAS.ZONA_HORARIA;
        const hora = vals[i][2] instanceof Date
          ? Utilities.formatDate(vals[i][2], tz, 'HH:mm') : String(vals[i][2]);
        _enviarCorreoGestion('ANULADO', {
          tipo: vals[i][3], destino: vals[i][4], hora: hora,
          flujos: vals[i][5] || '-', soportes: vals[i][6] || '-',
          notas: vals[i][11] || '-', autor: autor || 'Jefe de equipo'
        });
        return { ok: true, mensaje: '✅ Transporte anulado y notificado a administración.' };
      }
    }
    return { ok: false, mensaje: 'No se encontró el transporte.' };
  } catch (e) {
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}

// Devuelve los destinatarios extra según destino/origen, aceptando tanto el nombre
// de la app ("Marbella") como el nombre del B2B ("LM Marbella") — jefeAnadirAlB2B
// manda el primero y jefeAnularEnB2B el segundo, así que hace falta coincidencia
// flexible (por subcadena) en vez de igualdad exacta para que funcione en ambos.
function _destinatariosExtraPorDestino(destinoTexto) {
  const t = String(destinoTexto || '').toLowerCase();
  if (t.indexOf('marbella') > -1) return CONFIG_CORREO.EXTRA_GESTION_POR_DESTINO['Marbella'] || [];
  if (t.indexOf('málaga') > -1 || t.indexOf('malaga') > -1) return CONFIG_CORREO.EXTRA_GESTION_POR_DESTINO['Málaga'] || [];
  if (t.indexOf('mijas') > -1) return CONFIG_CORREO.EXTRA_GESTION_POR_DESTINO['Mijas'] || [];
  return [];
}

// ===================== CORREO DE GESTIÓN (añadir/anular) =====================
function _enviarCorreoGestion(accion, d) {
  exigirNoSoloDashboard_();
  const esAnular = (accion === 'ANULADO');
  const color = esAnular ? '#e30613' : '#22c55e';
  const tz = CONFIG_CARGAS.ZONA_HORARIA;
  const sello = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy 'a las' HH:mm");

  const asunto = '[Plataforma Málaga] Transporte ' + accion + ' · ' + d.destino + ' · ' + (d.fechaTransporte || '') + ' ' + (d.hora || '');

  const html =
    '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#f4f6f8;padding:24px">' +
      '<div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">' +
        '<div style="background:' + color + ';padding:18px 22px">' +
          '<h2 style="margin:0;color:#fff;font-size:18px">Transporte ' + accion + '</h2>' +
          '<p style="margin:4px 0 0;color:rgba(255,255,255,.85);font-size:13px">Plataforma Málaga · TAISA Logistics</p>' +
        '</div>' +
        '<div style="padding:22px">' +
          '<table style="width:100%;border-collapse:collapse;font-size:14px;color:#1b2733">' +
            _fila('Tipo', d.tipo) +
            _fila('Destino / Origen', d.destino) +
            _fila('Fecha del transporte', d.fechaTransporte || '-') +
            _fila('Hora', d.hora || '-') +
            _fila('Flujo', d.flujos) +
            _fila('Soportes', d.soportes) +
            _fila('Notas', d.notas) +
            _fila('Realizado por', d.autor) +
            _fila('Registrado el', sello) +
          '</table>' +
          '<p style="margin:20px 0 0;padding:12px;background:#f0f4ff;border-radius:8px;font-size:13px;color:#38444f">' +
            (esAnular
              ? 'Este transporte ha sido <b>anulado</b>. Por favor, realizad los trámites pertinentes de cancelación.'
              : 'Se ha <b>añadido</b> un nuevo transporte. Por favor, realizad los trámites pertinentes.') +
          '</p>' +
        '</div>' +
      '</div>' +
      '<p style="text-align:center;color:#6b7899;font-size:11px;margin-top:14px">Mensaje automático de la app de Cargas/Descargas · No responder</p>' +
    '</div>';

  // Administración + destinatarios extra según destino/origen (Marbella/Málaga/Mijas),
  // sin duplicar si alguien ya está en ambas listas.
  const extrasDestino = _destinatariosExtraPorDestino(d.destino);
  const vistos = {};
  const destinatarios = [];
  CONFIG_CORREO.ADMINISTRACION.concat(extrasDestino).forEach(function(email) {
    const clave = String(email).trim().toLowerCase();
    if (!vistos[clave]) { vistos[clave] = true; destinatarios.push(email); }
  });

  MailApp.sendEmail({
    to: destinatarios.join(','),
    subject: asunto,
    htmlBody: html,
    name: CONFIG_CORREO.REMITENTE_NOMBRE
  });
}

function _fila(label, valor) {
  return '<tr>' +
    '<td style="padding:8px 0;color:#6b7899;width:42%;border-bottom:1px solid #eef1f4">' + label + '</td>' +
    '<td style="padding:8px 0;font-weight:600;border-bottom:1px solid #eef1f4">' + (valor || '-') + '</td>' +
  '</tr>';
}

// ===================== CORREO AUTOMÁTICO MIJAS 6:30 =====================
// Se llama desde finalizarOperacion() cuando es Carga + Mijas + 6:30
function enviarCorreoMijas0630(op, datos, enlaceFoto) {
  exigirNoSoloDashboard_();
  try {
    const tz = CONFIG_CARGAS.ZONA_HORARIA;
    const hoy = new Date();
    // Siguiente día laborable: si hoy es viernes (5) salta a lunes (+3), sábado (+2), resto +1
    const maniana = new Date(hoy);
    const diaSemana = hoy.getDay(); // 0=dom, 1=lun... 5=vie, 6=sab
    if (diaSemana === 5) maniana.setDate(maniana.getDate() + 3);      // viernes → lunes
    else if (diaSemana === 6) maniana.setDate(maniana.getDate() + 2); // sábado → lunes
    else maniana.setDate(maniana.getDate() + 1);                       // resto → mañana
    const sello = Utilities.formatDate(hoy, tz, 'dd/MM/yyyy HH:mm');
    const fechaEntrega = Utilities.formatDate(maniana, tz, 'dd/MM/yyyy');
    const flujoTxt = (datos.flujos && datos.flujos.length) ? datos.flujos.join(', ') : '-';
    const soportes = datos.soportes || '-';

    const html =
      '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#f4f6f8;padding:24px">' +
        '<div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">' +
          '<div style="background:#9b59b6;padding:18px 22px">' +
            '<h2 style="margin:0;color:#fff;font-size:18px">Expedición Mijas · 6:30</h2>' +
            '<p style="margin:4px 0 0;color:rgba(255,255,255,.85);font-size:13px">Plataforma Málaga · TAISA Logistics</p>' +
          '</div>' +
          '<div style="padding:22px">' +
            '<table style="width:100%;border-collapse:collapse;font-size:14px;color:#1b2733">' +
              _fila('Destino', 'LM Mijas') +
              _fila('Fecha de entrega en tienda', fechaEntrega) +
              _fila('Hora de descarga en tienda', '06:30') +
              _fila('Nº de soportes', soportes) +
              _fila('Flujo', flujoTxt) +
              _fila('Cargado el', sello) +
            '</table>' +
            '<p style="margin:18px 0 6px;font-size:13px;color:#6b7899">Foto de la expedición adjunta a este correo.</p>' +
          '</div>' +
        '</div>' +
      '</div>';

    const opciones = {
      to: CONFIG_CORREO.MIJAS_0630.join(','),
      subject: '[Plataforma Málaga] Expedición Mijas 6:30 · entrega ' + fechaEntrega,
      htmlBody: html,
      name: CONFIG_CORREO.REMITENTE_NOMBRE
    };

    // Adjuntar la foto si existe en Drive
    if (enlaceFoto) {
      try {
        const idFoto = _extraerIdDrive(enlaceFoto);
        if (idFoto) {
          const blob = DriveApp.getFileById(idFoto).getBlob();
          opciones.attachments = [blob];
        }
      } catch (eFoto) { /* si no se puede adjuntar, se envía igual sin foto */ }
    }

    MailApp.sendEmail(opciones);
    return { ok: true };
  } catch (e) {
    return { ok: false, mensaje: e.message };
  }
}

function _extraerIdDrive(url) {
  // Extrae el ID de una URL de Drive del tipo .../d/ID/... o ?id=ID
  let m = String(url).match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = String(url).match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return null;
}


// ===================== CORREO SOLICITUD EXTRA DE TIENDA =====================
// Se llama desde Programacion.gs cuando una tienda envía una carga extra.
function _enviarCorreoSolicitudExtra(d) {
  exigirNoSoloDashboard_();
  const tz = CONFIG_CARGAS.ZONA_HORARIA;
  const sello = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy 'a las' HH:mm");
  const asunto = '[Plataforma Málaga] Solicitud extra · ' + d.tienda + ' · ' + d.fecha + ' ' + d.hora;

  const html =
    '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#f4f6f8;padding:24px">' +
      '<div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">' +
        '<div style="background:#9b59b6;padding:18px 22px">' +
          '<h2 style="margin:0;color:#fff;font-size:18px">Solicitud de carga extra</h2>' +
          '<p style="margin:4px 0 0;color:rgba(255,255,255,.85);font-size:13px">Plataforma Málaga · TAISA Logistics</p>' +
        '</div>' +
        '<div style="padding:22px">' +
          '<table style="width:100%;border-collapse:collapse;font-size:14px;color:#1b2733">' +
            _fila('Tienda', d.tienda) +
            _fila('Fecha de carga', d.fecha) +
            _fila('Hora', d.hora) +
            _fila('Flujo', d.flujos) +
            _fila('Notas', d.notas) +
            _fila('Registrada el', sello) +
          '</table>' +
          '<p style="margin:20px 0 0;padding:12px;background:#f5f0ff;border-radius:8px;font-size:13px;color:#6b3fa0">' +
            'La tienda <b>' + d.tienda + '</b> ha solicitado un camión extra. Por favor, realizad los trámites pertinentes.' +
          '</p>' +
        '</div>' +
      '</div>' +
      '<p style="text-align:center;color:#6b7899;font-size:11px;margin-top:14px">Mensaje automático de la app de Cargas/Descargas · No responder</p>' +
    '</div>';

  MailApp.sendEmail({
    to: CONFIG_CORREO.ADMINISTRACION.join(','),
    subject: asunto,
    htmlBody: html,
    name: CONFIG_CORREO.REMITENTE_NOMBRE
  });
}


// ===================== SUGERENCIAS / FALLOS (botón del tablero) =====================
// Recibe {tipo, autor, texto, foto:{base64,tipo}} desde cargas.html y manda un correo a Pedro.
function enviarSugerencia(datos) {
  exigirNoSoloDashboard_();
  try {
    var texto = (datos && datos.texto ? String(datos.texto) : '').trim();
    if (!texto) return { ok: false, mensaje: 'Escribe tu sugerencia o fallo.' };
    var tz = CONFIG_CARGAS.ZONA_HORARIA;
    var sello = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy 'a las' HH:mm");
    var tipo = (datos.tipo || 'Sugerencia');
    var autor = (datos.autor ? String(datos.autor).trim() : '') || 'Anónimo';
    var colorCab = (tipo === 'Fallo') ? '#e30613' : (tipo === 'Mejora' ? '#3498db' : '#22c55e');
    var textoHtml = texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

    var html =
      '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#f4f6f8;padding:24px">' +
        '<div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">' +
          '<div style="background:' + colorCab + ';padding:18px 22px">' +
            '<h2 style="margin:0;color:#fff;font-size:18px">' + tipo + ' · App Cargas</h2>' +
            '<p style="margin:4px 0 0;color:rgba(255,255,255,.85);font-size:13px">Plataforma Málaga · TAISA Logistics</p>' +
          '</div>' +
          '<div style="padding:22px">' +
            '<table style="width:100%;border-collapse:collapse;font-size:14px;color:#1b2733">' +
              _fila('Tipo', tipo) +
              _fila('Enviado por', autor) +
              _fila('Fecha', sello) +
            '</table>' +
            '<p style="margin:18px 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#6b7899">Mensaje</p>' +
            '<div style="background:#f5f7fa;border:1px solid #eef1f4;border-radius:8px;padding:14px;font-size:14px;color:#1b2733;line-height:1.6">' + textoHtml + '</div>' +
            (datos.foto && datos.foto.base64 ? '<p style="margin:16px 0 0;font-size:13px;color:#6b7899">Imagen adjunta a este correo.</p>' : '') +
          '</div>' +
        '</div>' +
        '<p style="text-align:center;color:#6b7899;font-size:11px;margin-top:14px">Enviado desde el tablero de la app de Cargas/Descargas</p>' +
      '</div>';

    var opciones = {
      to: CONFIG_CORREO.SUGERENCIAS,
      subject: '[App Cargas] ' + tipo + ' · ' + autor,
      htmlBody: html,
      name: CONFIG_CORREO.REMITENTE_NOMBRE
    };

    if (datos.foto && datos.foto.base64) {
      try {
        var b64 = datos.foto.base64.indexOf(',') > -1 ? datos.foto.base64.split(',')[1] : datos.foto.base64;
        var blob = Utilities.newBlob(Utilities.base64Decode(b64), datos.foto.tipo || 'image/jpeg', 'adjunto.jpg');
        opciones.attachments = [blob];
      } catch (eF) { /* si falla el adjunto, se envía igual sin imagen */ }
    }

    MailApp.sendEmail(opciones);
    return { ok: true, mensaje: '¡Gracias! Tu mensaje se ha enviado a Pedro.' };
  } catch (e) {
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}


function probarCorreo() {
  exigirNoSoloDashboard_();
  MailApp.sendEmail({
    to: 'Pedro.gil@ext.leroymerlin.es',
    subject: 'Test correo TAISA app',
    body: 'Si recibes esto, los permisos de correo funcionan correctamente.'
  });
}


// ===================== PRUEBA MANUAL CORREO MIJAS 6:30 =====================
function probarCorreoMijas() {
  exigirNoSoloDashboard_();
  const opSimulada = [
    'TEST-001','5','Manuel Rosas','Carga','tienda','Mijas','06:30',new Date().toISOString()
  ];
  enviarCorreoMijas0630(opSimulada, {flujos:['Carga'],soportes:'20',matricula:'1234ABC'}, '');
  Logger.log('Correo de prueba Mijas 6:30 enviado.');
}

// Reenvía el correo de Mijas 6:30 usando los datos reales de la última carga
// de Mijas que hay en la hoja Registros. Ejecútala manualmente desde Apps Script.
function reenviarCorreoMijasUltimo() {
  exigirNoSoloDashboard_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const h = ss.getSheetByName(CONFIG_CARGAS.HOJA_REG);
  if (!h) { Logger.log('No existe la hoja Registros.'); return; }

  const datos = h.getDataRange().getValues();
  // Buscar la última fila que sea Carga + Mijas (de arriba a abajo, coge la última)
  var filaEncontrada = null;
  for (let i = 1; i < datos.length; i++) {
    if (String(datos[i][4]).trim() === 'Carga' && String(datos[i][6]).trim() === 'Mijas') {
      filaEncontrada = datos[i];
    }
  }
  if (!filaEncontrada) { Logger.log('No se encontró ninguna carga de Mijas en Registros.'); return; }

  // Reconstruir op[] con el orden de CAB_REG
  // ID(0),Fecha(1),Muelle(2),Cargador(3),Tipo(4),Cat(5),Destino(6),HoraCom(7),HoraFin(8),Dur(9),HoraEnt(10),YMS(11),Flujo(12),Soportes(13),Matricula(14),Foto(15)
  const op = [
    filaEncontrada[0],  // ID
    filaEncontrada[2],  // Muelle
    filaEncontrada[3],  // Cargador
    filaEncontrada[4],  // Tipo
    filaEncontrada[5],  // Categoría
    filaEncontrada[6],  // Destino
    filaEncontrada[10], // Hora entrega
    filaEncontrada[7]   // Hora comienzo
  ];
  const datosOp = {
    flujos: String(filaEncontrada[12] || '').split(',').map(function(x){return x.trim();}),
    soportes: String(filaEncontrada[13] || ''),
    matricula: String(filaEncontrada[14] || '')
  };
  const enlaceFoto = String(filaEncontrada[15] || '');

  enviarCorreoMijas0630(op, datosOp, enlaceFoto);
  Logger.log('Correo reenviado para: ' + op[2] + ' | Muelle ' + op[1] + ' | ' + op[6]);
}

// ===================== INFORME SEMANAL CARGAS/DESCARGAS =====================
// Correo automático cada lunes 8:00 con el resumen de la semana anterior
// (lunes a domingo). Pedido explícito de Pedro, 2026-09-14.

// Orden de presentación en la tabla "Por destino/origen" (tiendas, luego
// plataformas, luego agencias). Cualquier destino que aparezca en Registros
// y no esté aquí se añade al final, ordenado por total de operaciones.
const ORDEN_DESTINOS_INFORME = [
  'Málaga', 'Mijas', 'Marbella', 'Granada',
  'Valencia', 'Torija', 'Meco', 'Antequera',
  'Remansur', 'Correcaminos Granada'
];

// Semana ANTERIOR completa (lunes a domingo), a diferencia de _rangoPeriodo_('semana')
// que es la semana EN CURSO (usada por el ranking del Dashboard).
function _rangoSemanaAnterior_() {
  const ahora = new Date();
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const offsetLunes = (hoy.getDay() === 0) ? 6 : hoy.getDay() - 1;
  const lunesEstaSemana = new Date(hoy); lunesEstaSemana.setDate(hoy.getDate() - offsetLunes);
  const hasta = new Date(lunesEstaSemana); hasta.setDate(lunesEstaSemana.getDate() - 1); // domingo pasado
  const desde = new Date(hasta); desde.setDate(hasta.getDate() - 6); // lunes pasado
  return { desde: desde, hasta: hasta };
}

// Lee Registros una vez y agrega KPIs + por destino + por cargador para el
// rango de fechas dado. Mismo criterio que obtenerRankingCompleto (cada fila
// de Registros ya es la aportación individual de una persona; con multi-
// cargador la operación ya viene partida en 2 filas, así que se suma
// directamente sin volver a dividir).
function _datosInformeSemanal_(rango) {
  const tz = CONFIG_CARGAS.ZONA_HORARIA;
  const porDestino = {}, porCargador = {};
  let totalOps = 0, totalCargas = 0, totalDescargas = 0, totalSoportes = 0;

  const hReg = _ss().getSheetByName(CONFIG_CARGAS.HOJA_REG);
  if (hReg && hReg.getLastRow() > 1) {
    const datos = hReg.getRange(2, 1, hReg.getLastRow() - 1, CAB_REG.length).getValues();
    for (let i = 0; i < datos.length; i++) {
      const f = datos[i];
      if (!f[0] || !f[3]) continue;
      const fecha = _fechaRegADate_(f[1]);
      if (!fecha || fecha < rango.desde || fecha > rango.hasta) continue;

      const cargador = String(f[3]).trim();
      const tipo = String(f[4] || '').trim();
      const destino = String(f[6] || '').trim() || '(sin destino)';
      const dur = Number(f[9]) || 0;
      const sop = Number(f[14]) || 0;
      const esCarga = (tipo === 'Carga');

      totalOps++; totalSoportes += sop;
      if (esCarga) totalCargas++; else if (tipo === 'Descarga') totalDescargas++;

      if (!porDestino[destino]) porDestino[destino] = { destino: destino, cargas: 0, descargas: 0, soportes: 0 };
      const d = porDestino[destino];
      if (esCarga) d.cargas++; else if (tipo === 'Descarga') d.descargas++;
      d.soportes += sop;

      if (!porCargador[cargador]) porCargador[cargador] = { nombre: cargador, cargas: 0, descargas: 0, total: 0, soportes: 0, sumaMin: 0, nMin: 0 };
      const c = porCargador[cargador];
      c.total++;
      if (esCarga) c.cargas++; else if (tipo === 'Descarga') c.descargas++;
      c.soportes += sop;
      if (dur > 0) { c.sumaMin += dur; c.nMin++; }
    }
  }

  // Destinos: orden fijo primero (solo los que tuvieron actividad), luego el resto por total desc
  const vistos = {};
  const destinosOrdenados = [];
  ORDEN_DESTINOS_INFORME.forEach(function(nombre) {
    if (porDestino[nombre]) { destinosOrdenados.push(porDestino[nombre]); vistos[nombre] = true; }
  });
  Object.keys(porDestino).forEach(function(nombre) {
    if (!vistos[nombre]) destinosOrdenados.push(porDestino[nombre]);
  });
  destinosOrdenados.sort(function(a, b) {
    const ia = ORDEN_DESTINOS_INFORME.indexOf(a.destino), ib = ORDEN_DESTINOS_INFORME.indexOf(b.destino);
    if (ia === -1 && ib === -1) return (b.cargas + b.descargas) - (a.cargas + a.descargas);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  const cargadoresOrdenados = Object.keys(porCargador).map(function(k) {
    const c = porCargador[k];
    return {
      nombre: c.nombre, cargas: c.cargas, descargas: c.descargas, total: c.total,
      soportes: Math.round(c.soportes * 10) / 10,
      mediaMin: c.nMin ? Math.round(c.sumaMin / c.nMin) : 0
    };
  }).sort(function(a, b) { return b.total - a.total; });

  return {
    desde: Utilities.formatDate(rango.desde, tz, 'dd/MM/yyyy'),
    hasta: Utilities.formatDate(rango.hasta, tz, 'dd/MM/yyyy'),
    totalOps: totalOps, totalCargas: totalCargas, totalDescargas: totalDescargas,
    totalSoportes: Math.round(totalSoportes * 10) / 10,
    destinos: destinosOrdenados, cargadores: cargadoresOrdenados
  };
}

function _filaDestinoInforme_(d) {
  return '<tr>' +
    '<td style="padding:7px 8px;border-bottom:1px solid #eef1f4;font-weight:600">' + d.destino + '</td>' +
    '<td style="text-align:right;padding:7px 8px;border-bottom:1px solid #eef1f4">' + (d.cargas || '—') + '</td>' +
    '<td style="text-align:right;padding:7px 8px;border-bottom:1px solid #eef1f4">' + (d.descargas || '—') + '</td>' +
    '<td style="text-align:right;padding:7px 8px;border-bottom:1px solid #eef1f4">' + d.soportes + '</td>' +
  '</tr>';
}

function _filaCargadorInforme_(c) {
  return '<tr>' +
    '<td style="padding:7px 8px;border-bottom:1px solid #eef1f4;font-weight:600">' + c.nombre + '</td>' +
    '<td style="text-align:right;padding:7px 8px;border-bottom:1px solid #eef1f4">' + c.cargas + '</td>' +
    '<td style="text-align:right;padding:7px 8px;border-bottom:1px solid #eef1f4">' + c.descargas + '</td>' +
    '<td style="text-align:right;padding:7px 8px;border-bottom:1px solid #eef1f4;font-weight:700">' + c.total + '</td>' +
    '<td style="text-align:right;padding:7px 8px;border-bottom:1px solid #eef1f4">' + c.soportes + '</td>' +
    '<td style="text-align:right;padding:7px 8px;border-bottom:1px solid #eef1f4">' + (c.mediaMin ? c.mediaMin + ' min' : '—') + '</td>' +
  '</tr>';
}

// Cabecera "TAISA LOGISTICS" (logo cuadrado, mismo de Dashboard.html) + franja
// roja + banda gris con el rango de semana. Diseño corporativo, no el genérico
// de una sola franja de color plano (pedido explícito de Pedro, 2026-09-14).
function _htmlInformeSemanal_(d) {
  const kpi = function(bg, valor, label) {
    return '<td style="width:25%;padding:4px"><div style="background:' + bg + ';border-radius:8px;padding:12px 8px;text-align:center">' +
      '<div style="font-size:22px;font-weight:800;color:#1b2733">' + valor + '</div>' +
      '<div style="font-size:10.5px;color:#6b7899;text-transform:uppercase;letter-spacing:.3px">' + label + '</div></div></td>';
  };
  const tablaDestinos = d.destinos.length
    ? d.destinos.map(_filaDestinoInforme_).join('')
    : '<tr><td colspan="4" style="padding:12px 8px;color:#6b7899">Sin operaciones esta semana.</td></tr>';
  const tablaCargadores = d.cargadores.length
    ? d.cargadores.map(_filaCargadorInforme_).join('')
    : '<tr><td colspan="6" style="padding:12px 8px;color:#6b7899">Sin operaciones esta semana.</td></tr>';

  return '<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;background:#f4f6f8;padding:24px">' +
    '<div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">' +

      '<table role="presentation" style="width:100%;border-collapse:collapse;background:#1b2733;border-bottom:4px solid #e30613"><tr>' +
        '<td style="width:58px;padding:20px 0 20px 26px;vertical-align:middle"><img src="' + LOGO_TAISA_B64_INFORME + '" alt="TAISA Logistics" height="40" style="display:block;height:40px;width:auto"></td>' +
        '<td style="padding:20px 26px 20px 16px;vertical-align:middle">' +
          '<div style="color:#ffffff;font-size:18px;font-weight:800;letter-spacing:.5px">INFORME SEMANAL</div>' +
          '<div style="color:#9aa7b8;font-size:12px;margin-top:3px">Cargas y Descargas &middot; Plataforma M&aacute;laga</div>' +
        '</td>' +
      '</tr></table>' +
      '<table role="presentation" style="width:100%;border-collapse:collapse;background:#f4f6f8;border-bottom:1px solid #e5e9ee"><tr>' +
        '<td style="padding:10px 26px;font-size:12.5px;color:#57657a">Semana del <b style="color:#1b2733">' + d.desde + '</b> al <b style="color:#1b2733">' + d.hasta + '</b></td>' +
        '<td style="padding:10px 26px;text-align:right"><span style="display:inline-block;font-size:10px;color:#fff;background:#e30613;padding:4px 11px;border-radius:20px;font-weight:700;letter-spacing:.4px">TAISA LOGISTICS</span></td>' +
      '</tr></table>' +

      '<div style="padding:22px">' +
        '<table style="width:100%;border-collapse:collapse;margin-bottom:22px"><tr>' +
          kpi('#f0f4ff', d.totalOps, 'Operaciones') +
          kpi('#eafaf0', d.totalCargas, 'Cargas') +
          kpi('#fff3e0', d.totalDescargas, 'Descargas') +
          kpi('#fdeaea', d.totalSoportes, 'Soportes') +
        '</tr></table>' +

        '<div style="font-size:12px;font-weight:700;color:#e30613;text-transform:uppercase;letter-spacing:.3px;margin-bottom:8px">Por destino / origen</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:13px;color:#1b2733;margin-bottom:22px">' +
          '<tr style="background:#f4f6f8"><th style="text-align:left;padding:7px 8px;color:#6b7899;font-size:11px">Destino</th><th style="text-align:right;padding:7px 8px;color:#6b7899;font-size:11px">Cargas</th><th style="text-align:right;padding:7px 8px;color:#6b7899;font-size:11px">Descargas</th><th style="text-align:right;padding:7px 8px;color:#6b7899;font-size:11px">Soportes</th></tr>' +
          tablaDestinos +
        '</table>' +

        '<div style="font-size:12px;font-weight:700;color:#e30613;text-transform:uppercase;letter-spacing:.3px;margin-bottom:8px">Rendimiento por cargador</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:13px;color:#1b2733">' +
          '<tr style="background:#f4f6f8"><th style="text-align:left;padding:7px 8px;color:#6b7899;font-size:11px">Cargador</th><th style="text-align:right;padding:7px 8px;color:#6b7899;font-size:11px">Cargas</th><th style="text-align:right;padding:7px 8px;color:#6b7899;font-size:11px">Descargas</th><th style="text-align:right;padding:7px 8px;color:#6b7899;font-size:11px">Total</th><th style="text-align:right;padding:7px 8px;color:#6b7899;font-size:11px">Soportes</th><th style="text-align:right;padding:7px 8px;color:#6b7899;font-size:11px">Media/op</th></tr>' +
          tablaCargadores +
        '</table>' +

        '<p style="margin:20px 0 0;padding:12px;background:#f0f4ff;border-radius:8px;font-size:12.5px;color:#38444f">' +
          'Informe autom&aacute;tico generado cada <b>lunes a las 8:00</b> con los datos de la semana anterior (lunes a domingo).' +
        '</p>' +
      '</div>' +
    '</div>' +
    '<p style="text-align:center;color:#6b7899;font-size:11px;margin-top:14px">Mensaje autom&aacute;tico de la app de Cargas/Descargas &middot; No responder</p>' +
  '</div>';
}

// Genera el informe (datos reales de Registros) y lo devuelve SIN enviarlo —
// para previsualizar antes de mandarlo de verdad. Ejecutar manualmente desde
// el editor de Apps Script (Ver > Registros para el enlace, o Ejecución >
// Registro de ejecución para copiar el HTML devuelto).
function previsualizarInformeSemanal() {
  const datos = _datosInformeSemanal_(_rangoSemanaAnterior_());
  const html = _htmlInformeSemanal_(datos);
  Logger.log(JSON.stringify(datos));
  return { datos: datos, html: html };
}

// Envío real del informe semanal a CONFIG_CORREO.INFORME_SEMANAL. Se llama
// desde el trigger semanal (instalarTriggerInformeSemanal) y también se
// puede ejecutar a mano para mandar el informe fuera de hora si el trigger
// automático ya pasó ese día.
function enviarInformeSemanal() {
  const datos = _datosInformeSemanal_(_rangoSemanaAnterior_());
  const html = _htmlInformeSemanal_(datos);
  MailApp.sendEmail({
    to: CONFIG_CORREO.INFORME_SEMANAL.join(','),
    subject: '[Plataforma Málaga] Informe semanal Cargas/Descargas · ' + datos.desde + ' - ' + datos.hasta,
    htmlBody: html,
    name: CONFIG_CORREO.REMITENTE_NOMBRE
  });
  Logger.log('Informe semanal enviado a: ' + CONFIG_CORREO.INFORME_SEMANAL.join(', '));
  return { ok: true, desde: datos.desde, hasta: datos.hasta, totalOps: datos.totalOps };
}

// Instala el trigger semanal (lunes 8:00-9:00). Ejecutar UNA VEZ a mano desde
// el editor de Apps Script. Borra cualquier trigger anterior de la misma
// función antes de crear el nuevo, para no duplicar envíos si se re-ejecuta.
function instalarTriggerInformeSemanal() {
  exigirNoSoloDashboard_();
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'enviarInformeSemanal') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('enviarInformeSemanal')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(8)
    .create();
  Logger.log('Trigger semanal instalado: enviarInformeSemanal, lunes 8:00-9:00.');
}
