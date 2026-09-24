/**
 * GenerixEventos.gs
 * Lectura de los eventos de soportes que la extensión de Chrome manda a un
 * receptor separado (proyecto "generix-events-receiver", público sin login
 * porque los content scripts no pueden llevar la cookie de sesión de Google
 * en peticiones entre dominios distintos). Ese receptor escribe en la MISMA
 * hoja "GENERIX_EVENTOS" de este Spreadsheet.
 *
 * Aquí solo se LEE, para la vista de solo lectura ?view=generix.
 * No hay cruce con EnCurso/Registros: proyecto_cargas no maneja pedidos ni
 * soportes individuales, así que esto es una vista independiente agrupada
 * por Tienda/Nombre tienda, campos que vienen de Generix.
 */

const CAB_GENERIX = ['Nº Soporte', 'Situación', 'Referencia Pedido', 'Tienda', 'Nombre tienda', 'Personal', 'Primera vez visto', 'Última actualización'];

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
