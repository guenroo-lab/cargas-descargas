// Comprueba el cierre del despliegue «solo dashboard» (ver CLAUDE.md). Ejecutar ANTES de cada despliegue:
//   node comprobar_cierre.js
// Falla (código de salida 1) si:
//  - hay una función pública (nombre sin «_» al final) que no está clasificada en las listas de abajo;
//  - una función cerrada no empieza por exigirNoSoloDashboard_(); o una abierta la llama;
//  - el Dashboard puede llegar (directa o indirectamente) a una función cerrada;
//  - el ID del despliegue o el correo del dueño del código no son los reales;
//  - la simulación de Apps Script (cada combinación de dirección y persona) no da lo esperado.
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = path.join(__dirname, 'src');

// ───────────── CLASIFICACIÓN (editar aquí al añadir funciones públicas) ─────────────
// 1) Escriben datos / mandan correos / tocan disparadores: CERRADAS en «solo dashboard» (salvo para el dueño).
const CERRADAS = [
  'iniciarOperacion', 'finalizarOperacion', 'cancelarOperacion', 'migrarFechaEntrega', 'formatearRegistros',
  'escribirEnB2B', 'probarEscrituraB2B', 'jefeAnadirAlB2B', 'jefeAnularEnB2B',
  'jefeAnadirTransporte', 'jefeAnularTransporte', '_enviarCorreoGestion', '_enviarCorreoSolicitudExtra', 'enviarCorreoMijas0630',
  'enviarSugerencia', 'probarCorreo', 'probarCorreoMijas', 'reenviarCorreoMijasUltimo', 'instalarTriggerInformeSemanal',
  'anadirCargaExtra', 'anadirProgramacionFija', 'actualizarEstadoProg',
];
// 2) Lo único que llama el Dashboard desde el navegador.
const DASHBOARD = ['obtenerDashboard', 'obtenerRankingCompleto'];
// 3) Puntos de entrada de Apps Script (no se llaman con google.script.run en la práctica).
const ENTRADA = ['doGet', 'onOpen'];
// 4) Disparadores reales: NO se cierran. Fuera de una llamada de la página getUrl() no es fiable (medido) y no se puede
//    comprobar a quién pertenece el disparador sin esperar a que salte; cerrarlo arriesga el informe semanal.
//    Lo peor que hace quien lo llame desde la consola es mandar el informe otra vez a la lista de administración.
const DISPARADORES = ['enviarInformeSemanal'];
// 5) Solo leen, solo cambian el filtro de vista del Sheet (lo usan otros editores desde el menú) o son ayudantes puros:
//    siguen abiertas a propósito. Si alguna pasara a escribir datos, moverla a CERRADAS.
const LECTURAS = [
  '_aMinutos', '_esAnulado', '_flujoB2B', '_horaAFraccion', '_invalidarCachePlan', '_leerPlanDelDiaB2B', '_letraCol', '_lugarB2B', '_nombreHojaB2B', '_resolverFilaAnular',
  'auditarAnuladosB2B', 'diagnosticarB2B', 'diagnosticarColumnaH', 'diagnosticarColumnas', 'diagnosticarExpediciones', 'diagnosticarFecha', 'diagnosticarHoras', 'diagnosticarPlanDia',
  'getCargasPendientesB2B', 'getPlanDelDiaB2B', 'getSiguienteDescargaTienda',
  '_ss', 'getHorasUsadasHoy', 'obtenerConfig', 'obtenerEstado',
  'obtenerEventosGenerixAgrupados',
  '_destinatariosExtraPorDestino', '_extraerIdDrive', '_fila', 'previsualizarInformeSemanal',
  'getProgramacionHoy', 'getSlotsOcupados',
  'filtrarHoy', 'quitarFiltro',
];

// Datos reales, escritos aquí a propósito y aparte del código: así el comprobador detecta si se cambian por error.
const ID_PRODUCCION = 'AKfycby54-q25pbCrtpEUhVSNK033iE6NPEKnq3qhd-OK4Vb7VLw1oVDB6BO_leHdk9_Fx4YJA';
const ID_DASHBOARD_REAL = 'AKfycbxkUX97zEWjzYJ48OFDqZUHGJKWaKj1gE9XGJkdkOj-nUoucUPNfEtxO68kI76KTfK3hg';
const ID_OTRO_ANTIGUO = 'AKfycbyHk-0i8YeBq6ueijIHKXmsiit_PZIdyFPVNorkComKCCyRwWRp'; // lo que devolvió getUrl() en un disparador (2026-10-09)
const EMAIL_DUENO_REAL = 'pedro.gil@ext.leroymerlin.es';
const MENSAJE_BLOQUEO = 'Acción no disponible desde esta dirección.';

