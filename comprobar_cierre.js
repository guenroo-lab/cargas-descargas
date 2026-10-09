// Comprueba el cierre del despliegue «solo dashboard» (ver CLAUDE.md). Ejecutar ANTES de cada despliegue:
//   node comprobar_cierre.js
// Falla (código de salida 1) si:
//  - hay una función pública (nombre sin «_» al final) que no está clasificada en las listas de abajo;
//  - una función de escritura no empieza por exigirNoSoloDashboard_();
//  - el Dashboard puede llegar (directa o indirectamente) a una función cerrada;
//  - con la URL del despliegue «solo dashboard» una función cerrada llega a tocar hojas, correo, Drive...;
//  - con la URL de producción alguna queda cerrada, o el reparto de pantallas de doGet no es el esperado.
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = path.join(__dirname, 'src');

// ───────────── CLASIFICACIÓN (editar aquí al añadir funciones públicas) ─────────────
// 1) Escriben datos / mandan correos / tocan disparadores: CERRADAS en «solo dashboard».
const CERRADAS = [
  'iniciarOperacion', 'finalizarOperacion', 'cancelarOperacion', 'migrarFechaEntrega', 'formatearRegistros', 'filtrarHoy', 'quitarFiltro',
  'escribirEnB2B', 'probarEscrituraB2B', 'jefeAnadirAlB2B', 'jefeAnularEnB2B',
  'jefeAnadirTransporte', 'jefeAnularTransporte', '_enviarCorreoGestion', '_enviarCorreoSolicitudExtra', 'enviarCorreoMijas0630',
  'enviarSugerencia', 'probarCorreo', 'probarCorreoMijas', 'reenviarCorreoMijasUltimo', 'enviarInformeSemanal', 'instalarTriggerInformeSemanal',
  'anadirCargaExtra', 'anadirProgramacionFija', 'actualizarEstadoProg',
];
// 2) Lo único que llama el Dashboard desde el navegador.
const DASHBOARD = ['obtenerDashboard', 'obtenerRankingCompleto'];
// 3) Puntos de entrada de Apps Script (no se llaman con google.script.run en la práctica).
const ENTRADA = ['doGet', 'onOpen'];
// 4) Solo leen (o son ayudantes puros): siguen abiertas a propósito. Si alguna pasara a escribir, moverla a CERRADAS.
const LECTURAS = [
  '_aMinutos', '_esAnulado', '_flujoB2B', '_horaAFraccion', '_invalidarCachePlan', '_leerPlanDelDiaB2B', '_letraCol', '_lugarB2B', '_nombreHojaB2B', '_resolverFilaAnular',
  'auditarAnuladosB2B', 'diagnosticarB2B', 'diagnosticarColumnaH', 'diagnosticarColumnas', 'diagnosticarExpediciones', 'diagnosticarFecha', 'diagnosticarHoras', 'diagnosticarPlanDia',
  'getCargasPendientesB2B', 'getPlanDelDiaB2B', 'getSiguienteDescargaTienda',
  '_ss', 'getHorasUsadasHoy', 'obtenerConfig', 'obtenerEstado',
  'obtenerEventosGenerixAgrupados',
  '_destinatariosExtraPorDestino', '_extraerIdDrive', '_fila', 'previsualizarInformeSemanal',
  'getProgramacionHoy', 'getSlotsOcupados',
];

// IDs de los dos deployments vivos (ver CLAUDE.md). Se escriben aquí a propósito, aparte del código: así el comprobador detecta si el ID del código se cambia por error.
const ID_PRODUCCION = 'AKfycby54-q25pbCrtpEUhVSNK033iE6NPEKnq3qhd-OK4Vb7VLw1oVDB6BO_leHdk9_Fx4YJA';
const ID_DASHBOARD_REAL = 'AKfycbxkUX97zEWjzYJ48OFDqZUHGJKWaKj1gE9XGJkdkOj-nUoucUPNfEtxO68kI76KTfK3hg';
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
    funcs[m[1]] = { archivo: f, cuerpo: limpio.slice(ini + 1, j), cuerpoReal: src.slice(ini + 1, j) };
  }
}
const nombres = Object.keys(funcs);
for (const n of nombres) funcs[n].llama = nombres.filter(o => o !== n && new RegExp('(^|[^A-Za-z0-9_$.])' + o.replace(/\$/g, '\\$') + '\\s*\\(').test(funcs[n].cuerpo));
const publicas = nombres.filter(n => !/_$/.test(n));