let fallos = 0;
const ok = (msg) => console.log('  ok   ' + msg);
const mal = (msg) => { fallos++; console.log('  FALLA ' + msg); };

// ───────────── análisis estático ─────────────
function limpiar(src) {
  let out = '', i = 0, n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && d === '*') { out += '  '; i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; } out += '  '; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out += q; i++;
      while (i < n && src[i] !== q) { if (src[i] === '\\') { out += '  '; i += 2; continue; } out += src[i] === '\n' ? '\n' : ' '; i++; }
      out += q; i++; continue;
    }
    out += c; i++;
  }
  return out;
}
const archivos = fs.readdirSync(dir).filter(f => f.endsWith('.gs'));
const fuente = {};
const funcs = {};
for (const f of archivos) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  fuente[f] = src;
  const limpio = limpiar(src);
  const re = /^function\s+([A-Za-z0-9_$]+)\s*\(/gm;
  let m;
  while ((m = re.exec(limpio))) {
    const ini = limpio.indexOf('{', m.index);
    let prof = 0, j = ini;
    for (; j < limpio.length; j++) { if (limpio[j] === '{') prof++; else if (limpio[j] === '}') { prof--; if (prof === 0) break; } }
    funcs[m[1]] = { archivo: f, cuerpo: limpio.slice(ini + 1, j) };
  }
}
const nombres = Object.keys(funcs);
for (const n of nombres) funcs[n].llama = nombres.filter(o => o !== n && new RegExp('(^|[^A-Za-z0-9_$.])' + o.replace(/\$/g, '\\$') + '\\s*\\(').test(funcs[n].cuerpo));
const publicas = nombres.filter(n => !/_$/.test(n));

console.log('1) Clasificación de las funciones públicas (' + publicas.length + ')');
const listas = { CERRADAS, DASHBOARD, ENTRADA, DISPARADORES, LECTURAS };
for (const [nom, lista] of Object.entries(listas)) for (const n of lista) if (!funcs[n]) mal(nom + ' menciona «' + n + '», que ya no existe (quitarla de la lista)');
for (const n of publicas) {
  const en = Object.entries(listas).filter(([, l]) => l.includes(n)).map(([k]) => k);
  if (en.length === 0) mal('función pública SIN CLASIFICAR: ' + n + ' (' + funcs[n].archivo + '). Si escribe, manda correo o toca disparadores: ponle exigirNoSoloDashboard_(); como primera línea y añádela a CERRADAS. Si solo lee: a LECTURAS. Si solo la usa el código: renómbrala con «_» al final.');
  else if (en.length > 1) mal(n + ' está en varias listas: ' + en.join(', '));
}
if (!fallos) ok('todas clasificadas, ninguna repetida');

console.log('2) Las cerradas empiezan por exigirNoSoloDashboard_(); y las demás no la llaman');
for (const n of CERRADAS.filter(n => funcs[n])) {
  const primera = funcs[n].cuerpo.replace(/^\s+/, '').split(/\r?\n/)[0].trim();
  if (primera !== 'exigirNoSoloDashboard_();') mal(n + ': la primera sentencia es «' + primera + '»');
}
for (const n of nombres.filter(n => !CERRADAS.includes(n) && n !== 'exigirNoSoloDashboard_'))
  if (/exigirNoSoloDashboard_\s*\(/.test(funcs[n].cuerpo)) mal(n + ' llama a exigirNoSoloDashboard_ pero no está en CERRADAS');
for (const n of ['esDeploySoloDashboard_', 'exigirNoSoloDashboard_', 'emailActivo_']) if (!funcs[n]) mal('falta la función ' + n);
ok('revisadas ' + CERRADAS.length + ' cerradas');

console.log('3) El Dashboard no puede llegar a ninguna función cerrada');
const alcanzables = new Set();
const rec = (n) => { if (alcanzables.has(n) || !funcs[n]) return; alcanzables.add(n); funcs[n].llama.forEach(rec); };
['doGet', ...DASHBOARD].forEach(rec);
const choques = [...alcanzables].filter(n => CERRADAS.includes(n));
if (choques.length) mal('desde el Dashboard se llega a funciones cerradas: ' + choques.join(', ')); else ok('alcanzables desde el Dashboard: ' + [...alcanzables].join(', '));

console.log('4) Qué llama cada pantalla con google.script.run');
const reRun = /google\.script\.run((?:\s*\.\s*(?:withSuccessHandler|withFailureHandler|withUserObject)\s*\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\))*)\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
for (const h of fs.readdirSync(dir).filter(f => f.endsWith('.html'))) {
  const t = fs.readFileSync(path.join(dir, h), 'utf8');
  const llamadas = new Set(); let m;
  while ((m = reRun.exec(t))) if (!/^with/.test(m[2])) llamadas.add(m[2]);
  const total = (t.match(/google\.script\.run/g) || []).length;
  if (total > 0 && llamadas.size === 0) mal(h + ': tiene google.script.run pero no consigo ver qué función llama');
  for (const n of llamadas) if (!funcs[n]) mal(h + ' llama a «' + n + '», que no existe en los .gs');
  if (h === 'Dashboard.html') for (const n of llamadas) if (!DASHBOARD.includes(n)) mal('Dashboard.html llama a «' + n + '» y no está en DASHBOARD: en «solo dashboard» fallaría si está cerrada, o ampliaría lo que se ve');
}
ok('pantallas revisadas');