console.log('1) Clasificación de las funciones públicas (' + publicas.length + ')');
const listas = { CERRADAS, DASHBOARD, ENTRADA, LECTURAS };
for (const [nom, lista] of Object.entries(listas)) for (const n of lista) if (!funcs[n]) mal(nom + ' menciona «' + n + '», que ya no existe (quitarla de la lista)');
for (const n of publicas) {
  const en = Object.entries(listas).filter(([, l]) => l.includes(n)).map(([k]) => k);
  if (en.length === 0) mal('función pública SIN CLASIFICAR: ' + n + ' (' + funcs[n].archivo + '). Si escribe, manda correo o toca disparadores: ponle exigirNoSoloDashboard_(); como primera línea y añádela a CERRADAS. Si solo lee: a LECTURAS. Si solo la usa el código: renómbrala con «_» al final.');
  else if (en.length > 1) mal(n + ' está en varias listas: ' + en.join(', '));
}
if (!fallos) ok('todas clasificadas, ninguna repetida');

console.log('2) Las cerradas empiezan por exigirNoSoloDashboard_();');
for (const n of CERRADAS.filter(n => funcs[n])) {
  const primera = funcs[n].cuerpo.replace(/^\s+/, '').split(/\r?\n/)[0].trim();
  if (primera !== 'exigirNoSoloDashboard_();') mal(n + ': la primera sentencia es «' + primera + '»');
}
for (const n of nombres.filter(n => !CERRADAS.includes(n) && n !== 'exigirNoSoloDashboard_'))
  if (/exigirNoSoloDashboard_\s*\(/.test(funcs[n].cuerpo)) mal(n + ' llama a exigirNoSoloDashboard_ pero no está en CERRADAS');
if (!funcs['exigirNoSoloDashboard_'] || !funcs['esDeploySoloDashboard_']) mal('faltan exigirNoSoloDashboard_ o esDeploySoloDashboard_');
ok('revisadas ' + CERRADAS.length);

console.log('3) El Dashboard no puede llegar a ninguna función cerrada');
const alcanzables = new Set();
(function rec(n) { if (alcanzables.has(n) || !funcs[n]) return; alcanzables.add(n); funcs[n].llama.forEach(rec); })('doGet');
DASHBOARD.forEach(function rec2(n) { if (alcanzables.has(n) || !funcs[n]) return; alcanzables.add(n); funcs[n].llama.forEach(rec2); });
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

// ───────────── simulación de Apps Script ─────────────
console.log('5) Simulación con las URL reales de cada despliegue');
const mDash = fuente['CargasDescargas.gs'].match(/const ID_DEPLOY_SOLO_DASHBOARD = '([^']+)'/);
if (!mDash) { mal('no encuentro ID_DEPLOY_SOLO_DASHBOARD'); finalizar(); }
if (mDash[1] !== ID_DASHBOARD_REAL) mal('ID_DEPLOY_SOLO_DASHBOARD del código (' + mDash[1] + ') no es el del deployment «solo dashboard» (' + ID_DASHBOARD_REAL + '). Si se ha recreado el deployment, cambiar el ID en CargasDescargas.gs Y en este archivo');
const ID_DASH = ID_DASHBOARD_REAL;
const urlDe = (id) => 'https://script.google.com/a/ext.leroymerlin.es/macros/s/' + id + '/exec'; // formato de getUrl() medido el 2026-10-09