// ───────────── datos reales ─────────────
console.log('5) ID del despliegue y dueño del script');
const mDash = fuente['CargasDescargas.gs'].match(/const ID_DEPLOY_SOLO_DASHBOARD = '([^']+)'/);
if (!mDash) mal('no encuentro ID_DEPLOY_SOLO_DASHBOARD'); else if (mDash[1] !== ID_DASHBOARD_REAL) mal('ID_DEPLOY_SOLO_DASHBOARD del código (' + mDash[1] + ') no es el del deployment «solo dashboard» (' + ID_DASHBOARD_REAL + '). Si se ha recreado el deployment, cambiar el ID en CargasDescargas.gs Y en este archivo');
const mDueno = fuente['CargasDescargas.gs'].match(/const EMAIL_DUENO_SCRIPT = '([^']+)'/);
if (!mDueno) mal('no encuentro EMAIL_DUENO_SCRIPT'); else if (mDueno[1] !== EMAIL_DUENO_REAL) mal('EMAIL_DUENO_SCRIPT del código (' + mDueno[1] + ') no es el del dueño real (' + EMAIL_DUENO_REAL + ')');
if (mDash && mDueno && mDash[1] === ID_DASHBOARD_REAL && mDueno[1] === EMAIL_DUENO_REAL) ok('coinciden con los reales');

// ───────────── simulación de Apps Script ─────────────
console.log('6) Simulación: cada combinación de dirección y persona');
const urlDe = (id) => 'https://script.google.com/a/ext.leroymerlin.es/macros/s/' + id + '/exec'; // formato de getUrl() medido el 2026-10-09

function crearEntorno(getUrl, email) {
  const tocado = [];
  const prohibido = (nombre) => new Proxy(function () {}, {
    get(_, p) { if (p === Symbol.toPrimitive || p === 'toJSON') return undefined; tocado.push(nombre + '.' + String(p)); throw new Error('TOCADO ' + nombre + '.' + String(p)); },
    apply() { tocado.push(nombre + '()'); throw new Error('TOCADO ' + nombre + '()'); },
  });
  const salidas = [];
  const html = { createHtmlOutputFromFile(n) { salidas.push(n); const o = { setTitle: () => o, addMetaTag: () => o, setXFrameOptionsMode: () => o }; return o; }, XFrameOptionsMode: { ALLOWALL: 1 } };
  const ctx = vm.createContext({
    ScriptApp: { getService: () => ({ getUrl }) },
    Session: { getActiveUser: () => ({ getEmail: () => { if (email instanceof Error) throw email; return email; } }), getEffectiveUser: () => prohibido('Session.getEffectiveUser') },
    HtmlService: html,
    Logger: { log() {} },
    console: { log() {} },
    SpreadsheetApp: prohibido('SpreadsheetApp'), GmailApp: prohibido('GmailApp'), MailApp: prohibido('MailApp'), DriveApp: prohibido('DriveApp'),
    PropertiesService: prohibido('PropertiesService'), CacheService: prohibido('CacheService'), UrlFetchApp: prohibido('UrlFetchApp'),
    LockService: prohibido('LockService'), Utilities: prohibido('Utilities'), ContentService: prohibido('ContentService'),
    Drive: prohibido('Drive'),
  });
  for (const f of archivos) vm.runInContext(fuente[f], ctx, { filename: f });
  return { ctx, tocado, salidas };
}
function llamar(env, nombre, args) {
  env.tocado.length = 0;
  try { return { valor: vm.runInContext(nombre, env.ctx).apply(null, args || []) }; } catch (e) { return { error: String(e && e.message || e) }; }
}
const ARGS = [{}, {}, {}, {}];
const OPERARIO = 'operario@ext.leroymerlin.es';

// [descripción, getUrl, email, ¿deben bloquearse las cerradas?]
const CASOS = [
  ['«solo dashboard» + visitante con correo de otra persona', () => urlDe(ID_DASHBOARD_REAL), OPERARIO, true],
  ['«solo dashboard» + visitante de otro dominio (correo oculto, vacío)', () => urlDe(ID_DASHBOARD_REAL), '', true],
  ['«solo dashboard» + visitante cuyo correo no se puede leer (error)', () => urlDe(ID_DASHBOARD_REAL), new Error('sin permiso'), true],
  ['«solo dashboard» + el dueño (editor, menú o disparador que da esa dirección)', () => urlDe(ID_DASHBOARD_REAL), EMAIL_DUENO_REAL, false],
  ['producción + operario', () => urlDe(ID_PRODUCCION), OPERARIO, false],
  ['producción + correo oculto', () => urlDe(ID_PRODUCCION), '', false],
  ['dirección de un despliegue antiguo (como en un disparador) + operario', () => urlDe(ID_OTRO_ANTIGUO), OPERARIO, false],
  ['getUrl() lanza error (falla abierto) + visitante', () => { throw new Error('x'); }, OPERARIO, false],
  ['getUrl() devuelve null (falla abierto) + visitante', () => null, OPERARIO, false],
];
for (const [desc, getUrl, email, debeBloquear] of CASOS) {
  const env = crearEntorno(getUrl, email);
  const malas = [];
  for (const n of CERRADAS) {
    const r = llamar(env, n, ARGS);
    const bloqueada = r.error === MENSAJE_BLOQUEO;
    if (bloqueada !== debeBloquear) malas.push(n + (bloqueada ? ' (bloqueada)' : ' (NO bloqueada)'));
    else if (bloqueada && env.tocado.length) malas.push(n + ' toca ' + env.tocado.join(','));
  }
  if (malas.length) mal(desc + ': ' + (debeBloquear ? 'debían bloquearse' : 'no debían bloquearse') + ' → ' + malas.join('; '));
  else ok(desc + ' → ' + (debeBloquear ? 'las ' + CERRADAS.length + ' se bloquean sin tocar nada' : 'ninguna se bloquea'));
}

const dashVisitante = crearEntorno(() => urlDe(ID_DASHBOARD_REAL), OPERARIO);
const abiertas = [...DASHBOARD, ...DISPARADORES, 'filtrarHoy', 'quitarFiltro', 'obtenerEstado', 'getPlanDelDiaB2B'];
const cerradasPorError = abiertas.filter(n => llamar(dashVisitante, n, []).error === MENSAJE_BLOQUEO);
if (cerradasPorError.length) mal('en «solo dashboard» visitante se bloquean funciones que deben seguir abiertas: ' + cerradasPorError.join(', '));
else ok('«solo dashboard» visitante: siguen abiertas las del Dashboard, el disparador del informe, los filtros y las lecturas');

const prod = crearEntorno(() => urlDe(ID_PRODUCCION), OPERARIO);
const esperado = { '': 'cargas', terminal: 'cargas', cargas: 'cargas', dashboard: 'Dashboard', jefe: 'Jefe', tiendas: 'Tiendas', generix: 'Generix', xyz: 'cargas' };
for (const [vista, pantalla] of Object.entries(esperado)) {
  const rp = llamar(prod, 'doGet', [{ parameter: vista ? { view: vista } : {} }]); const sp = prod.salidas.pop();
  if (rp.error || sp !== pantalla) mal('producción ?view=' + vista + ' sirve «' + sp + '» y debía ser «' + pantalla + '»' + (rp.error ? ' (' + rp.error + ')' : ''));
  const rd = llamar(dashVisitante, 'doGet', [{ parameter: vista ? { view: vista } : {} }]); const sd = dashVisitante.salidas.pop();
  if (rd.error || sd !== 'Dashboard') mal('«solo dashboard» ?view=' + vista + ' sirve «' + sd + '» y debía ser «Dashboard»');
}
ok('doGet: producción reparte las pantallas; «solo dashboard» siempre da el Dashboard');

console.log(fallos ? '\nRESULTADO: ' + fallos + ' fallo(s). NO desplegar.' : '\nRESULTADO: todo correcto.');
process.exit(fallos ? 1 : 0);