function crearEntorno(getUrl) {
  const tocado = [];
  const prohibido = (nombre) => new Proxy(function () {}, {
    get(_, p) { if (p === Symbol.toPrimitive || p === 'toJSON') return undefined; tocado.push(nombre + '.' + String(p)); throw new Error('TOCADO ' + nombre + '.' + String(p)); },
    apply() { tocado.push(nombre + '()'); throw new Error('TOCADO ' + nombre + '()'); },
  });
  const salidas = [];
  const html = { createHtmlOutputFromFile(n) { salidas.push(n); const o = { setTitle: () => o, addMetaTag: () => o, setXFrameOptionsMode: () => o }; return o; }, XFrameOptionsMode: { ALLOWALL: 1 } };
  const ctx = vm.createContext({
    ScriptApp: { getService: () => ({ getUrl }) },
    HtmlService: html,
    Logger: { log() {} },
    console: { log() {} },
    SpreadsheetApp: prohibido('SpreadsheetApp'), GmailApp: prohibido('GmailApp'), MailApp: prohibido('MailApp'), DriveApp: prohibido('DriveApp'),
    PropertiesService: prohibido('PropertiesService'), CacheService: prohibido('CacheService'), UrlFetchApp: prohibido('UrlFetchApp'),
    LockService: prohibido('LockService'), Utilities: prohibido('Utilities'), Session: prohibido('Session'), ContentService: prohibido('ContentService'),
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

const dash = crearEntorno(() => urlDe(ID_DASH));
for (const n of CERRADAS) {
  const r = llamar(dash, n, ARGS);
  if (r.error !== MENSAJE_BLOQUEO) mal('en «solo dashboard», ' + n + ' NO se bloquea (resultado: ' + (r.error || JSON.stringify(r.valor)) + ')');
  else if (dash.tocado.length) mal('en «solo dashboard», ' + n + ' toca ' + dash.tocado.join(', ') + ' antes de bloquearse');
}
if (!fallos) ok('«solo dashboard»: las ' + CERRADAS.length + ' cerradas se bloquean sin tocar nada');

const prod = crearEntorno(() => urlDe(ID_PRODUCCION));
let bloqueadasEnProd = 0;
for (const n of CERRADAS) { const r = llamar(prod, n, ARGS); if (r.error === MENSAJE_BLOQUEO) { bloqueadasEnProd++; mal('en PRODUCCIÓN ' + n + ' se bloquea'); } }
if (!bloqueadasEnProd) ok('producción: ninguna queda cerrada (siguen su camino normal)');

for (const [etiqueta, getUrl] of [['getUrl() lanza error', () => { throw new Error('x'); }], ['getUrl() devuelve null', () => null]]) {
  const e = crearEntorno(getUrl);
  const b = CERRADAS.filter(n => llamar(e, n, ARGS).error === MENSAJE_BLOQUEO);
  if (b.length) mal(etiqueta + ': se bloquean ' + b.join(', ') + ' (se esperaba que NO, para no parar la operativa)');
}
ok('si getUrl() falla o es null, la operativa normal no se para (decisión de diseño: falla abierto)');

for (const n of DASHBOARD) {
  const r = llamar(dash, n, []);
  if (r.error === MENSAJE_BLOQUEO) mal('en «solo dashboard», ' + n + ' está bloqueada y el Dashboard la necesita');
}
ok('las funciones del Dashboard no se bloquean en «solo dashboard»');

const esperado = { '': 'cargas', terminal: 'cargas', cargas: 'cargas', dashboard: 'Dashboard', jefe: 'Jefe', tiendas: 'Tiendas', generix: 'Generix', xyz: 'cargas' };
for (const [vista, pantalla] of Object.entries(esperado)) {
  const rp = llamar(prod, 'doGet', [{ parameter: vista ? { view: vista } : {} }]); const sp = prod.salidas.pop();
  if (rp.error || sp !== pantalla) mal('producción ?view=' + vista + ' sirve «' + sp + '» y debía ser «' + pantalla + '»' + (rp.error ? ' (' + rp.error + ')' : ''));
  const rd = llamar(dash, 'doGet', [{ parameter: vista ? { view: vista } : {} }]); const sd = dash.salidas.pop();
  if (rd.error || sd !== 'Dashboard') mal('«solo dashboard» ?view=' + vista + ' sirve «' + sd + '» y debía ser «Dashboard»');
}
ok('doGet: producción reparte las pantallas; «solo dashboard» siempre da el Dashboard');

function finalizar() {
  console.log(fallos ? '\nRESULTADO: ' + fallos + ' fallo(s). NO desplegar.' : '\nRESULTADO: todo correcto.');
  process.exit(fallos ? 1 : 0);
}
finalizar();
